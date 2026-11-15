// 生成原型测试 PDF：2 页，第 1 页含 Form XObject，第 2 页纯文本。
// 方法：先用 pdf-lib 做一个“印章”源 PDF，再用 PDFDocument.embedPdf() 把它
// 以 Form XObject 形式嵌入主文档第 1 页（PDF 规范里 embedPdf 产生的就是
// /Subtype /Form 的 XObject，页面内容流里用 Do 操作引用）。
// 用法：node scripts/generate-test-pdf.mjs
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(outDir, 'src', 'assets', 'test.pdf');

async function main() {
  // 1. 印章源 PDF：一个带边框与文字的小页
  const stamp = await PDFDocument.create();
  const sp = stamp.addPage([220, 120]);
  sp.drawRectangle({ x: 6, y: 6, width: 208, height: 108, borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 3 });
  const font = await stamp.embedFont(StandardFonts.HelveticaBold);
  sp.drawText('FORM XOBJECT', { x: 28, y: 62, size: 16, font, color: rgb(0.2, 0.4, 0.8) });
  sp.drawText('RoomSketch prototype', { x: 28, y: 38, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  const stampBytes = await stamp.save();

  // 2. 主文档
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const p1 = doc.addPage([595, 842]); // A4
  p1.drawText('RoomSketch Prototype Test PDF - Page 1', { x: 50, y: 780, size: 18, font: helvBold });
  p1.drawText('This page contains a Form XObject (embedded stamp).', { x: 50, y: 750, size: 12, font: helv });
  p1.drawText('Wall A: 4000 x 2800 mm, door 900 mm, window 1200 mm.', { x: 50, y: 726, size: 12, font: helv });
  // 以 Form XObject 嵌入印章
  const [embedded] = await doc.embedPdf(stampBytes);
  p1.drawPage(embedded, { x: 50, y: 560, width: 220, height: 120 });
  p1.drawText('Above is the embedded Form XObject.', { x: 50, y: 530, size: 12, font: helv });

  const p2 = doc.addPage([595, 842]);
  p2.drawText('RoomSketch Prototype Test PDF - Page 2', { x: 50, y: 780, size: 18, font: helvBold });
  p2.drawText('This page is plain text only, no XObject.', { x: 50, y: 750, size: 12, font: helv });
  p2.drawText('Room list: Living 24.5 m2, Bedroom 16.2 m2, Kitchen 9.8 m2.', { x: 50, y: 726, size: 12, font: helv });
  p2.drawRectangle({ x: 50, y: 600, width: 300, height: 80, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1 });
  p2.drawText('Rectangle drawn with vector ops.', { x: 60, y: 640, size: 12, font: helv });

  const bytes = await doc.save();
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes, 2 pages, page 1 has Form XObject)`);
}

main().catch(e => { console.error(e); process.exit(1); });
