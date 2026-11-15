// RoomSketch 2.0.1 — 三维场景（Three.js，阶段五）
// 墙体：每段按开口切分后用 Shape（含窗洞）+ Extrude 生成实体；
// 门洞从地面起空（上方留过梁），窗洞为 Shape 内真实孔洞（窗台 + 玻璃 + 过梁）。
// 地板：房间多边形平铺；家具：方块 / 圆柱体块。
// 全部纯函数可 Node 测试（不建 WebGLRenderer）；渲染失败由 ThreeView 隔离降级。
import * as THREE from 'three';
import type { RsObject, WallObject } from './types.ts';
import { polyArea, polyCentroid, localToWorld } from './geometry.ts';
import { WALL_H, DOOR_H, WIN_Z0, WIN_H, wallWorld } from './wallLink.ts';
import { furnKind, ROUND_KINDS, furnH3D } from './furniture.ts';

export interface WallCut { t0: number; t1: number; type: 'door' | 'window' }
export interface Floor3D { pts: [number, number][]; label: string; c: [number, number] }
export interface WallPiece3D { pts: [number, number][]; z0: number; hgt: number; glass: boolean }
export interface Item3D { pts: [number, number][]; hgt: number }
export interface Collected3D {
  floors: Floor3D[];
  walls: WallPiece3D[];
  items: Item3D[];
  unsupported: Record<string, number>;
}
export interface OpeningWarning { id: string; type: string; message: string }
export interface SceneStats {
  floors: number; wallPieces: number; glass: number; items: number;
  vertices: number; triangles: number;
}
export interface SceneBuild {
  scene: THREE.Scene;
  stats: SceneStats;
  unsupported: Record<string, number>;
  warnings: OpeningWarning[];
  box: THREE.Box3;
}

const WALL_COLOR = 0xb6c4d8;
const FLOOR_COLOR = 0xe7e1d2;
const ITEM_COLOR = 0x96b2d0;
const GLASS_COLOR = 0x35d6c8;

/** 同一墙段上的开口切分（门/窗按沿墙位置合并重叠段），与 1.0.0 r3dCollect 同一算法。 */
export function wallSegmentCuts(objects: RsObject[], wall: WallObject, seg: number): WallCut[] {
  const A = wall.points[seg], B = wall.points[seg + 1];
  if (!A || !B) return [];
  const segLen = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const cuts: WallCut[] = [];
  for (const op of objects) {
    if ((op.type === 'door' || op.type === 'window') && op.wallId === wall.id && op.wallSeg === seg) {
      const t0 = Math.max(0, Math.min(1, op.wallT || 0));
      const t1 = Math.max(0, Math.min(1, t0 + (op.w || 0) / segLen));
      if (t1 > t0) cuts.push({ t0, t1, type: op.type });
    }
  }
  cuts.sort((a, b) => a.t0 - b.t0);
  const merged: WallCut[] = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.t0 <= last.t1) {
      last.t1 = Math.max(last.t1, c.t1);
      if (c.type === 'door') last.type = 'door';
    } else merged.push({ ...c });
  }
  return merged;
}

/**
 * 收集三维体块（1.0.0 r3dCollect 的移植，纯函数）。
 * 墙段按开口切分：门洞留空 + 2100 过梁；窗洞 900 窗台 + 1300 玻璃 + 上方过梁。
 */
