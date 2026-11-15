// jsdom 下加载构建产物 dist/index.html（file:// 语义），断言：
// - Vue 挂载成功，无 JS 致命错误；
// - 自检面板：PDF 走主线程降级（jsdom 无 Worker）、WebGL 不可用但不阻断、
//   存储检测出结果、构建信息含 2.0.0；
// - 画布与工具栏渲染（SVG 画布、12 个工具按钮）；
// - 文件选择（input type=file）可读取 2.0.0 工程 JSON 并替换对象列表；
// - 保存按钮点击不抛错；主题切换可用；
// - 加载 + PDF 处理 + 文件操作全程零网络请求（fetch/XHR 监听）。
//
// 注意：jsdom 不执行 <script type="module">（已知限制），所以这里把 dist 里
// 内联的 module 脚本取出来，用 Node 的 vm.SourceTextModule 在 jsdom 的
// window 上下文中执行——测的是同一份构建产物代码，不是改写后的副本。
// 必须用 node --experimental-vm-modules 运行。
// 用法：node --experimental-vm-modules tests/check-jsdom.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { ReadableStream as NodeReadableStream, WritableStream as NodeWritableStream, TransformStream as NodeTransformStream, CompressionStream as NodeCompressionStream } from 'node:stream/web';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('SKIP: 需要先安装 jsdom（npm install --no-save jsdom）'); process.exit(0); }

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8');
const code = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
if (!code) { console.error('FAIL dist/index.html 里没有内联脚本'); process.exit(1); }

const errors = [];
const netCalls = [];
// jsdom 没有 URL.createObjectURL：用注册表模拟，blob: URL 只用于 worker 代码
const blobRegistry = new Map();
let blobSeq = 0;
const dom = new JSDOM(html, {
  // 可用 JSDOM_URL 环境变量改地址，例如 ?pdf=main / ?pdf=blob 强制 PDF 模式
  url: process.env.JSDOM_URL || 'file:///roomsketch-prototype/dist/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.addEventListener('error', e => errors.push(String(e.message || e.error)));
    window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + String(e.reason)));
    // jsdom 的 window 缺少 structuredClone 与 Web Streams，pdf.js fake worker
    // 要用；借 Node 的实现（真实浏览器自带，不需要 polyfill）。
    if (typeof window.structuredClone !== 'function') {
      window.structuredClone = structuredClone;
    }
    if (typeof window.ReadableStream !== 'function') window.ReadableStream = NodeReadableStream;
    if (typeof window.WritableStream !== 'function') window.WritableStream = NodeWritableStream;
    if (typeof window.TransformStream !== 'function') window.TransformStream = NodeTransformStream;
    // PDF 导出用 CompressionStream 做 Flate 压缩；jsdom 未实现，借 Node 的
    // （真实浏览器自带，不需要 polyfill）。
    if (typeof window.CompressionStream !== 'function') window.CompressionStream = NodeCompressionStream;
    window.URL.createObjectURL = (blob) => {
      const url = `blob:file:///fake-${++blobSeq}`;
      blobRegistry.set(url, blob);
      return url;
    };
    window.URL.revokeObjectURL = (url) => { blobRegistry.delete(url); };
    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = (...args) => { netCalls.push(['fetch', String(args[0])]); return origFetch(...args); };
    }
    if (window.XMLHttpRequest?.prototype?.open) {
      const origOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (...args) { netCalls.push(['xhr', String(args[1])]); return origOpen.apply(this, args); };
    }
  },
});
const { document, window } = dom.window;

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const text = sel => document.querySelector(sel)?.textContent || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 在 jsdom 的 window 上下文中执行构建产物的 module 代码
try {
  const mod = new vm.SourceTextModule(code, {
    identifier: 'dist/index.html inline module',
    context: dom.getInternalVMContext(),
    initializeImportMeta(meta) { meta.url = 'file:///roomsketch-prototype/dist/index.html'; },
    // pdf.js fake worker 会动态 import(blob: URL) 加载 worker 代码；
    // 在 jsdom 里用注册表里的 Blob 文本建模块（真实浏览器里原生支持）。
    importModuleDynamically: async (specifier) => {
      if (typeof specifier === 'string' && specifier.startsWith('blob:')) {
        const blob = blobRegistry.get(specifier);
        if (!blob) throw new Error('未知的 blob: URL：' + specifier);
        const text = await blob.text();
        const m = new vm.SourceTextModule(text, {
          identifier: specifier,
          context: dom.getInternalVMContext(),
          initializeImportMeta(meta) { meta.url = specifier; },
        });
        await m.link(async () => { throw new Error('worker 内出现意外的静态 import'); });
        await m.evaluate();
        return m.namespace;
      }
      throw new Error('意外的动态 import：' + String(specifier));
    },
  });
  await mod.link(async (specifier) => { throw new Error('意外的静态 import: ' + specifier); });
  await mod.evaluate();
} catch (e) {
  console.log('FAIL 构建产物 module 执行失败 — ' + String(e?.stack || e));
  process.exit(1);
}

