// RoomSketch 2.0.1 — 三维场景测试（Node 直接导入 TS 源码，Node 24 类型剥离）
// 用法：node tests/test-three.mjs
// 覆盖：collect3D 墙段开口切分（门洞留空+过梁、窗洞窗台+玻璃+过梁、
// 未关联窗独立玻璃块、未关联门计入 unsupported）、开口校验、
// buildScene 几何（Shape+洞 Extrude 的世界包围盒、孔洞真实存在、
// 旋转墙体）、probeWebGL 非浏览器环境不抛错。
// 注意：不建 WebGLRenderer（Node 无 WebGL）；渲染隔离在 ThreeView，实浏见冒烟。
import * as THREE from 'three';
import {
  collect3D, validateOpenings, buildScene, probeWebGL, wallSegmentCuts, fitCameraToBox,
} from '../src/model/threeScene.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

const wall = (x2 = 4000, extra = {}) => ({
  id: 'w1', type: 'wall', x: 0, y: 0, points: [[0, 0], [x2, 0]], wallWidth: 120, ...extra,
});
const door = (wallT, w = 900) => ({ id: 'd1', type: 'door', x: 0, y: 0, w, dir: 1, wallId: 'w1', wallSeg: 0, wallT });
const win = (wallT, w = 1200) => ({ id: 'wn1', type: 'window', x: 0, y: 0, w, wallId: 'w1', wallSeg: 0, wallT });

