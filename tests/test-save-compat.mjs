// RoomSketch 2.0.2 — 阶段六 保存与兼容端到端（jsdom + 真实构建产物）
// 用 http:// 语义加载（使 localStorage 可用，file:// 下 jsdom 的 localStorage
// 会报 SecurityError）；覆盖：
// - 保存→打开往返（保存 blob 含 2.0.2 元数据；经 #file-project 打开恢复对象与关联）
// - 旧版 {app:'RoomSketch', version:2} 与 1.0.0 新格式文件打开兼容（升级标记）
// - 损坏/不支持的工程文件被拒且当前工程不动
// - 自动备份端到端：写备份→新实例恢复条→确认恢复 / 忽略
// - 损坏备份（非数组 objects / 未来 schemaVersion / 非 JSON）不出现恢复条、不报错
// - 存储不可用时降级：备份失败提示、保存/打开仍可用
// 用法：node --experimental-vm-modules tests/test-save-compat.mjs
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
const BACKUP_KEY = 'roomsketch-autobackup-v2';

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 启动一个应用实例。seedBackup：预置的备份 JSON；breakStorage：存储读写全拒。 */
async function bootApp(opts = {}) {
  const errors = [];
  const netCalls = [];
  const blobRegistry = new Map();
  let blobSeq = 0;
  const dom = new JSDOM(html, {
    url: 'http://localhost/roomsketch-prototype/dist/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.addEventListener('error', e => errors.push(String(e.message || e.error)));
      window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + String(e.reason)));
      if (typeof window.structuredClone !== 'function') window.structuredClone = structuredClone;
      if (typeof window.ReadableStream !== 'function') window.ReadableStream = NodeReadableStream;
      if (typeof window.WritableStream !== 'function') window.WritableStream = NodeWritableStream;
      if (typeof window.TransformStream !== 'function') window.TransformStream = NodeTransformStream;
      if (typeof window.CompressionStream !== 'function') window.CompressionStream = NodeCompressionStream;
      window.URL.createObjectURL = (blob) => {
        const url = `blob:http://localhost/fake-${++blobSeq}`;
        blobRegistry.set(url, blob);
        return url;
      };
      window.URL.revokeObjectURL = (url) => { blobRegistry.delete(url); };
      if (typeof window.fetch === 'function') {
        const origFetch = window.fetch.bind(window);
        window.fetch = (...args) => { netCalls.push(['fetch', String(args[0])]); return origFetch(...args); };
      }
      if (opts.seedBackup) window.localStorage.setItem(BACKUP_KEY, opts.seedBackup);
      if (opts.breakStorage) {
        // 模拟隐私模式/存储被禁：写抛错、读恒空
        window.Storage.prototype.setItem = function () { throw new Error('storage denied'); };
        window.Storage.prototype.getItem = function () { return null; };
        window.Storage.prototype.removeItem = function () {};
      }
    },
  });
  const { document, window } = dom.window;
  try {
    const mod = new vm.SourceTextModule(code, {
      identifier: 'dist/index.html inline module',
      context: dom.getInternalVMContext(),
      initializeImportMeta(meta) { meta.url = 'http://localhost/roomsketch-prototype/dist/index.html'; },
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
    await mod.link(async () => { throw new Error('意外的静态 import'); });
    await mod.evaluate();
  } catch (e) {
    console.log('FAIL 构建产物 module 执行失败 — ' + String(e?.stack || e));
    process.exit(1);
  }
  // 等 __rs 出现（Vue 已挂载），最多 10s
  let rs = null;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    rs = window.__rs;
    if (rs) break;
  }
  if (!rs) { check('应用启动（__rs 可用）', false, '超时'); process.exit(1); }
  await sleep(300);
  const text = sel => document.querySelector(sel)?.textContent || '';
  const click = sel => document.querySelector(sel)?.click();
  const savedJsonBlob = () => [...blobRegistry.values()].find(b => String(b.type).includes('json'));
  return { dom, document, window, errors, netCalls, blobRegistry, rs, text, click, savedJsonBlob };
}

function buildScene(rs) {
  const w1 = rs.addObject({ type: 'wall', x: 0, y: 0, points: [[0, 0], [4000, 0]], wallWidth: 120 });
  rs.addObject({ type: 'door', x: 1000, y: 0, w: 900, dir: 1, wallId: w1.id, wallSeg: 0, wallT: 0.25 });
  rs.addObject({ type: 'polyroom', x: 0, y: 0, points: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], stroke: 12 });
  rs.addObject({ type: 'furniture', x: 500, y: 500, w: 2000, h: 1500, label: '双人床' });
  return w1.id;
}

