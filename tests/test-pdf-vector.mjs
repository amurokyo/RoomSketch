// RoomSketch 2.0.1 — PDF.js 矢量提取测试
// 用法：node tests/test-pdf-vector.mjs
// 覆盖：多页文档加载、逐页信息（尺寸/矢量数/Form 标记）、
// 第 1 页矢量提取（含 Form XObject 内容）、贝塞尔展平 v/y 正确性
// （1.0.0 的 v/y 展平公式是错的，此处按规范验算中点）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPdfDocument, flattenCubic, setPdfWorkerCode } from '../src/model/pdfVector.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ---- 贝塞尔展平（纯函数，不依赖浏览器） ----
// c：P0(0,0) P1(0,100) P2(100,100) P3(100,0)，t=0.5 时为 (50,75)
{
  const out = [];
  flattenCubic([0, 0], [0, 100], [100, 100], [100, 0], out);
  const mid = out[5]; // i=6 → t=0.5
  check('c 展平中点 (50,75)', approx(mid[0], 50) && approx(mid[1], 75), JSON.stringify(mid));
  check('c 展平 12 段、终点 (100,0)', out.length === 12 && approx(out[11][0], 100) && approx(out[11][1], 0));
}
// v：P1=P0=(0,0)，P2(100,100)，P3(100,0) → t=0.5 时 (50,37.5)
{
  const out = [];
  flattenCubic([0, 0], [0, 0], [100, 100], [100, 0], out);
  const mid = out[5];
  check('v 展平中点 (50,37.5)', approx(mid[0], 50) && approx(mid[1], 37.5), JSON.stringify(mid));
}
// y：P1(0,100)，P2=P3=(100,0) → t=0.5 时 (50,37.5)
{
  const out = [];
  flattenCubic([0, 0], [0, 100], [100, 0], [100, 0], out);
  const mid = out[5];
  check('y 展平中点 (50,37.5)', approx(mid[0], 50) && approx(mid[1], 37.5), JSON.stringify(mid));
}

// ---- 文档加载与提取（Node 下 pdf.js 主线程模式） ----
// 用带真实矢量路径的 test-vector.pdf 做提取断言（test.pdf 主要是文字，无描边路径）
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Node 下注入 Worker 源码（浏览器构建时由 main.ts 用 ?raw 内联注入）
setPdfWorkerCode(readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'utf-8'));
const buf = readFileSync(path.join(root, 'src/assets/test-vector.pdf'));
const doc = await loadPdfDocument(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
check('测试 PDF 共 2 页', doc.numPages === 2, `numPages=${doc.numPages}`);
check('Node 下实际走主线程模式', doc.mode === 'fake', `mode=${doc.mode}`);
check('第 1 页尺寸正确', approx(doc.pages[0].w, 595 * 0.352778, 1) && approx(doc.pages[0].h, 842 * 0.352778, 1),
  `${doc.pages[0].w.toFixed(1)}x${doc.pages[0].h.toFixed(1)}mm`);
check('第 1 页有矢量算子', doc.pages[0].vectorCount > 0, `vectorCount=${doc.pages[0].vectorCount}`);
check('第 2 页含 Form XObject', doc.pages[1].hasForm === true);
check('多页提示已生成', doc.warnings.some(w => w.includes('2 页')));

const vec1 = await doc.extractPageVectors(1);
check('第 1 页提取到矢量对象', vec1.length >= 4, `objects=${vec1.length}`);
check('矢量对象字段完整', vec1.every(o => o.type === 'pdf' && o.pdfOrigin && Array.isArray(o.points) && o.points.length >= 2 && o.stroke >= 0.15 && o.stroke <= 3));
check('矢量坐标在页面内', vec1.every(o => o.points.every(p => p[0] >= -1 && p[0] <= doc.pages[0].w + 1 && p[1] >= -1 && p[1] <= doc.pages[0].h + 1)));
// 第 1 页含一条 350pt 长的红线（y=700pt → mm y = (842-700)*0.352778 ≈ 50.1）
const longLine = vec1.find(o => o.points.length === 2 && Math.abs(Math.hypot(o.points[1][0] - o.points[0][0], o.points[1][1] - o.points[0][1]) - 350 * 0.352778) < 1);
check('红线长度 ≈ 123.5mm 且颜色为红', !!longLine && longLine.strokeColor === '#ff0000', longLine ? `${longLine.strokeColor} len=${Math.hypot(longLine.points[1][0] - longLine.points[0][0], longLine.points[1][1] - longLine.points[0][1]).toFixed(1)}` : '未找到');
const vec2 = await doc.extractPageVectors(2);
check('第 2 页提取到矢量对象（含 Form XObject 内容）', vec2.length >= 3, `objects=${vec2.length}`);
await doc.destroy();

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
