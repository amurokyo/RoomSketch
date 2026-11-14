// RoomSketch 1.0.0 — 旋转包围盒单测
// 用法：node tests/test-bounds.mjs
// 从 index.html 中提取真正的 objBounds() 源码并执行，而不是测一份副本。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf-8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(o){`);
  if (start === -1) throw new Error(`${name} not found in index.html`);
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const fnSrc = extractFunction(html, 'objBounds');
// eslint-disable-next-line no-new-func
const objBounds = new Function(`${fnSrc}; return objBounds;`)();

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
let failures = 0;
function check(label, got, want) {
  const ok = ['x', 'y', 'w', 'h'].every(k => approx(got[k], want[k], 0.01));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failures++;
}
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
];
for (const [label, o] of cases) check(label, objBounds(o), oracle(o));

// 旧 Bug 回归：旋转 90° 时包围盒宽高必须互换，旧 objBounds 会原样返回 2000x1000
const r90 = objBounds({ type: 'furniture', x: 0, y: 0, w: 2000, h: 1000, rotation: 90, stroke: 2 });
if (!(approx(r90.w, 1002) && approx(r90.h, 2002))) { console.log('FAIL 旧 Bug 回归：90° 未互换'); failures++; }
else console.log('PASS 旧 Bug 回归：90° 宽高已互换');

// selectionBounds 不再二次旋转
if (!html.includes('function selectionBounds(o){return objBounds(o)}')) {
  console.log('FAIL selectionBounds 不是 objBounds 的别名'); failures++;
} else console.log('PASS selectionBounds 是 objBounds 的别名');

if (failures) { console.error(`${failures} 个测试失败`); process.exit(1); }
console.log('全部通过');
