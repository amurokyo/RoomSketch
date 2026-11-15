// 生成带真实矢量路径的测试 PDF（供 tests/test-pdf-vector.mjs 使用）
// 用法：node scripts/generate-vector-pdf.mjs
// 产物：src/assets/test-vector.pdf（2 页）
// - 第 1 页：直线、描边矩形、圆形（贝塞尔 c 算子）、SVG 三次曲线、文字
// - 第 2 页：文字 + 以 Form XObject 嵌入的矢量印章（矩形+对角线+圆）+ 直线
import { PDFDocument, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function main() {
  // 印章源 PDF（将被以 Form XObject 嵌入第 2 页）
  const stamp = await PDFDocument.create();
  const sp = stamp.addPage([200, 120]);
  sp.drawRectangle({ x: 10, y: 10, width: 180, height: 100, borderColor: rgb(0.8, 0.1, 0.1), borderWidth: 2 });
  sp.drawLine({ start: { x: 10, y: 10 }, end: { x: 190, y: 110 }, thickness: 1, color: rgb(0.8, 0.1, 0.1) });
  sp.drawCircle({ x: 100, y: 60, size: 30, borderColor: rgb(0.1, 0.3, 0.8), borderWidth: 1.5 });
  const stampBytes = await stamp.save();

  const doc = await PDFDocument.create();
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Vector Page 1', { x: 50, y: 800, size: 18 });
  p1.drawLine({ start: { x: 50, y: 700 }, end: { x: 400, y: 700 }, thickness: 2, color: rgb(1, 0, 0) });
  p1.drawRectangle({ x: 50, y: 550, width: 200, height: 100, borderColor: rgb(0, 0, 1), borderWidth: 1.5 });
  p1.drawCircle({ x: 350, y: 600, size: 50, borderColor: rgb(0, 0.6, 0), borderWidth: 2 });
  // 注：pdf-lib 的 drawSvgPath 会把 y 取反后不做页高平移，路径会落到页外，
  // 故不用它做集成测试；贝塞尔展平（含 v/y 简写）由 tests/test-pdf-vector.mjs 的纯函数单测覆盖。
  p1.drawLine({ start: { x: 50, y: 300 }, end: { x: 400, y: 300 }, thickness: 0.5, color: rgb(0, 0, 0) });

  const p2 = doc.addPage([595, 842]);
  p2.drawText('Vector Page 2 — Form XObject below', { x: 50, y: 800, size: 18 });
  const [embedded] = await doc.embedPdf(stampBytes);
  p2.drawPage(embedded, { x: 50, y: 550, width: 200, height: 120 });
  p2.drawLine({ start: { x: 50, y: 400 }, end: { x: 300, y: 400 }, thickness: 3, color: rgb(0, 0.5, 0.5) });

  const bytes = await doc.save();
  writeFileSync(path.join(root, 'src/assets/test-vector.pdf'), bytes);
  console.log('wrote src/assets/test-vector.pdf', bytes.length, 'bytes, 2 pages');
}

main();
