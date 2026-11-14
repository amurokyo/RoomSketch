// RoomSketch 1.0.0 — 工程文件打开兼容性测试（jsdom）
// 用法：node tests/test-project-io.mjs
// 覆盖：旧版 {app, version:2} 可打开；新版 {format, schemaVersion:1, appVersion} 可打开；
// 不支持的 schemaVersion / 非法格式会被拒绝且不覆盖当前画布。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('SKIP: 需要先安装 jsdom（npm install --no-save jsdom）'); process.exit(0); }

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf-8');
const dom = new JSDOM(html, { url: 'file:///roomsketch/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const { document, window } = dom.window;
await new Promise(r => setTimeout(r, 200));
const input = document.getElementById('projectFile');
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
async function openProject(obj) {
  const file = new window.File([JSON.stringify(obj)], 'test.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  return window.__rs.objects.length;
}
const rect = { type: 'rect', x: 0, y: 0, w: 1000, h: 500, stroke: 12 };
const furn = { type: 'furniture', x: 100, y: 100, w: 1400, h: 700, label: '桌子', stroke: 12 };

let n = await openProject({ app: 'RoomSketch', version: 2, counter: 3, objects: [rect], view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50 });
check('旧版 version:2 工程可打开', n === 1, `objects=${n}`);
check('旧版打开后对象类型正确', window.__rs.objects[0]?.type === 'rect');

n = await openProject({ format: 'roomsketch', schemaVersion: 1, appVersion: '1.0.0', metadata: { name: 't', createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' }, counter: 4, objects: [furn, rect], view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50 });
check('新版 1.0.0 工程可打开', n === 2, `objects=${n}`);

n = await openProject({ format: 'roomsketch', schemaVersion: 99, appVersion: '9.9.9', objects: [rect, rect, rect] });
check('schemaVersion 99 被拒绝且不覆盖画布', n === 2, `objects=${n}`);

n = await openProject({ app: 'SomethingElse', objects: [rect] });
check('非法格式被拒绝且不覆盖画布', n === 2, `objects=${n}`);

n = await openProject({ format: 'roomsketch', schemaVersion: 1, appVersion: '1.0.0', objects: 'not-an-array' });
check('objects 非数组被拒绝', n === 2, `objects=${n}`);

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
