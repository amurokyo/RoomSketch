// RoomSketch 1.0.0 — 冒烟测试（jsdom，无浏览器）
// 用法：先装 jsdom（npm install --no-save jsdom），再 node tests/smoke.mjs
// 验证页面在 file:// 语义下能加载、不抛错、版本与保存状态指示就位。
// 注意：jsdom 没有 SVG getScreenCTM 等布局 API，本测试只覆盖加载与静态状态。
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
const errors = [];
const dom = new JSDOM(html, {
  url: 'file:///roomsketch/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.addEventListener('error', e => errors.push(String(e.message || e.error)));
  },
});
const { document, window } = dom.window;
await new Promise(r => setTimeout(r, 300));
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
check('页面加载无 JS 错误', errors.length === 0, errors.join(' | '));
check('标题 1.0.0', document.title.includes('RoomSketch 1.0.0'), document.title);
check('品牌 1.0.0', document.querySelector('.brand strong')?.textContent === 'RoomSketch 1.0.0');
check('保存状态指示存在', !!document.getElementById('saveState'));
check('保存状态初始为无未保存更改', document.getElementById('saveState')?.textContent.includes('无未保存更改'));
check('调试钩子 __rs 就位', !!window.__rs && window.__rs.objects.length === 0);
check('工具栏 12 个工具', document.querySelectorAll('#toolGrid .tool').length === 12);
check('家具图库已渲染', document.querySelectorAll('#furnList .furn-item').length > 0);
check('PDF 清理按钮初始禁用', document.getElementById('cleanPdfTextBtn')?.disabled === true);
if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('冒烟通过（jsdom，未覆盖指针交互与真实浏览器布局）');
