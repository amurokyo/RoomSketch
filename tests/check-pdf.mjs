// Node 下用 pdfjs-dist（legacy 构建）解析测试 PDF。
// 断言：页数 ≥ 2；第 1 页含 Form XObject（操作列表含 paintFormXObject / Do）；
// 每页文本内容可读。主线程（fake worker）模式，不建 Worker。
// 用法：node tests/check-pdf.mjs
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const bytes = readFileSync(path.join(root, 'src', 'assets', 'test.pdf'));
console.log(`pdfjs-dist 版本：${pdfjs.version}`);
const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
check('页数 ≥ 2', doc.numPages >= 2, `numPages=${doc.numPages}`);
check('页数恰好为 2', doc.numPages === 2, `numPages=${doc.numPages}`);

const p1 = await doc.getPage(1);
const ops = await p1.getOperatorList();
// pdfjs OPS 是“名 → 编号”，需反查；Do 操作在操作列表里表现为
// paintFormXObjectBegin / paintFormXObjectEnd 一对标记。
const revOps = {};
for (const [k, v] of Object.entries(pdfjs.OPS)) revOps[v] = k;
const fnNames = ops.fnArray.map(fn => revOps[fn] ?? String(fn));
const hasFormXObject = fnNames.includes('paintFormXObjectBegin') || fnNames.includes('paintFormXObject');
console.log(`第 1 页操作数：${ops.fnArray.length}，含 paintFormXObjectBegin：${hasFormXObject}`);
check('第 1 页含 Form XObject（Do / paintFormXObjectBegin）', hasFormXObject, [...new Set(fnNames)].join(', '));
const t1 = await p1.getTextContent();
const text1 = t1.items.map(it => it.str || '').join(' ');
check('第 1 页文本可读（含 Form XObject 字样）', /Form XObject/.test(text1), text1.slice(0, 80));

const p2 = await doc.getPage(2);
const t2 = await p2.getTextContent();
const text2 = t2.items.map(it => it.str || '').join(' ');
check('第 2 页文本可读', /Page 2/.test(text2), text2.slice(0, 80));
const ops2 = await p2.getOperatorList();
const fn2 = ops2.fnArray.map(fn => revOps[fn] ?? String(fn));
check('第 2 页无 Form XObject', !fn2.includes('paintFormXObjectBegin') && !fn2.includes('paintFormXObject'));

await doc.destroy();
if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