// ---------- 场景 1：保存→打开往返 ----------
{
  const a = await bootApp();
  const w1 = buildScene(a.rs);
  a.click('#save-btn');
  await sleep(300);
  const blob = a.savedJsonBlob();
  check('S1 保存产出 JSON blob', !!blob, blob ? `type=${blob.type}` : '无 json blob');
  const saved = JSON.parse(await blob.text());
  check('S1 保存文件元数据为 2.0.2', saved.format === 'roomsketch' && saved.schemaVersion === 1 && saved.appVersion === '2.0.2',
    `format=${saved.format} schema=${saved.schemaVersion} app=${saved.appVersion}`);
  check('S1 保存文件含 4 个对象且门有关联', saved.objects.length === 4 &&
    saved.objects.find(o => o.type === 'door')?.wallId === w1, `door.wallId=${saved.objects.find(o => o.type === 'door')?.wallId}`);
  // 新建清空后经文件输入打开刚保存的 JSON
  [...a.document.querySelectorAll('.topbar .actions button')].find(x => x.textContent.trim() === '新建')?.click();
  await sleep(200);
  a.document.querySelector('.modal .primary')?.click(); // 确认新建
  await sleep(200);
  check('S1 新建后画布已空', a.rs.objects.length === 0, `objects=${a.rs.objects.length}`);
  const input = a.document.querySelector('#file-project');
  const file = new a.window.File([JSON.stringify(saved)], 'test.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new a.window.Event('change', { bubbles: true }));
  await sleep(500); // 等 FileReader 异步回调
  check('S1 打开保存文件恢复 4 个对象', a.rs.objects.length === 4, `objects=${a.rs.objects.length}`);
  check('S1 打开后门墙关联保留', a.rs.objects.find(o => o.type === 'door')?.wallId === w1,
    `door.wallId=${a.rs.objects.find(o => o.type === 'door')?.wallId}`);
  check('S1 打开成功有提示', /已载入 4 个对象/.test(a.text('.toast')), a.text('.toast'));
  check('S1 全程无 JS 错误', a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
  check('S1 全程零网络请求', a.netCalls.length === 0, a.netCalls.map(c => c.join(' ')).join(' | '));
  a.dom.window.close();
}

// ---------- 场景 2：旧格式兼容 ----------
{
  const a = await bootApp();
  const oldDoc = {
    app: 'RoomSketch', version: 2,
    objects: [{ id: 'w-old', type: 'wall', x: 0, y: 0, points: [[0, 0], [3000, 0]], wallWidth: 120 }],
    view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50,
  };
  const r1 = a.rs.openProjectText(JSON.stringify(oldDoc));
  check('S2 旧版 {app, version:2} 可打开并标记升级', r1.ok === true && r1.upgraded === true, JSON.stringify(r1));
  check('S2 旧版对象保留', a.rs.objects.length === 1 && a.rs.objects[0].id === 'w-old', `objects=${a.rs.objects.length}`);
  a.click('#save-btn');
  await sleep(300);
  const saved = JSON.parse(await a.savedJsonBlob().text());
  check('S2 旧版保存后升级为 2.0.2 格式', saved.format === 'roomsketch' && saved.appVersion === '2.0.2' && saved.objects.length === 1,
    `format=${saved.format} app=${saved.appVersion}`);
  const v1Doc = {
    format: 'roomsketch', schemaVersion: 1, appVersion: '1.0.0',
    objects: [{ id: 'w-1', type: 'wall', x: 0, y: 0, points: [[0, 0], [2000, 0]], wallWidth: 120 }],
    view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50,
  };
  const r2 = a.rs.openProjectText(JSON.stringify(v1Doc));
  check('S2 1.0.0 新格式文件可打开（不标记升级）', r2.ok === true && r2.upgraded !== true, JSON.stringify(r2));
  check('S2 1.0.0 文件对象保留', a.rs.objects.length === 1 && a.rs.objects[0].id === 'w-1', `objects=${a.rs.objects.length}`);
  a.dom.window.close();
}

// ---------- 场景 3：损坏/不支持的工程文件被拒且不动 ----------
{
  const a = await bootApp();
  buildScene(a.rs);
  const before = a.rs.objects.length;
  const r1 = a.rs.openProjectText(JSON.stringify({ format: 'roomsketch', schemaVersion: 99, objects: [] }));
  check('S3 schemaVersion 99 被拒', r1.ok === false && /不受支持/.test(r1.error || ''), r1.error || '');
  const r2 = a.rs.openProjectText('{ not json');
  check('S3 非 JSON 被拒', r2.ok === false, r2.error || '');
  const r3 = a.rs.openProjectText(JSON.stringify({ format: 'other', objects: [] }));
  check('S3 非 RoomSketch 文件被拒', r3.ok === false, r3.error || '');
  const r4 = a.rs.openProjectText(JSON.stringify({ format: 'roomsketch', schemaVersion: 1, objects: [{ noType: 1 }] }));
  check('S3 对象损坏被拒', r4.ok === false, r4.error || '');
  check('S3 四次拒绝后当前工程不动', a.rs.objects.length === before, `objects=${a.rs.objects.length}`);
  a.dom.window.close();
}

// ---------- 场景 4：自动备份端到端（写→新实例恢复条→确认 / 忽略）----------
{
  const a = await bootApp();
  buildScene(a.rs);
  await sleep(1400); // 等 900ms 防抖写备份
  const backupJson = a.window.localStorage.getItem(BACKUP_KEY);
  check('S4 编辑后自动备份已写 localStorage', !!backupJson, backupJson ? `${backupJson.length} 字节` : '无');
  const backup = JSON.parse(backupJson);
  check('S4 备份含 4 个对象 + 2.0.2 元数据', backup.objects.length === 4 && backup.appVersion === '2.0.2' && backup.schemaVersion === 1,
    `objects=${backup.objects.length} app=${backup.appVersion}`);
  // 新实例：恢复条出现 → 确认恢复
  const b = await bootApp({ seedBackup: backupJson });
  check('S4 新实例出现恢复条', !!b.document.querySelector('#restore-bar'), b.text('#restore-bar').slice(0, 40));
  check('S4 恢复条含对象数', /4 个对象/.test(b.text('#restore-bar')), b.text('#restore-bar').slice(0, 60));
  check('S4 恢复条提示非正式文件', /不是正式工程文件/.test(b.text('#restore-bar')), '');
  check('S4 恢复前画布为空（不自动覆盖）', b.rs.objects.length === 0, `objects=${b.rs.objects.length}`);
  b.document.querySelector('#restore-bar .primary')?.click();
  await sleep(300);
  check('S4 确认恢复后 4 个对象回来', b.rs.objects.length === 4, `objects=${b.rs.objects.length}`);
  check('S4 恢复后门墙关联保留', b.rs.objects.find(o => o.type === 'door')?.wallId === backup.objects.find(o => o.type === 'door')?.wallId, '');
  check('S4 恢复后状态提示', /已恢复自动备份/.test(b.text('.statusbar')), b.text('.statusbar'));
  check('S4 恢复后无 JS 错误', b.errors.length === 0, b.errors.slice(0, 2).join(' | '));
  b.dom.window.close();
  // 新实例：忽略恢复
  const c = await bootApp({ seedBackup: backupJson });
  check('S4 忽略实例也有恢复条', !!c.document.querySelector('#restore-bar'), '');
  const dismissBtn = [...c.document.querySelectorAll('#restore-bar button')].find(x => x.textContent === '忽略');
  dismissBtn?.click();
  await sleep(200);
  check('S4 点忽略后恢复条消失、画布仍空', !c.document.querySelector('#restore-bar') && c.rs.objects.length === 0,
    `bar=${!!c.document.querySelector('#restore-bar')} objects=${c.rs.objects.length}`);
  c.dom.window.close();
  a.dom.window.close();
}

// ---------- 场景 5：损坏备份不出现恢复条、不报错 ----------
{
  const bads = [
    ['objects 不是数组', JSON.stringify({ format: 'roomsketch', schemaVersion: 1, objects: 'x' })],
    ['对象缺 type', JSON.stringify({ format: 'roomsketch', schemaVersion: 1, objects: [{ noType: 1 }] })],
    ['未来 schemaVersion', JSON.stringify({ format: 'roomsketch', schemaVersion: 99, objects: [{ id: 'w', type: 'wall', x: 0, y: 0, points: [[0, 0], [100, 0]] }] })],
    ['非 JSON', 'not json{{{'],
    ['空对象数组', JSON.stringify({ format: 'roomsketch', schemaVersion: 1, objects: [] })],
  ];
  for (const [label, seed] of bads) {
    const a = await bootApp({ seedBackup: seed });
    check(`S5 损坏备份不出现恢复条（${label}）`, !a.document.querySelector('#restore-bar'), a.text('#restore-bar').slice(0, 30));
    check(`S5 损坏备份不报错（${label}）`, a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
    a.dom.window.close();
  }
}

// ---------- 场景 6：存储不可用时降级 ----------
{
  const a = await bootApp({ breakStorage: true });
  check('S6 存储被禁也能挂载', !!a.rs, '');
  buildScene(a.rs);
  await sleep(1400); // 等备份防抖触发失败
  check('S6 备份失败状态可见', /自动备份失败/.test(a.text('#saveState')), a.text('#saveState'));
  check('S6 备份失败 toast 提示一次', /自动备份失败/.test(a.text('.toast')), a.text('.toast'));
  check('S6 存储被禁无恢复条', !a.document.querySelector('#restore-bar'), '');
  a.click('#save-btn');
  await sleep(300);
  check('S6 存储被禁时保存仍可用', !!a.savedJsonBlob(), '无 json blob');
  const r = a.rs.openProjectText(JSON.stringify({
    format: 'roomsketch', schemaVersion: 1, appVersion: '2.0.0',
    objects: [{ id: 'w-x', type: 'wall', x: 0, y: 0, points: [[0, 0], [1500, 0]], wallWidth: 120 }],
    view: { x: 0, y: 0, w: 12000, h: 8000 }, scale: 50,
  }));
  check('S6 存储被禁时打开仍可用', r.ok === true && a.rs.objects.length === 1, JSON.stringify(r));
  check('S6 全程无 JS 错误', a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
  a.dom.window.close();
}

console.log(`\n合计 ${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exit(failures ? 1 : 0);
