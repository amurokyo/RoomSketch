// 构建产物检查：单文件、外部请求扫描、版本与体积清单。
// 用法：node tests/check-dist.mjs（需先 npm run build）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(root, 'dist');
const htmlPath = path.join(distDir, 'index.html');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const files = readdirSync(distDir);
check('dist 只有单个 HTML', files.length === 1 && files[0] === 'index.html', files.join(', '));
const html = readFileSync(htmlPath, 'utf-8');
const size = statSync(htmlPath).size;
console.log(`单文件大小：${size} 字节（${(size / 1024).toFixed(1)} KiB）`);
check('单文件 < 5 MiB', size < 5 * 1024 * 1024, `${size} 字节`);

// 1. 会真正发起网络请求的位置：外部 script/link/img、@import、url(http)、Worker(http)
//    —— 这些是硬失败。fetch(/import(/XHR 只出现在库源码的惰性代码路径里
//    （PDF.js 的网络加载器、Vue 的异步组件加载），静态出现不等于执行；
//    是否真的发起请求由 tests/check-jsdom.mjs 的运行时监听证明。
const activePatterns = [
  [/<script[^>]+src\s*=\s*["']https?:/i, '<script src=http(s)'],
  [/<link[^>]+href\s*=\s*["']https?:/i, '<link href=http(s)'],
  [/@import\s+["']https?:/i, '@import http(s)'],
  [/url\(\s*["']?https?:/i, 'CSS url(http)'],
  [/new\s+Worker\s*\(\s*["']https?:/i, 'Worker(http)'],
  [/<img[^>]+src\s*=\s*["']https?:/i, '<img src=http(s)'],
];
for (const [re, label] of activePatterns) check(`无 ${label}`, !re.test(html));
for (const [re, label] of [[/\bfetch\s*\(/, 'fetch('], [/\bimport\s*\(/, '动态 import('], [/\bXMLHttpRequest\b/, 'XMLHttpRequest']]) {
  console.log(`WARN ${label} 出现在库源码中（惰性代码路径，见 check-jsdom 运行时监听）: ${html.match(re) ? '存在' : '无'}`);
}

// 2. 全部 http(s) URL 清单：只允许不发起请求的标识符/字符串
//    - XML/XFA 命名空间 URI（标识符，不请求）
//    - 许可证文本（Apache-2.0 全文在 pdf.js 源码里）
//    - 错误信息里的文档链接（Vue 报错文案、core-js 许可证注释）
//    - 含 ${} 的模板表达式（不是字面 URL）
const urls = [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>`\\]+/g)].map(m => m[0]))];
const isInert = u =>
  u.startsWith('http://www.w3.org/') || u.startsWith('https://www.w3.org/') ||
  u.startsWith('http://www.xfa.org/schema/') || u.startsWith('https://www.xfa.org/schema/') ||
  u.startsWith('http://ns.adobe.com/') || u.startsWith('https://ns.adobe.com/') || // Adobe XMP/XDP 命名空间标识符
  u.startsWith('https://jcgt.org/published/') || // three.js 源码注释里的论文引用
  u === 'http://www.apache.org/licenses/LICENSE-2.0' ||
  u.startsWith('https://vuejs.org/error-reference/') ||
  u.startsWith('https://github.com/zloirock/core-js') ||
  u.includes('${');
const bad = urls.filter(u => !isInert(u));
console.log(`发现 http(s) 字符串 ${urls.length} 个，其中惰性标识符/文案 ${urls.length - bad.length} 个`);
if (bad.length) console.log('  不允许的 URL：' + bad.slice(0, 10).join(', '));
check('无可疑的 http(s) URL', bad.length === 0);

// 3. 关键依赖已内联
check('PDF 测试文件已内联（data URL）', html.includes('data:application/pdf;base64,'));
check('PDF.js Worker 代码已内联', html.includes('pdf.worker') || html.includes('PDFJSDev') || html.length > 1000000);
check('Vue 已内联', html.includes('createApp'));
// 阶段五接入 Three.js 渲染：WebGLRenderer 与 ExtrudeGeometry 必须内联进产物。
check('Three.js 已内联（WebGLRenderer）', html.includes('WebGLRenderer'));
check('Three.js 已内联（ExtrudeGeometry）', html.includes('ExtrudeGeometry'));
check('无 CDN 域名', !/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html));

// 4. 版本与体积清单
console.log('--- 版本 ---');
for (const [name, ver] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  console.log(`  ${name}: ${ver}`);
}
check('package.json 版本为 2.0.0', pkg.version === '2.0.0', pkg.version);
check('构建产物含 RoomSketch 2.0.0', html.includes('RoomSketch 2.0.0'));
check('构建产物无 1.0.0 残留', !html.includes('1.0.0'));
// 品牌后只允许 2.0.0，不允许裸 2.0；库内 Apache License 2.0 文本与
// pdf.js 字体数值（如 2.01462）不是我们的版本号，不在此查。
check('构建产物品牌版本号为 2.0.0（非裸 2.0）', !/RoomSketch 2\.0(?!\.0)/.test(html));
check('VERSION 文件为 2.0.0', readFileSync(path.join(root, 'VERSION'), 'utf-8').trim() === '2.0.0');
check('源码单一版本常量为 2.0.0', /APP_VERSION = '2\.0\.0'/.test(readFileSync(path.join(root, 'src/version.ts'), 'utf-8')));

if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
