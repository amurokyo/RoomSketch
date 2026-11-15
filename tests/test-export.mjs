// RoomSketch 2.0.1 — 导出测试（Node 直接导入 TS 源码，Node 24 类型剥离）
// 用法：node tests/test-export.mjs
// 覆盖：exportRectFor（全部/视图）、collectPdfContent（描边颜色 RG 算子——
// 1.0.0 漏 RG 的回归测试、旋转对象坐标变换、门弧线 24 段、尺寸箭头填充、
// 比例自动放宽、超大图纸拒绝、空画布拒绝）、assemblePdf（xref 偏移表
// 逐项校验、文字遮罩与 JPEG XObject、内容流含 RG）。
// 文字遮罩用桩函数（Node 无 canvas）；真实 canvas 遮罩见 Playwright 冒烟。
import {
  collectPdfContent, assemblePdf, buildPdfBytes,
} from '../src/model/exportPdf.ts';
import { hexRgb01 } from '../src/model/color.ts';
import { exportRectFor } from '../src/model/geometry.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

const VIEW = { x: 0, y: 0, w: 12000, h: 8000 };
const OPTS = { paper: 'A4', orient: 'landscape', scale: 50, scope: 'view', hideGrid: true };
const wall = (x2 = 4000) => ({ id: 'w1', type: 'wall', x: 0, y: 0, points: [[0, 0], [x2, 0]], wallWidth: 120 });

// 桩遮罩：8×8 全黑 1bit（只验组装逻辑，不验光栅化）
const stubMask = async () => ({ w: 8, h: 8, rowBytes: 1, data: new Uint8Array([0xFF, 0, 0, 0, 0, 0, 0, 0]), K: 8, baseline: 6 });

// ---------- exportRectFor ----------
{
  const r = exportRectFor([wall(), { id: 'w2', type: 'wall', x: 0, y: 0, points: [[0, 0], [0, 3000]], wallWidth: 120 }], VIEW, 'all');
  check('全部范围含 4% 边距', r.x < 0 && r.y < 0 && r.w > 4000 && r.h > 3000, JSON.stringify(r));
  const v = exportRectFor([wall()], VIEW, 'view');
  check('视图范围即当前视图', v.x === 0 && v.y === 0 && v.w === 12000 && v.h === 8000, JSON.stringify(v));
  const e = exportRectFor([], VIEW, 'all');
  check('空工程 all 退回视图', e.w === 12000, JSON.stringify(e));
}

// ---------- hexRgb01 ----------
check('hex #27384a → 0.153/0.22/0.29', JSON.stringify(hexRgb01('#27384a')) === '[0.153,0.22,0.29]', JSON.stringify(hexRgb01('#27384a')));
check('hex 3 位简写 #fff → 全 1', JSON.stringify(hexRgb01('#fff')) === '[1,1,1]');