export function collect3D(objects: RsObject[]): Collected3D {
  const floors: Floor3D[] = [], walls: WallPiece3D[] = [], items: Item3D[] = [];
  const W = (o: RsObject, lx: number, ly: number): [number, number] => localToWorld(o, lx, ly);
  for (const o of objects) {
    const rot = (o.rotation || 0) * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot);
    const WL = (lx: number, ly: number): [number, number] => [
      (o.x || 0) + lx * cs - ly * sn, (o.y || 0) + lx * sn + ly * cs,
    ];
    if (o.type === 'polyroom') {
      const c = polyCentroid(o.points);
      floors.push({
        pts: o.points.map(p => W(o, p[0], p[1])),
        label: o.label || `≈ ${(polyArea(o.points) / 1e6).toFixed(1)} m²`,
        c: W(o, c[0], c[1]),
      });
    } else if (o.type === 'wall') {
      const hw = (o.wallWidth || 120) / 2, pts = o.points, wh = o.wallHeight || WALL_H;
      const quad = (a: [number, number], b: [number, number]): [number, number][] => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * hw, ny = dx / len * hw;
        return [
          [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
          [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny],
        ].map(p => W(o, p[0], p[1]));
      };
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const cuts = wallSegmentCuts(objects, o, i);
        const put = (t0: number, t1: number, z0: number, hgt: number, glass: boolean) => {
          if (t1 <= t0 || hgt <= 0) return;
          const A: [number, number] = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
          const B: [number, number] = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          walls.push({ pts: quad(A, B), hgt, z0, glass });
        };
        let cur = 0;
        for (const c of cuts) {
          put(cur, c.t0, 0, wh, false);
          if (c.type === 'window') {
            put(c.t0, c.t1, 0, WIN_Z0, false);
            put(c.t0, c.t1, WIN_Z0, WIN_H, true);
            put(c.t0, c.t1, WIN_Z0 + WIN_H, wh - (WIN_Z0 + WIN_H), false);
          } else {
            put(c.t0, c.t1, DOOR_H, wh - DOOR_H, false);
          }
          cur = c.t1;
        }
        put(cur, 1, 0, wh, false);
      }
    } else if (o.type === 'furniture') {
      const fk = furnKind(o.label);
      const fw = o.w || 100, fh = o.h || 100;
      let fpts: [number, number][];
      if (ROUND_KINDS.includes(fk)) {
        fpts = [];
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * 2 * Math.PI;
          fpts.push([fw / 2 + fw / 2 * Math.cos(a), fh / 2 + fh / 2 * Math.sin(a)]);
        }
      } else {
        fpts = [[0, 0], [fw, 0], [fw, fh], [0, fh]];
      }
      items.push({ pts: fpts.map(p => WL(p[0], p[1])), hgt: Number(o.furnH) > 0 ? Number(o.furnH) : furnH3D(o.label) });
    } else if (o.type === 'window' && !o.wallId) {
      // 未关联的窗单独成玻璃块（已关联的窗由墙段开口处绘制，不再单独成块）。
      walls.push({
        pts: [[0, -45], [o.w, -45], [o.w, 45], [0, 45]].map(p => WL(p[0], p[1])),
        hgt: WIN_H, z0: WIN_Z0, glass: true,
      });
    }
  }
  const unsupported: Record<string, number> = {};
  for (const o of objects) {
    const shown = ['polyroom', 'wall', 'furniture', 'window'].includes(o.type) || (o.type === 'door' && !!o.wallId);
    if (!shown) unsupported[o.type] = (unsupported[o.type] || 0) + 1;
  }
  return { floors, walls, items, unsupported };
}