// 等 PDF 自检异步加载完成（主线程模式，jsdom 里约 < 2s），最多等 10s
let pdfReady = false;
for (let i = 0; i < 50; i++) {
  await sleep(200);
  if (/可解析/.test(text('#check-pdf'))) { pdfReady = true; break; }
}
check('页面加载无 JS 致命错误', errors.length === 0, errors.slice(0, 3).join(' | '));
check('加载 + PDF 处理全程零网络请求', netCalls.length === 0, netCalls.map(c => c.join(' ')).join(' | '));
check('Vue 已挂载', /已挂载/.test(text('#check-vue')), text('#check-vue'));
check('自检面板显示版本 2.0.0', /2\.0\.0/.test(text('#check-vue')), text('#check-vue'));
check('PDF 自检完成（测试 PDF 可解析）', pdfReady, text('#check-pdf'));
check('PDF 走主线程降级（jsdom 无 Worker）', /主线程/.test(text('#check-pdf')), text('#check-pdf'));
check('PDF 读到 2 页', /2 页/.test(text('#check-pdf')), text('#check-pdf'));
check('WebGL 不可用但不阻断（jsdom 无 WebGL）', /WebGL 不可用/.test(text('#check-three')), text('#check-three'));
check('三维渲染已接入（r182）', /三维渲染已接入/.test(text('#check-three')) && /r182/.test(text('#check-three')), text('#check-three'));
check('存储能力检测已出结果', text('#check-storage').length > 0 && !/未检测/.test(text('#check-storage')), text('#check-storage'));
check('构建信息含构建时间与 2.0.0', /构建时间/.test(text('#check-build')) && /2\.0\.0/.test(text('#check-build')), text('#check-build'));
check('SVG 画布已渲染', !!document.getElementById('canvas'));
check('工具栏 12 个工具按钮', document.querySelectorAll('.tool-grid .tool').length === 12, `tools=${document.querySelectorAll('.tool-grid .tool').length}`);
check('顶栏含 2.0.0 品牌', /RoomSketch/.test(document.querySelector('.brand')?.textContent || '') && /2\.0\.0/.test(document.querySelector('.brand')?.textContent || ''));
check('状态栏显示 0 个对象', /0 个对象/.test(document.querySelector('.statusbar')?.textContent || ''));

// 文件选择：导入 2.0.0 工程 JSON，替换对象列表
const input = document.getElementById('file-project');
const project = {
  format: 'roomsketch', schemaVersion: 1, appVersion: '2.0.0',
  metadata: { name: '测试工程', createdAt: '2026-11-15T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z' },
  counter: 3, view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50, pdfImported: false, pdfPageSize: null,
  objects: [
    { id: 'o1', type: 'wall', x: 0, y: 0, points: [[0, 0], [3000, 0]], wallWidth: 120 },
    { id: 'o2', type: 'wall', x: 0, y: 0, points: [[3000, 0], [3000, 2500]], wallWidth: 120 },
  ],
};
const file = new window.File([JSON.stringify(project)], 'project.json', { type: 'application/json' });
Object.defineProperty(input, 'files', { value: [file], configurable: true });
input.dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(500);
check('文件选择读取 2.0.0 工程 JSON（2 个对象）', /2 个对象/.test(document.querySelector('.statusbar')?.textContent || ''), document.querySelector('.statusbar')?.textContent);
check('导入后画布有 2 个墙体', document.querySelectorAll('#objects > *').length === 2, `shapes=${document.querySelectorAll('#objects > *').length}`);
check('导入提示正确', /已载入 2 个对象/.test(document.querySelector('.toast')?.textContent || ''), document.querySelector('.toast')?.textContent || '');

