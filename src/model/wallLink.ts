// RoomSketch 2.0.0 — 门窗与墙体关联（文档 §6.3，移植 1.0.0 阶段三）
// 关联模型：贴墙创建的门窗记录 wallId / wallSeg / wallT（锚点 = 门窗原点
// 在墙段上的投影）。墙体移动 / 改形时按同一锚点重算门窗位置与角度；
// 删墙后门窗保留在原位，转为未关联（待关联）状态。
import type { OpeningObject, RsObject, WallObject } from './types.ts';
import { localToWorld, projectToSegment } from './geometry.ts';

export const WALL_SNAP_DIST = 600; // 贴墙判定距离（mm），与创建时一致
export const WALL_H = 2800; // 墙体默认高度（mm）
export const DOOR_H = 2100; // 3D 门洞高度（mm）
export const WIN_Z0 = 900; // 3D 窗台高度（mm）
export const WIN_H = 1300; // 3D 窗户高度（mm）

export function isOpening(o: RsObject): o is OpeningObject {
  return o.type === 'door' || o.type === 'window';
}

/** 墙体局部点 → 世界点（墙体自身可能旋转）。 */
export function wallWorld(w: WallObject, p: [number, number]): [number, number] {
  return localToWorld(w, p[0], p[1]);
}

/** 墙段上 t 处的世界点 + 墙段角度。 */
export function wallPointAt(w: WallObject, seg: number, t: number): { x: number; y: number; ang: number } {
  const A = wallWorld(w, w.points[seg]), B = wallWorld(w, w.points[seg + 1]);
  return {
    x: A[0] + (B[0] - A[0]) * t,
    y: A[1] + (B[1] - A[1]) * t,
    ang: Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI,
  };
}

/** 最近墙段投影（全部墙体 + 全部墙段）。 */
export function snapToWall(objects: RsObject[], pt: { x: number; y: number }): {
  d: number; px: number; py: number; ang: number; wallId: string; seg: number; t: number;
} | null {
  let best: { d: number; px: number; py: number; ang: number; wallId: string; seg: number; t: number } | null = null;
  for (const o of objects) {
    if (o.type !== 'wall') continue;
    for (let i = 0; i < o.points.length - 1; i++) {
      const A = wallWorld(o, o.points[i]), B = wallWorld(o, o.points[i + 1]);
      const r = projectToSegment(pt, A[0], A[1], B[0], B[1]);
      if (!best || r.d < best.d) {
        best = {
          d: r.d, px: r.px, py: r.py,
          ang: Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI,
          wallId: o.id, seg: i, t: r.t,
        };
      }
    }
  }
  return best;
}

/** 按锚点重算单个门窗的位置与角度；关联失效返回 false。 */
export function syncOpening(objects: RsObject[], o: OpeningObject): boolean {
  if (!o || !o.wallId) return false;
  const w = objects.find(x => x.id === o.wallId && x.type === 'wall') as WallObject | undefined;
  if (!w || !Number.isInteger(o.wallSeg) || (o.wallSeg as number) < 0 || (o.wallSeg as number) >= (w.points?.length - 1)) return false;
  const p = wallPointAt(w, o.wallSeg as number, Math.max(0, Math.min(1, o.wallT || 0)));
  o.x = p.x; o.y = p.y; o.rotation = p.ang;
  return true;
}

/** 墙体变化后同步其全部附着门窗。 */
export function syncWallOpenings(objects: RsObject[], w: WallObject): void {
  if (!w) return;
  for (const o of objects) if (isOpening(o) && o.wallId === w.id) syncOpening(objects, o);
}

export function detachOpening(o: OpeningObject): void {
  if (!o) return;
  o.wallId = null; o.wallSeg = null; o.wallT = null;
}

/** 删墙时把附着门窗转为待关联，返回脱离数量。 */
export function detachWallOpenings(objects: RsObject[], wallId: string): number {
  let n = 0;
  for (const o of objects) if (isOpening(o) && o.wallId === wallId) { detachOpening(o); n++; }
  return n;
}

/** 尝试把门窗吸附到最近墙体（距离内）；失败返回 false。 */
export function tryAttach(objects: RsObject[], o: OpeningObject, maxDist?: number): boolean {
  if (!o || !isOpening(o)) return false;
  const s = snapToWall(objects, { x: o.x || 0, y: o.y || 0 });
  if (!s || s.d > (maxDist ?? WALL_SNAP_DIST)) return false;
  o.wallId = s.wallId; o.wallSeg = s.seg; o.wallT = s.t;
  o.x = s.px; o.y = s.py; o.rotation = s.ang;
  return true;
}

/** 拖动门窗后重新吸附；吸附不到则脱离。 */
export function relocateOpening(objects: RsObject[], o: OpeningObject): boolean {
  if (!o) return false;
  if (!tryAttach(objects, o)) detachOpening(o);
  return true;
}

/** 沿墙滑动（方向键微移门窗时）：在原墙上找最近投影，超距则脱离。 */
export function slideOpening(objects: RsObject[], o: OpeningObject): boolean {
  if (!o || !o.wallId) return false;
  const w = objects.find(x => x.id === o.wallId && x.type === 'wall') as WallObject | undefined;
  if (!w || !w.points?.length) return false;
  let best: { d: number; px: number; py: number; seg: number; t: number; ang: number } | null = null;
  for (let i = 0; i < w.points.length - 1; i++) {
    const A = wallWorld(w, w.points[i]), B = wallWorld(w, w.points[i + 1]);
    const r = projectToSegment({ x: o.x, y: o.y }, A[0], A[1], B[0], B[1]);
    if (!best || r.d < best.d) {
      best = { d: r.d, px: r.px, py: r.py, seg: i, t: r.t, ang: Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI };
    }
  }
  if (!best || best.d > WALL_SNAP_DIST) { detachOpening(o); return false; }
  o.wallSeg = best.seg; o.wallT = best.t; o.x = best.px; o.y = best.py; o.rotation = best.ang;
  return true;
}

/** 打开工程 / 恢复备份后校验全部关联（墙不存在、段号越界、wallT 非有限则脱离）。 */
export function normalizeOpenings(objects: RsObject[]): void {
  for (const o of objects) {
    if (isOpening(o)) {
      if (o.wallId) {
        const w = objects.find(x => x.id === o.wallId && x.type === 'wall') as WallObject | undefined;
        if (!w || !Number.isInteger(o.wallSeg) || (o.wallSeg as number) < 0 ||
            (o.wallSeg as number) >= (w.points?.length - 1) || !Number.isFinite(o.wallT as number)) {
          detachOpening(o);
        } else syncOpening(objects, o);
      }
    }
  }
}