/** 开口校验：关联失效、超出墙段、同一墙段重叠均逐条警告（不静默丢弃）。 */
export function validateOpenings(objects: RsObject[]): OpeningWarning[] {
  const warnings: OpeningWarning[] = [];
  const bySeg = new Map<string, { id: string; type: string; t0: number; t1: number }[]>();
  for (const o of objects) {
    if (o.type !== 'door' && o.type !== 'window') continue;
    if (!o.wallId) continue;
    const w = objects.find(x => x.id === o.wallId && x.type === 'wall') as WallObject | undefined;
    if (!w) { warnings.push({ id: o.id, type: o.type, message: '关联的墙体不存在（已脱离墙体）' }); continue; }
    if (!Number.isInteger(o.wallSeg) || (o.wallSeg as number) < 0 || (o.wallSeg as number) >= (w.points?.length - 1)) {
      warnings.push({ id: o.id, type: o.type, message: `墙段号 ${String(o.wallSeg)} 越界（墙体共 ${w.points.length - 1} 段）` });
      continue;
    }
    const A = w.points[o.wallSeg as number], B = w.points[(o.wallSeg as number) + 1];
    const segLen = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    if (!Number.isFinite(o.wallT) || (o.wallT as number) < 0 || (o.wallT as number) > 1) {
      warnings.push({ id: o.id, type: o.type, message: `沿墙位置 wallT=${String(o.wallT)} 无效` });
      continue;
    }
    const t0 = o.wallT || 0, t1 = t0 + (o.w || 0) / segLen;
    if (t1 > 1 + 1e-9) warnings.push({ id: o.id, type: o.type, message: '门窗超出墙段末端（3D 已按墙段截断）' });
    const key = `${w.id}#${o.wallSeg}`;
    const list = bySeg.get(key) ?? [];
    list.push({ id: o.id, type: o.type, t0, t1: Math.min(1, t1) });
    bySeg.set(key, list);
  }
  for (const list of bySeg.values()) {
    list.sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < list.length; i++) {
      if (list[i].t0 < list[i - 1].t1 - 1e-9) {
        warnings.push({ id: list[i].id, type: list[i].type, message: '与同一墙段上的另一开口重叠（3D 已合并）' });
      }
    }
  }
  return warnings;
}

/** WebGL 能力探测（不抛错；无 document 的环境直接返回不可用）。 */
export function probeWebGL(): { ok: boolean; reason: string } {
  try {
    if (typeof document === 'undefined') return { ok: false, reason: '无 document（非浏览器环境）' };
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as unknown;
    if (!gl) return { ok: false, reason: 'canvas.getContext(webgl) 返回 null' };
    return { ok: true, reason: 'webgl 上下文可用' };
  } catch (e) {
    return { ok: false, reason: 'getContext 抛错：' + String(e) };
  }
}

/**
 * 墙段局部矩形 → Extrude 几何。
 * 局部坐标：x 沿墙段（0..segLen），y 为高度（0..wh），z 为墙厚（0..wallWidth）。
 * windows 为该矩形内的窗洞（x 沿墙段、y 900..2200）；孔洞必须严格位于矩形内，
 * 否则退化——贴边/越界的窗洞会被裁剪到矩形内 1mm，裁后不足 1mm 则忽略该洞
 * （玻璃仍按原位置渲染，validateOpenings 会提示）。
 */
function wallRunGeometry(
  segLen: number, wallWidth: number, wh: number,
  x0: number, x1: number, y0: number, y1: number,
  windows: { x0: number; x1: number }[],
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(x1, y1);
  shape.lineTo(x0, y1);
  shape.closePath();
  for (const w of windows) {
    const hx0 = Math.max(x0 + 1, w.x0), hx1 = Math.min(x1 - 1, w.x1);
    const hy0 = Math.max(y0 + 1, WIN_Z0), hy1 = Math.min(y1 - 1, WIN_Z0 + WIN_H);
    if (hx1 - hx0 < 1 || hy1 - hy0 < 1) continue;
    const hole = new THREE.Path();
    hole.moveTo(hx0, hy0);
    hole.lineTo(hx1, hy0);
    hole.lineTo(hx1, hy1);
    hole.lineTo(hx0, hy1);
    hole.closePath();
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: wallWidth, bevelEnabled: false });
}

/** 墙段局部坐标 → 世界矩阵：局部 x 沿墙段、y 朝上、z 沿墙厚；平移到墙段起点并居中墙厚。 */
function wallPieceMatrix(
  A: [number, number], angleDeg: number, wallWidth: number,
): THREE.Matrix4 {
  const phi = angleDeg * Math.PI / 180;
  const nx = -Math.sin(phi), ny = Math.cos(phi);
  const m = new THREE.Matrix4().makeRotationZ(phi)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  m.setPosition(A[0] + nx * wallWidth / 2, A[1] + ny * wallWidth / 2, 0);
  return m;
}