// ---------- collectPdfContent ----------
{
  const c = collectPdfContent([wall()], OPTS, VIEW);
  const all = c.ops.join('\n');
  check('描边颜色发 RG 算子（1.0.0 漏 RG 回归）', all.includes('0.153 0.22 0.29 RG'), all.split('\n')[0]);
  const badLines = c.ops.filter(l => / w /.test(l) && !/RG/.test(l));
  check('无裸数字操作数残留（每条 w 前都有 RG）', badLines.length === 0, badLines.join(' | '));
  check('墙线宽按 wallWidth/比例换算（120/50×2.83=6.80pt）', /6\.80 w/.test(all), all.split('\n')[0]);
}
{
  // 旋转 90° 的矩形：世界角点 (1000,1000)(1000,2000)(500,2000)(500,1000)，
  // 导出坐标 X 跨度应为 500mm、Y 跨度 1000mm（未旋转则是反过来的 1000/500）。
  const rect = { id: 'r1', type: 'rect', x: 1000, y: 1000, w: 1000, h: 500, rotation: 90, stroke: 12 };
  const c = collectPdfContent([rect], OPTS, VIEW);
  const pts = [...c.ops.join(' ').matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]/g)].map(m => [+m[1], +m[2]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const xSpan = Math.max(...xs) - Math.min(...xs), ySpan = Math.max(...ys) - Math.min(...ys);
  check('旋转矩形导出坐标与变换一致（X 跨 500mm、Y 跨 1000mm）',
    approx(xSpan, 500 / 50 * 72 / 25.4, 0.5) && approx(ySpan, 1000 / 50 * 72 / 25.4, 0.5),
    `xSpan=${xSpan.toFixed(2)} ySpan=${ySpan.toFixed(2)}`);
}
{
  const c = collectPdfContent([{ id: 'd1', type: 'door', x: 0, y: 0, w: 900, dir: 1, stroke: 10 }], OPTS, VIEW);
  const lCount = (c.ops.join(' ').match(/ l/g) || []).length;
  check('门弧线 24 段（共 25 条 l）', lCount === 25, `l=${lCount}`);
}
{
  const c = collectPdfContent([{ id: 'dm1', type: 'dimension', x: 0, y: 0, length: 3000, label: '3000 mm', stroke: 8 }], OPTS, VIEW);
  check('尺寸箭头为填充三角', c.ops.some(o => / f/.test(o)), c.ops.join(' | ').slice(0, 200));
  check('尺寸标注产生文字遮罩', c.masks.length === 1 && c.masks[0].text === '3000 mm', JSON.stringify(c.masks));
}
{
  // scope:'all'：20010mm 墙 + 4% 边距 = 21710.8mm，A4 横版 1:20 放不下，逐档放宽到 1:100 才放得下。
  const big = collectPdfContent([wall(20000)], { ...OPTS, scope: 'all', scale: 20 }, VIEW);
  check('A4 1:20 放不下自动放宽到 1:100', big.scale === 100 && big.relaxed === true, `scale=${big.scale} relaxed=${big.relaxed}`);
  let threw = '';
  try { collectPdfContent([wall(200000)], { ...OPTS, scope: 'all', scale: 20 }, VIEW); } catch (e) { threw = String(e); }
  check('超大图纸明确拒绝', /超出/.test(threw), threw);
  let emptyErr = '';
  try { collectPdfContent([], OPTS, VIEW); } catch (e) { emptyErr = String(e); }
  check('空画布明确拒绝', /画布为空/.test(emptyErr), emptyErr);
}
{
  const c = collectPdfContent([
    { id: 'r1', type: 'polyroom', x: 0, y: 0, points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
    { id: 'f1', type: 'furniture', x: 500, y: 500, w: 2000, h: 1500, label: '双人床' },
  ], OPTS, VIEW);
  check('房间+家具产生 2 个文字遮罩', c.masks.length === 2, `masks=${c.masks.length}`);
  check('房间遮罩含面积文本', /m²/.test(c.masks[0].text), c.masks[0].text);
}

// ---------- assemblePdf（桩遮罩 + 1x1 JPEG 底图） ----------
const JPEG_1X1 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
{
  const doc = [
    wall(),
    { id: 'lb1', type: 'label', x: 500, y: 500, label: '客厅', fontSize: 130 },
    { id: 'bg1', type: 'imagebg', x: 0, y: 0, w: 1000, h: 1000, src: 'data:image/jpeg;base64,' + JPEG_1X1, srcW: 1, srcH: 1 },
  ];
  const content = collectPdfContent(doc, OPTS, VIEW);
  const bytes = await assemblePdf(content, OPTS, stubMask);
  const s = Buffer.from(bytes).toString('latin1');
  check('PDF 头 %PDF-1.4', s.startsWith('%PDF-1.4'));
  check('PDF 尾 %%EOF', s.trimEnd().endsWith('%%EOF'));
  const m = s.match(/startxref\n(\d+)\n%%EOF/);
  check('startxref 存在', !!m, m ? `offset=${m[1]}` : '无');
  const xrefOff = m ? Number(m[1]) : -1;
  check('startxref 指向 xref', xrefOff > 0 && s.slice(xrefOff, xrefOff + 4) === 'xref', `offset=${xrefOff}`);
  // xref 逐项：每个对象偏移指向 "N 0 obj"
  let xrefOk = true, xrefDetail = '';
  if (m) {
    const header = s.slice(xrefOff).match(/^xref\n0 (\d+)\n/);
    const count = header ? Number(header[1]) : 0;
    const lines = s.slice(xrefOff).split('\n');
    // lines[0]='xref', lines[1]='0 N', lines[2]=free entry, lines[3..]=obj entries
    for (let i = 1; i < count; i++) {
      const line = lines[2 + i] || '';
      const off = Number(line.slice(0, 10));
      const expect = `${i} 0 obj`;
      if (s.slice(off, off + expect.length) !== expect) { xrefOk = false; xrefDetail = `obj ${i}: offset ${off} 处不是 "${expect}"`; break; }
    }
    xrefDetail = xrefOk ? `${count - 1} 个对象偏移全部正确` : xrefDetail;
  }
  check('xref 偏移表逐项正确', xrefOk, xrefDetail);
  check('内容流含描边 RG', s.includes('0.153 0.22 0.29 RG'));
  check('文字遮罩为 ImageMask XObject', s.includes('/ImageMask true'));
  check('JPEG 底图为 DCTDecode XObject', s.includes('/DCTDecode'));
  check('JPEG 尺寸 1×1 写入', s.includes('/Width 1 /Height 1'));
  check('MediaBox 为 A4 横版', s.includes('/MediaBox [0 0 841.89 595.28]'), (s.match(/\/MediaBox \[[^\]]+\]/) || ['无'])[0]);
}
{
  let err = '';
  try { await buildPdfBytes([], OPTS, VIEW); } catch (e) { err = String(e); }
  check('buildPdfBytes 空画布拒绝', /画布为空/.test(err), err);
}

if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