// ---------- collect3D ----------
{
  const c = collect3D([]);
  check('空工程收集为空', !c.floors.length && !c.walls.length && !c.items.length && !Object.keys(c.unsupported).length);
}
{
  const c = collect3D([wall()]);
  check('单墙 1 段满高', c.walls.length === 1 && c.walls[0].z0 === 0 && c.walls[0].hgt === 2800 && !c.walls[0].glass,
    `pieces=${c.walls.length}`);
  const xs = c.walls[0].pts.map(p => p[0]), ys = c.walls[0].pts.map(p => p[1]);
  check('单墙包围盒 x 0..4000 y ±60', approx(Math.min(...xs), 0) && approx(Math.max(...xs), 4000)
    && approx(Math.min(...ys), -60) && approx(Math.max(...ys), 60), `x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`);
}
{
  const c = collect3D([wall(), door(0.25)]);
  check('门洞切 3 段（间隙+过梁）', c.walls.length === 3, `pieces=${c.walls.length}`);
  const lintel = c.walls.find(p => p.z0 === 2100);
  check('门过梁 z0=2100 hgt=700', !!lintel && lintel.hgt === 700, lintel ? `hgt=${lintel.hgt}` : '无过梁');
  const midCovered = c.walls.some(p => p.z0 === 0 && Math.min(...p.pts.map(q => q[0])) < 1450 && Math.max(...p.pts.map(q => q[0])) > 1450);
  check('门洞处地面层无墙体（镂空）', !midCovered);
}
{
  const c = collect3D([wall(), win(0.5)]);
  check('窗洞切 5 段（两侧+窗台+玻璃+过梁）', c.walls.length === 5, `pieces=${c.walls.length}`);
  const glass = c.walls.filter(p => p.glass);
  check('窗玻璃 1 块 z0=900 hgt=1300', glass.length === 1 && glass[0].z0 === 900 && glass[0].hgt === 1300,
    glass.length ? `z0=${glass[0].z0} hgt=${glass[0].hgt}` : '无玻璃');
  const sill = c.walls.find(p => p.z0 === 0 && p.hgt === 900);
  const top = c.walls.find(p => p.z0 === 2200);
  check('窗台 900 与上方过梁 2200', !!sill && !!top && top.hgt === 600, `sill=${!!sill} top=${top ? top.hgt : '-'}`);
}
{
  const c = collect3D([{ id: 'wn9', type: 'window', x: 1000, y: 1000, w: 1500 }]);
  check('未关联窗独立成玻璃块', c.walls.length === 1 && c.walls[0].glass && c.walls[0].z0 === 900 && c.walls[0].hgt === 1300,
    `pieces=${c.walls.length}`);
}
{
  const c = collect3D([{ id: 'd9', type: 'door', x: 0, y: 0, w: 900, dir: 1 }]);
  check('未关联门计入 unsupported、不生成墙体', c.walls.length === 0 && c.unsupported.door === 1,
    JSON.stringify(c.unsupported));
}
{
  const c = collect3D([
    { id: 'r1', type: 'polyroom', x: 0, y: 0, points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
    { id: 'f1', type: 'furniture', x: 500, y: 500, w: 2000, h: 1500, label: '双人床' },
    { id: 'f2', type: 'furniture', x: 3000, y: 500, w: 1200, h: 1200, label: '圆桌' },
    { id: 'l1', type: 'label', x: 0, y: 0, label: '客厅' },
  ]);
  check('房间地板 1 个、家具 2 个', c.floors.length === 1 && c.items.length === 2, `floors=${c.floors.length} items=${c.items.length}`);
  check('双人床高 550', c.items[0].hgt === 550, `hgt=${c.items[0].hgt}`);
  check('圆桌 24 边形', c.items[1].pts.length === 24, `pts=${c.items[1].pts.length}`);
  check('文字标注计入 unsupported', c.unsupported.label === 1, JSON.stringify(c.unsupported));
}
{
  const c = collect3D([wall(4000, { rotation: 90 })]);
  const xs = c.walls[0].pts.map(p => p[0]), ys = c.walls[0].pts.map(p => p[1]);
  check('旋转 90° 墙包围盒 x ±60 y 0..4000', approx(Math.min(...xs), -60) && approx(Math.max(...xs), 60)
    && approx(Math.min(...ys), 0) && approx(Math.max(...ys), 4000), `x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`);
}
{
  const c = collect3D([wall(4000, { wallHeight: 3000 })]);
  check('自定义墙高 3000 生效', c.walls[0].hgt === 3000, `hgt=${c.walls[0].hgt}`);
}
{
  const cuts = wallSegmentCuts([wall(), door(0.25), win(0.6, 600)], wall(), 0);
  check('同段门+窗切分合并排序', cuts.length === 2 && cuts[0].type === 'door' && cuts[1].type === 'window',
    JSON.stringify(cuts));
}

// ---------- validateOpenings ----------
check('合法关联无警告', validateOpenings([wall(), door(0.25)]).length === 0);
check('关联墙不存在警告', validateOpenings([door(0.25)]).some(w => /不存在/.test(w.message)));
check('墙段号越界警告', validateOpenings([wall(), { ...door(0.25), wallSeg: 5 }]).some(w => /越界/.test(w.message)));
check('wallT 无效警告', validateOpenings([wall(), { ...door(0.25), wallT: 1.5 }]).some(w => /无效/.test(w.message)));
check('超出墙段末端警告', validateOpenings([wall(1000), win(0.8, 900)]).some(w => /超出墙段末端/.test(w.message)));
check('同段重叠警告', validateOpenings([wall(), door(0.25), win(0.3, 600)]).some(w => /重叠/.test(w.message)));

// ---------- buildScene（几何，不建 Renderer） ----------
{
  const b = buildScene([wall()]);
  check('单墙场景包围盒 x 0..4000 y ±60 z 0..2800',
    approx(b.box.min.x, 0) && approx(b.box.max.x, 4000)
    && approx(b.box.min.y, -60) && approx(b.box.max.y, 60)
    && approx(b.box.min.z, 0) && approx(b.box.max.z, 2800),
    `min=${b.box.min.toArray().map(v => v.toFixed(1))} max=${b.box.max.toArray().map(v => v.toFixed(1))}`);
  check('单墙统计 1 段 0 玻璃', b.stats.wallPieces === 1 && b.stats.glass === 0, JSON.stringify(b.stats));
}
{
  const plain = buildScene([wall()]);
  const withWin = buildScene([wall(), win(0.5)]);
  check('窗洞墙段数 2、玻璃 1', withWin.stats.wallPieces === 2 && withWin.stats.glass === 1, JSON.stringify(withWin.stats));
  check('窗洞 Shape 真有孔（三角形数大于实心墙）', withWin.stats.triangles > plain.stats.triangles,
    `plain=${plain.stats.triangles} win=${withWin.stats.triangles}`);
  const withDoor = buildScene([wall(), door(0.25)]);
  check('门洞墙段数 3（两侧+过梁）、玻璃 0', withDoor.stats.wallPieces === 3 && withDoor.stats.glass === 0,
    JSON.stringify(withDoor.stats));
  check('门洞不增加玻璃', withDoor.stats.glass === 0);
}
{
  const b = buildScene([wall(4000, { rotation: 90 })]);
  check('旋转墙场景包围盒 x ±60 y 0..4000',
    approx(b.box.min.x, -60) && approx(b.box.max.x, 60)
    && approx(b.box.min.y, 0) && approx(b.box.max.y, 4000),
    `min=${b.box.min.toArray().map(v => v.toFixed(1))} max=${b.box.max.toArray().map(v => v.toFixed(1))}`);
}
{
  const b = buildScene([]);
  check('空工程建场景不抛错、包围盒为空', b.box.isEmpty() && b.stats.wallPieces === 0 && b.stats.floors === 0,
    `empty=${b.box.isEmpty()}`);
}
{
  const b = buildScene([
    { id: 'r1', type: 'polyroom', x: 0, y: 0, points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
    { id: 'f1', type: 'furniture', x: 500, y: 500, w: 2000, h: 1500, label: '双人床' },
  ]);
  check('地板+家具场景统计', b.stats.floors === 1 && b.stats.items === 1 && b.stats.vertices > 0,
    JSON.stringify(b.stats));
  check('场景包围盒 z 到 550（床高）', approx(b.box.max.z, 550), `maxZ=${b.box.max.z}`);
}
{
  const b = buildScene([wall(), { id: 'wn9', type: 'window', x: 1000, y: 1000, w: 1500 }]);
  check('未关联窗玻璃计入统计', b.stats.glass === 1, JSON.stringify(b.stats));
}

// ---------- fitCameraToBox ----------
{
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 1, 100000);
  const box = new THREE.Box3(new THREE.Vector3(0, -60, 0), new THREE.Vector3(4000, 3000, 2800));
  fitCameraToBox(cam, box, 16 / 9);
  check('相机 up 为世界 Z（Z 朝上场景，不倾斜）', cam.up.x === 0 && cam.up.y === 0 && cam.up.z === 1,
    `up=${cam.up.toArray()}`);
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const toCenter = new THREE.Vector3(2000, 1470, 1400).sub(cam.position).normalize();
  check('相机朝向包围盒中心', dir.distanceTo(toCenter) < 0.01, `dir=${dir.toArray().map(v => v.toFixed(3))}`);
}

// ---------- probeWebGL ----------
{
  let r;
  try { r = probeWebGL(); } catch (e) { r = { ok: true, reason: 'threw: ' + String(e) }; }
  check('Node 环境 probeWebGL 不抛错且返回不可用', r.ok === false, JSON.stringify(r));
}

// ---------- THREE 可用性 ----------
check('THREE.REVISION 为 r182', THREE.REVISION === '182', THREE.REVISION);

if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