const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9, metalness: 0 });
const floorMat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 1, metalness: 0, side: THREE.DoubleSide });
const itemMat = new THREE.MeshStandardMaterial({ color: ITEM_COLOR, roughness: 0.85, metalness: 0 });
const glassMat = new THREE.MeshStandardMaterial({
  color: GLASS_COLOR, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.35,
});

/** 从工程对象构建 Three.js 场景（不建 Renderer；WebGL 检测与渲染隔离在 ThreeView）。 */
export function buildScene(objects: RsObject[]): SceneBuild {
  const scene = new THREE.Scene();
  const warnings = validateOpenings(objects);
  const collected = collect3D(objects);
  let wallPieces = 0, glass = 0;

  for (const o of objects) {
    if (o.type !== 'wall') continue;
    const wallWidth = o.wallWidth || 120, wh = o.wallHeight || WALL_H;
    for (let i = 0; i < o.points.length - 1; i++) {
      const A = wallWorld(o, o.points[i]), B = wallWorld(o, o.points[i + 1]);
      const segLen = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
      const cuts = wallSegmentCuts(objects, o, i);
      // 按门洞切分 runs；每 run 内的窗洞做 Shape 孔洞；门洞上方单独做过梁 run。
      const runs: { x0: number; x1: number; y0: number; y1: number; windows: { x0: number; x1: number }[] }[] = [];
      let cur = 0;
      for (const c of cuts) {
        if (c.t0 > cur) runs.push({ x0: cur * segLen, x1: c.t0 * segLen, y0: 0, y1: wh, windows: [] });
        if (c.type === 'door') {
          if (wh > DOOR_H) runs.push({ x0: c.t0 * segLen, x1: c.t1 * segLen, y0: DOOR_H, y1: wh, windows: [] });
        }
        cur = c.t1;
      }
      if (cur < 1) runs.push({ x0: cur * segLen, x1: segLen, y0: 0, y1: wh, windows: [] });
      for (const c of cuts) {
        if (c.type !== 'window') continue;
        for (const r of runs) {
          if (r.y0 === 0 && c.t0 * segLen >= r.x0 - 1e-9 && c.t1 * segLen <= r.x1 + 1e-9) {
            r.windows.push({ x0: c.t0 * segLen, x1: c.t1 * segLen });
          }
        }
      }
      for (const r of runs) {
        if (r.x1 - r.x0 < 1 || r.y1 - r.y0 < 1) continue;
        const geo = wallRunGeometry(segLen, wallWidth, wh, r.x0, r.x1, r.y0, r.y1, r.windows);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(wallPieceMatrix(A, ang, wallWidth));
        scene.add(mesh);
        wallPieces++;
      }
      // 窗玻璃：薄盒，位于窗洞中心。
      for (const c of cuts) {
        if (c.type !== 'window') continue;
        const mid = (c.t0 + c.t1) / 2;
        const px = A[0] + (B[0] - A[0]) * mid, py = A[1] + (B[1] - A[1]) * mid;
        const len = (c.t1 - c.t0) * segLen;
        const geo = new THREE.BoxGeometry(Math.max(1, len), Math.max(1, wallWidth * 0.5), WIN_H);
        const mesh = new THREE.Mesh(geo, glassMat);
        mesh.position.set(px, py, WIN_Z0 + WIN_H / 2);
        mesh.rotation.z = ang * Math.PI / 180;
        scene.add(mesh);
        glass++;
      }
    }
  }

  for (const f of collected.floors) {
    const shape = new THREE.Shape();
    f.pts.forEach((p, i) => { if (i === 0) shape.moveTo(p[0], p[1]); else shape.lineTo(p[0], p[1]); });
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
    mesh.position.z = 2;
    scene.add(mesh);
  }

  for (const o of objects) {
    if (o.type !== 'furniture') continue;
    const fk = furnKind(o.label);
    const fw = o.w || 100, fh = o.h || 100;
    const hgt = Number(o.furnH) > 0 ? Number(o.furnH) : furnH3D(o.label);
    let geo: THREE.BufferGeometry;
    if (ROUND_KINDS.includes(fk)) {
      geo = new THREE.CylinderGeometry(Math.min(fw, fh) / 2, Math.min(fw, fh) / 2, hgt, 32);
      geo.rotateX(Math.PI / 2); // 圆柱轴线 Y→Z（朝上）
    } else {
      geo = new THREE.BoxGeometry(fw, fh, hgt);
    }
    const mesh = new THREE.Mesh(geo, itemMat);
    const c = localToWorld(o, fw / 2, fh / 2);
    mesh.position.set(c[0], c[1], hgt / 2);
    mesh.rotation.z = (o.rotation || 0) * Math.PI / 180;
    scene.add(mesh);
  }

  // 未关联窗的独立玻璃块（collect3D 的 walls 里 glass=true 的独立块）。
  for (const o of objects) {
    if (o.type !== 'window' || o.wallId) continue;
    const c = localToWorld(o, (o.w || 0) / 2, 0);
    const geo = new THREE.BoxGeometry(Math.max(1, o.w || 0), 90, WIN_H);
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.position.set(c[0], c[1], WIN_Z0 + WIN_H / 2);
    mesh.rotation.z = (o.rotation || 0) * Math.PI / 180;
    scene.add(mesh);
    glass++;
  }

  // 灯光（按包围盒中心定位，避免固定坐标在超大图纸上失效）。
  const box = new THREE.Box3();
  const allPts: [number, number][] = [];
  for (const f of collected.floors) allPts.push(...f.pts);
  for (const w of collected.walls) allPts.push(...w.pts);
  for (const it of collected.items) allPts.push(...it.pts);
  if (allPts.length) {
    const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1000);
    box.setFromObject(scene);
    const light = new THREE.DirectionalLight(0xffffff, 1.4);
    light.position.set(cx + span * 0.6, cy - span * 0.6, span * 0.9);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  } else {
    box.makeEmpty();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  }

  let vertices = 0, triangles = 0;
  scene.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!g || !g.attributes?.position) return;
    vertices += g.attributes.position.count;
    const idx = g.index;
    triangles += idx ? idx.count / 3 : g.attributes.position.count / 3;
  });

  return {
    scene,
    stats: { floors: collected.floors.length, wallPieces, glass, items: collected.items.length, vertices, triangles: Math.round(triangles) },
    unsupported: collected.unsupported,
    warnings,
    box,
  };
}

/** 按包围盒把相机摆到等轴测视角（yaw 35° / pitch 32°，与 1.0.0 的 3D 初视角一致）。
 * 注意：场景是 Z 朝上，相机 up 必须设为世界 Z，否则默认 up=(0,1,0)
 * （平面 Y 轴）会让画面倾斜、取景裁切。 */
export function fitCameraToBox(
  camera: THREE.PerspectiveCamera, box: THREE.Box3, aspect: number,
  yawDeg = 35, pitchDeg = 32, zoom = 1,
): void {
  const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? new THREE.Vector3(4000, 3000, 2800) : box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1000);
  const dist = span * 1.5 / Math.max(0.1, zoom);
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
  camera.aspect = aspect;
  camera.near = Math.max(1, dist / 100);
  camera.far = dist * 20;
  camera.up.set(0, 0, 1);
  camera.position.set(
    center.x + Math.cos(pitch) * Math.sin(yaw) * dist,
    center.y - Math.cos(pitch) * Math.cos(yaw) * dist,
    center.z + Math.sin(pitch) * dist,
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}
