// RoomSketch 1.0.0 — 离线与版本一致性检查
// 用法：node tests/check-offline.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf-8');
const readme = readFileSync(path.join(root, 'README.md'), 'utf-8');
const version = readFileSync(path.join(root, 'VERSION'), 'utf-8').trim();
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

// 1. 无外部请求：http(s) URL 只允许 XML 命名空间标识符（不发起请求）
const urls = [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(m => m[0]);
const bad = urls.filter(u => !u.startsWith('http://www.w3.org/2000/svg') && !u.startsWith('http://www.w3.org/1999/xlink'));
check('index.html 无外部 URL', bad.length === 0, bad.join(', ') || `${urls.length} 个命名空间 URI`);
check('无 fetch / XMLHttpRequest / import()', !/fetch\(|XMLHttpRequest|import\(/.test(html));
check('无 CDN / 外部脚本', !/<script[^>]+src=|<link[^>]+href="https?:/.test(html));
check('无 Worker（核心功能不依赖 Worker）', !/new Worker/.test(html));

// 2. 版本统一 1.0.0
check('VERSION 文件是 1.0.0', version === '1.0.0', version);
check('index.html 无 RoomSketch 2.0 残留', !html.includes('RoomSketch 2.0'));
check('README 无 RoomSketch 2.0 残留', !readme.includes('RoomSketch 2.0'));
check('APP_VERSION 单一版本源', html.includes("const APP_VERSION='1.0.0', SCHEMA_VERSION=1;"));
check('标题是 1.0.0', html.includes('<title>RoomSketch 1.0.0'));
check('页脚是 1.0.0', html.includes('RoomSketch 1.0.0 · Offline'));

// 3. 工程格式分离 + 旧版兼容
check('保存用新格式 format/schemaVersion/appVersion', html.includes("format:'roomsketch',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION"));
check('旧版 version:2 已移除', !html.includes('version:2'));
check('打开校验 schemaVersion', html.includes('data.schemaVersion!==SCHEMA_VERSION'));
check('旧版工程可打开（isOld 分支）', html.includes("isOld=data.app==='RoomSketch'"));

// 4. P0 修复点存在
check('3D 先算对象再建遮罩', html.indexOf('const data=r3dCollect();') < html.indexOf("back.className='r3d-backdrop open'"));
check('3D 不可渲染对象提示', html.includes('未在 3D 中显示'));
check('PDF 多页提示', html.includes('多页 PDF'));
check('PDF 清理前确认', html.includes('confirmCleanPdf'));
check('保存状态指示 #saveState', html.includes('id="saveState"'));
check('备份失败可见提示', html.includes('自动备份失败'));
check('启动首次渲染不算未保存更改', html.includes('if(!booting)markDirty()'));
check('无更改时不写备份（不覆盖可恢复备份）', html.includes('function saveBackup(){if(!dirty)return;'));
check('无 matchMedia 时不中断启动', html.includes("window.matchMedia?window.matchMedia"));

if (failures) { console.error(`${failures} 项检查失败`); process.exit(1); }
console.log('全部通过');
