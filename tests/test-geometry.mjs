// RoomSketch 2.0.0 — 几何模块测试（Node 直接导入 TS 源码，Node 24 类型剥离）
// 用法：node tests/test-geometry.mjs
// 覆盖：旋转包围盒（与 1.0.0 test-bounds 同批用例 + 独立 oracle）、
// polyArea/polyCentroid、点段投影、局部/世界坐标互逆。
import { objBounds, selectionBounds, polyArea, polyCentroid, projectToSegment, localToWorld, worldToLocal } from '../src/model/geometry.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// 独立验算：旋转局部包围盒四角（与被测代码不同的写法路径，只用三角函数）
function oracle(o) {
  const pad = (o.stroke || 10) / 2;
  let xs, ys;
  if (o.points) { xs = o.points.map(p => p[0]); ys = o.points.map(p => p[1]); }
  else if (o.type === 'dimension') { xs = [0, o.length || o.w || 0]; ys = [-70, 40]; }
  else if (o.type === 'door' || o.type === 'window') { xs = [0, o.w]; ys = [0, (o.dir || 1) * o.w]; }
  else { xs = [0, o.w || 0]; ys = [0, o.h || 0]; }
  const a = (o.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]]
    .map(([px, py]) => [(o.x || 0) + px * c - py * s, (o.y || 0) + px * s + py * c]);
  const X = pts.map(p => p[0]), Y = pts.map(p => p[1]);
  return { x: Math.min(...X) - pad, y: Math.min(...Y) - pad,
    w: Math.max(...X) - Math.min(...X) + pad * 2, h: Math.max(...Y) - Math.min(...Y) + pad * 2 };
}

const cases = [
  ['家具 2000x1000 旋转 0°', { type: 'furniture', x: 1000, y: 1000, w: 2000, h: 1000, rotation: 0, stroke: 2 }],
  ['家具 2000x1000 旋转 90°（宽高互换）', { type: 'furniture', x: 1000, y: 1000, w: 2000, h: 1000, rotation: 90, stroke: 2 }],
  ['家具 2000x1000 旋转 45°', { type: 'furniture', x: 1000, y: 1000, w: 2000, h: 1000, rotation: 45, stroke: 2 }],
  ['家具 2000x1000 旋转 180°', { type: 'furniture', x: 1000, y: 1000, w: 2000, h: 1000, rotation: 180, stroke: 2 }],
  ['墙线 3000mm 旋转 90°', { type: 'wall', x: 0, y: 0, points: [[0, 0], [3000, 0]], rotation: 90, stroke: 2 }],
  ['门 900mm 旋转 90°', { type: 'door', x: 500, y: 500, w: 900, dir: 1, rotation: 90, stroke: 2 }],
  ['门 900mm 旋转 0°', { type: 'door', x: 500, y: 500, w: 900, dir: 1, rotation: 0, stroke: 2 }],
  ['尺寸标注 5000mm 旋转 30°', { type: 'dimension', x: 0, y: 0, length: 5000, rotation: 30, stroke: 2 }],
  ['窗 1200mm 旋转 -45°', { type: 'window', x: 200, y: 300, w: 1200, dir: 1, rotation: -45, stroke: 2 }],
  ['矩形 800x600 旋转 135°', { type: 'rect', x: -500, y: -500, w: 800, h: 600, rotation: 135, stroke: 2 }],
];
for (const [label, o] of cases) {
  const got = objBounds(o), want = oracle(o);
  check(label, ['x', 'y', 'w', 'h'].every(k => approx(got[k], want[k])), `got ${JSON.stringify(got)}`);
}

// 旧 Bug 回归：旋转 90° 时包围盒宽高必须互换
const r90 = objBounds({ type: 'furniture', x: 0, y: 0, w: 2000, h: 1000, rotation: 90, stroke: 2 });
check('旧 Bug 回归：90° 宽高已互换', approx(r90.w, 1002) && approx(r90.h, 2002), JSON.stringify(r90));

// selectionBounds 是 objBounds 的别名（不再二次旋转）
const o = { type: 'furniture', x: 100, y: 100, w: 500, h: 300, rotation: 30, stroke: 2 };
check('selectionBounds 与 objBounds 一致', JSON.stringify(selectionBounds(o)) === JSON.stringify(objBounds(o)));

// 1.0.0 遗留坑：角点缩放曾用未定义的 o.h 导致 NaN——包围盒不得含 NaN
const nanCase = objBounds({ type: 'furniture', x: 0, y: 0, w: 1000, h: 500, rotation: 45, stroke: 12 });
check('包围盒无 NaN（o.h 未定义坑）', ['x', 'y', 'w', 'h'].every(k => Number.isFinite(nanCase[k])));

// polyArea / polyCentroid
check('polyArea 矩形 4000x3000 = 12m²', approx(polyArea([[0, 0], [4000, 0], [4000, 3000], [0, 3000]]), 12e6));
check('polyCentroid 矩形中心 (2000,1500)', (() => { const c = polyCentroid([[0, 0], [4000, 0], [4000, 3000], [0, 3000]]); return approx(c[0], 2000) && approx(c[1], 1500); })());

// 点段投影
const pr = projectToSegment({ x: 1000, y: 300 }, 0, 0, 4000, 0);
check('点段投影 t=0.25 距离 300', approx(pr.t, 0.25) && approx(pr.d, 300) && approx(pr.px, 1000) && approx(pr.py, 0));
const pr2 = projectToSegment({ x: 5000, y: 0 }, 0, 0, 4000, 0);
check('点段投影越端钳制 t=1', approx(pr2.t, 1) && approx(pr2.px, 4000));

// 局部/世界坐标互逆
const obj = { x: 100, y: 200, rotation: 90 };
const w = localToWorld(obj, 1000, 0);
check('localToWorld 旋转 90°', approx(w[0], 100) && approx(w[1], 1200), JSON.stringify(w));
const l = worldToLocal(obj, w[0], w[1]);
check('worldToLocal 是逆变换', approx(l[0], 1000) && approx(l[1], 0), JSON.stringify(l));

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