// 保存按钮点击不抛错（jsdom 里 Blob URL 已用注册表模拟）
const errBefore = errors.length;
document.getElementById('save-btn').click();
await sleep(300);
check('保存按钮点击不抛错', errors.length === errBefore, errors.slice(errBefore).join(' | '));
check('保存后状态栏显示已导出', /已导出工程文件/.test(document.querySelector('.statusbar')?.textContent || ''), document.querySelector('.statusbar')?.textContent);

// 主题切换：点击后 .app 获得 .dark
const themeBtn = [...document.querySelectorAll('.topbar button')].find(b => /深色|浅色/.test(b.textContent));
themeBtn.click();
await sleep(200);
check('主题切换可用（深色生效）', document.querySelector('.app').classList.contains('dark'));

// ---- 阶段五：SVG 序列化（__rs 调试钩子） ----
const rs = dom.window.__rs;
check('__rs 调试钩子存在', !!rs && Array.isArray(rs.objects), typeof rs);
{
  const xml = rs.serializeCanvasSvg({ x: -100, y: -100, w: 5000, h: 3000 }, { hideGrid: false, printScale: 50 });
  check('SVG 序列化含画布与墙体', typeof xml === 'string' && xml.includes('<svg') && xml.includes('polyline'),
    (xml || '').slice(0, 120));
  check('SVG 导出 viewBox 按导出范围', typeof xml === 'string' && xml.includes('viewBox="-100 -100 5000 3000"'));
  check('SVG 导出宽高按出图比例（100mm×60mm）', typeof xml === 'string' && xml.includes('width="100mm"') && xml.includes('height="60mm"'));
  check('SVG 导出不含选中框/手柄层', typeof xml === 'string' && !xml.includes('selection-ui') && !xml.includes('id="draft"'));
  check('SVG 导出不含交互层 class', typeof xml === 'string' && !xml.includes('class="bbox"') && !xml.includes('class="handle"'));
}

// ---- 阶段五：3D 预览在无 WebGL 环境下降级（不白屏、可关闭） ----
const threeBtn = [...document.querySelectorAll('.topbar button')].find(b => b.textContent.includes('3D 预览'));
threeBtn.click();
await sleep(500);
check('3D 预览遮罩打开', !!document.querySelector('.r3d-backdrop.open'));
check('无 WebGL 时显示降级信息', /WebGL 不可用/.test(document.querySelector('.r3d-fallback')?.textContent || ''),
  document.querySelector('.r3d-fallback')?.textContent?.slice(0, 80) || '');
check('降级面板含几何统计', /墙段 2 块/.test(document.querySelector('.r3d-fallback')?.textContent || ''),
  document.querySelector('.r3d-fallback')?.textContent?.slice(0, 120) || '');
check('降级不产生页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
document.querySelector('.r3d-bar .primary').click();
await sleep(200);
check('3D 预览可关闭', !document.querySelector('.r3d-backdrop'));

// ---- 阶段五：导出对话框（SVG 导出端到端；PDF 导出墙体文档无文字遮罩） ----
const exportBtn = [...document.querySelectorAll('.topbar button')].find(b => b.textContent.includes('导出'));
exportBtn.click();
await sleep(200);
check('导出菜单打开', !!document.querySelector('.menu'));
[...document.querySelectorAll('.menu button')].find(b => b.textContent.includes('SVG')).click();
await sleep(200);
check('导出对话框打开（SVG 预选）', !!document.querySelector('.export-dlg'));
document.querySelector('.export-dlg .primary').click();
await sleep(500);
check('SVG 导出成功提示', /SVG 矢量文件已导出/.test(document.querySelector('.toast')?.textContent || ''),
  document.querySelector('.toast')?.textContent || '');
check('SVG 导出后对话框关闭', !document.querySelector('.export-dlg'));
check('SVG 导出不产生页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

exportBtn.click();
await sleep(200);
[...document.querySelectorAll('.menu button')].find(b => b.textContent.includes('PDF')).click();
await sleep(200);
check('导出对话框打开（PDF 预选）', !!document.querySelector('.export-dlg'));
document.querySelector('.export-dlg .primary').click();
await sleep(800);
check('PDF 导出成功提示（墙体文档，无文字遮罩）', /矢量 PDF 已导出/.test(document.querySelector('.toast')?.textContent || ''),
  document.querySelector('.toast')?.textContent || '');
check('PDF 导出后对话框关闭', !document.querySelector('.export-dlg'));
check('PDF 导出不产生页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

check('文件导入/导出/主题切换全程零网络请求', netCalls.length === 0, netCalls.map(c => c.join(' ')).join(' | '));

if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
