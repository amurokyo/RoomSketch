<!-- RoomSketch 2.0.2 — 顶层壳：顶栏 / 左栏 / 画布 / 属性栏 / 状态栏 / 自检面板 -->
<!-- 阶段五完成：3D 预览（ThreeView）与 PNG/SVG/PDF 统一导出（ExportDialog）已接通。 -->
<template>
  <div class="app" :class="{ dark }">
    <header class="topbar">
      <div class="brand">RoomSketch <span class="ver">2.0.2</span> <span class="tag">离线户型图</span></div>
      <div class="actions">
        <button @click="onNew">新建</button>
        <button id="save-btn" class="primary" @click="saveProjectFile">保存</button>
        <button @click="triggerFile('file-project')">打开</button>
        <button @click="triggerFile('file-pdf')">导入 PDF</button>
        <button @click="triggerFile('file-bg')">导入底图</button>
        <div class="menu-wrap">
          <button @click="exportMenuOpen = !exportMenuOpen">导出… ▾</button>
          <div v-if="exportMenuOpen" class="menu">
            <button @click="openExport('png')">PNG 图片</button>
            <button @click="openExport('svg')">SVG 矢量图</button>
            <button @click="openExport('pdf')">PDF 矢量图</button>
          </div>
        </div>
        <button @click="onThreePreview">3D 预览</button>
        <label class="scale-sel">出图比例
          <select v-model.number="state.scale" @change="onScaleChange">
            <option :value="25">1:25</option>
            <option :value="50">1:50</option>
            <option :value="100">1:100</option>
            <option :value="200">1:200</option>
          </select>
        </label>
        <button :disabled="!undoDepth" @click="undo">↩ 撤销</button>
        <button :disabled="!redoDepth" @click="redo">↪ 重做</button>
        <button @click="selfcheckOpen = !selfcheckOpen">自检</button>
        <button @click="toggleTheme">{{ dark ? '☀ 浅色' : '🌙 深色' }}</button>
      </div>
    </header>

    <div v-if="state.restoreCandidate" class="restore-bar" id="restore-bar">
      发现上次未保存的自动备份（{{ restoreText }}，{{ state.restoreCandidate.count }} 个对象）。缓存备份不是正式工程文件，请确认是否恢复。
      <button class="primary" @click="restoreBackup">恢复备份</button>
      <button @click="dismissRestore">忽略</button>
    </div>

    <main class="layout">
      <LeftPanel @zoom-in="zoomView(0.8)" @zoom-out="zoomView(1.25)" @fit-view="onFitView" />
      <section class="stage">
        <CanvasView ref="canvasRef" @calibrate="onCalibrate" />
      </section>
      <InspectorPanel />
    </main>

    <footer class="statusbar">
      <span :class="{ bad: !state.statusOk }">{{ state.statusMsg }}</span>
      <span>{{ objectCount }} 个对象</span>
      <span>面积合计 {{ areaTotal }}</span>
      <span id="saveState">{{ saveStateText }}</span>
      <span v-if="state.lastSavedAt">上次保存 {{ state.lastSavedAt.slice(0, 19).replace('T', ' ') }}</span>
    </footer>

    <section v-show="selfcheckOpen" id="selfcheck">
      <h2>自检面板</h2>
      <table>
        <tr><td>Vue 挂载</td><td id="check-vue">{{ checks.vue }}</td></tr>
        <tr><td>PDF.js</td><td id="check-pdf">{{ checks.pdf }}</td></tr>
        <tr><td>Three.js / WebGL</td><td id="check-three">{{ checks.three }}</td></tr>
        <tr><td>本地存储</td><td id="check-storage">{{ checks.storage }}</td></tr>
        <tr><td>构建信息</td><td id="check-build">{{ checks.build }}</td></tr>
      </table>
      <p class="hint">本页面为完全离线单文件：Vue / PDF.js / Three.js 全部内联，运行时不发起任何网络请求，双击即可在 file:// 下打开。</p>
    </section>

    <div v-if="modalState.open" class="modal-mask" @click.self="cancelModal">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>{{ modalState.title }}</h3>
        <p>{{ modalState.message }}</p>
        <div class="modal-btns">
          <button @click="cancelModal">取消</button>
          <button class="primary" :class="{ danger: modalState.danger }" @click="confirmModal">{{ modalState.confirmText }}</button>
        </div>
      </div>
    </div>

    <div v-if="calib.open" class="modal-mask" @click.self="calib.open = false">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>比例校准</h3>
        <p>图中两点距离为 {{ Math.round(calib.d) }} mm（图纸单位）。请输入这两点在现实中的实际距离：</p>
        <div class="field"><label>实际距离 (mm)</label><input v-model.number="calib.real" type="number" min="1"></div>
        <p class="hint">校准按比例缩放全部对象与视图；墙高与家具高度是真实物理高度，不随图纸比例重算（与旧版语义一致）。</p>
        <div class="modal-btns">
          <button @click="calib.open = false">取消</button>
          <button class="primary" @click="confirmCalibrate">确认校准</button>
        </div>
      </div>
    </div>

    <div v-if="pdfDlg.open" class="modal-mask" @click.self="pdfDlg.open = false">
      <div class="modal pdf-dlg" role="dialog" aria-modal="true">
        <h3>选择要导入的 PDF 页面</h3>
        <p>共 {{ pdfDlg.doc?.numPages }} 页；每页矢量线条将按页依次偏移 +100/+100 mm 导入，避免重叠。</p>
        <label v-for="p in pdfDlg.doc?.pages" :key="p.num" class="checkline">
          <input type="checkbox" :value="p.num" v-model="pdfDlg.selected">
          第 {{ p.num }} 页 · {{ p.w.toFixed(0) }}×{{ p.h.toFixed(0) }} mm · {{ p.vectorCount }} 个矢量算子
          <span v-if="p.hasForm"> · 含 Form XObject</span>
          <span v-if="p.hasImage"> · 含图像</span>
          <span v-if="!p.vectorCount"> · 无矢量（可转图片底图）</span>
        </label>
        <p v-if="pdfDlg.doc?.warnings.length" class="hint">{{ pdfDlg.doc.warnings.join('；') }}</p>
        <div class="modal-btns">
          <button @click="pdfDlg.open = false">取消</button>
          <button class="primary" :disabled="!pdfDlg.selected.length" @click="confirmPdfImport">导入选中页面（{{ pdfDlg.selected.length }}）</button>
        </div>
      </div>
    </div>

    <ThreeView v-if="state.threeOpen" @close="state.threeOpen = false" />
    <ExportDialog v-if="exportDlg.open" :format="exportDlg.format" @close="exportDlg.open = false" />

    <div v-if="state.toastMsg" class="toast">{{ state.toastMsg }}</div>

    <input id="file-project" type="file" accept="application/json,.json" hidden @change="onProjectFile">
    <input id="file-pdf" type="file" accept="application/pdf,.pdf" hidden @change="onPdfFile">
    <input id="file-bg" type="file" accept="image/*" hidden @change="onBgFile">
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { version as vueVersion } from 'vue';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import CanvasView from './components/CanvasView.vue';
import LeftPanel from './components/LeftPanel.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import ThreeView from './components/ThreeView.vue';
import ExportDialog from './components/ExportDialog.vue';
import { REVISION as THREE_REVISION } from 'three';
import {
  state, undo, redo, undoDepth, redoDepth, objectCount, areaTotal,
  saveProjectFile, openProjectText, newProject, applyCalibration,
  fitView, zoomView, addObject, snapshot, markDirty, setStatus, toast,
  saveBackup, checkRestoreCandidate, finishBoot, restoreBackup, dismissRestore, uid,
} from './store.ts';
import { modalState, confirmModal, cancelModal, showConfirm } from './modal.ts';
import { loadPdfDocument, type PdfDocument } from './model/pdfVector.ts';
import { probeStorage } from './model/storage.ts';
import { APP_VERSION } from './version.ts';
import testPdfUrl from './assets/test.pdf?url';

const canvasRef = ref<InstanceType<typeof CanvasView> | null>(null);
const dark = ref(false);
const selfcheckOpen = ref(false);
const exportMenuOpen = ref(false);
const exportDlg = ref<{ open: boolean; format: 'png' | 'svg' | 'pdf' }>({ open: false, format: 'png' });
const checks = ref({ vue: '未挂载', pdf: '未检测', three: '未检测', storage: '未检测', build: '' });

// ---- 主题：localStorage rs-theme，带 try/catch；matchMedia 必须有守卫（1.0.0 曾无守卫中断启动） ----
function initTheme(): void {
  try {
    const t = localStorage.getItem('rs-theme');
    if (t === 'dark') { dark.value = true; return; }
    if (t === 'light') { dark.value = false; return; }
  } catch { /* 存储不可用时用系统偏好 */ }
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) dark.value = true;
  } catch { /* ignore */ }
}
function toggleTheme(): void {
  dark.value = !dark.value;
  try { localStorage.setItem('rs-theme', dark.value ? 'dark' : 'light'); } catch { /* ignore */ }
}

const saveStateText = computed(() => {
  if (state.bkFailed) return '自动备份失败：浏览器存储不可用';
  if (state.dirty) return '未保存';
  if (state.lastSavedAt) return '已保存';
  return '已就绪';
});
const restoreText = computed(() => {
  const at = state.restoreCandidate?.at;
  if (!at) return '';
  return new Date(at).toLocaleString('zh-CN', { hour12: false });
});

function triggerFile(id: string): void {
  (document.getElementById(id) as HTMLInputElement | null)?.click();
}
function resetFileInput(e: Event): void { (e.target as HTMLInputElement).value = ''; }

function onNew(): void {
  const run = () => { newProject(); toast('已新建空白工程'); };
  if (state.dirty) {
    showConfirm({
      title: '新建空白工程？', message: '当前画布有未保存的更改，新建会清空全部对象（可按 Ctrl+Z 撤销）。',
      confirmText: '确认新建', danger: true, onConfirm: run,
    });
  } else run();
}

function onScaleChange(): void {
  state.doc.scale = state.scale;
  markDirty();
  setStatus(`出图比例已改为 1:${state.scale}`);
}

function onFitView(): void {
  const s = canvasRef.value?.getCanvasSize?.() ?? { w: 800, h: 500 };
  fitView(s.w, s.h);
}

function onThreePreview(): void {
  state.threeOpen = true;
}

function openExport(format: 'png' | 'svg' | 'pdf'): void {
  exportMenuOpen.value = false;
  exportDlg.value = { open: true, format };
}

// ---- 工程文件 ----
function onProjectFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  resetFileInput(e);
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const r = openProjectText(String(reader.result));
    if (!r.ok) { toast('打开失败：' + (r.error ?? '格式不正确')); setStatus('打开工程文件失败：' + (r.error ?? '格式不正确'), false); }
  };
  reader.onerror = () => { toast('读取文件失败'); setStatus('读取工程文件失败', false); };
  reader.readAsText(f);
}

// ---- PDF 导入 ----
async function onPdfFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  resetFileInput(e);
  if (!f) return;
  let buf: ArrayBuffer;
  try { buf = await f.arrayBuffer(); } catch (err) { toast('读取 PDF 失败：' + String(err)); return; }
  let doc: PdfDocument;
  try {
    doc = await loadPdfDocument(buf);
  } catch (err) {
    toast('PDF 加载失败：' + String(err));
    setStatus('PDF 加载失败：' + String(err), false);
    return;
  }
  if (doc.numPages === 1) {
    await importPdfPages(doc, [1]);
    return;
  }
  pdfDlg.value = { open: true, doc, selected: doc.pages.map(p => p.num) };
}

const pdfDlg = ref<{ open: boolean; doc: PdfDocument | null; selected: number[] }>({
  open: false, doc: null, selected: [],
});

async function confirmPdfImport(): Promise<void> {
  const doc = pdfDlg.value.doc;
  const nums = [...pdfDlg.value.selected].sort((a, b) => a - b);
  pdfDlg.value.open = false;
  pdfDlg.value.doc = null;
  if (!doc || !nums.length) return;
  await importPdfPages(doc, nums);
}

/** 逐页提取矢量并导入；无矢量页提示转图片底图；失败不改动已有工程。 */
async function importPdfPages(doc: PdfDocument, nums: number[]): Promise<void> {
  snapshot();
  let added = 0;
  const emptyPages: number[] = [];
  try {
    for (let idx = 0; idx < nums.length; idx++) {
      const num = nums[idx];
      const vecs = await doc.extractPageVectors(num);
      if (!vecs.length) { emptyPages.push(num); continue; }
      const ox = idx * 100, oy = idx * 100;
      const pageInfo = doc.pages.find(p => p.num === num);
      if (pageInfo) {
        state.doc.pdfPageSizes = state.doc.pdfPageSizes || {};
        state.doc.pdfPageSizes[String(num)] = { w: pageInfo.w, h: pageInfo.h };
      }
      for (const v of vecs) {
        state.doc.objects.push({
          type: 'pdf', id: uid(), x: 0, y: 0,
          points: v.points.map(p => [p[0] + ox, p[1] + oy] as [number, number]),
          stroke: v.stroke, strokeColor: v.strokeColor,
          pdfStrokeColor: v.pdfStrokeColor, closed: v.closed, pdfOrigin: true, pdfPage: num,
        });
        added++;
      }
    }
  } catch (err) {
    toast('PDF 提取失败：' + String(err));
    setStatus('PDF 提取失败：' + String(err), false);
    await doc.destroy();
    return;
  }
  if (added > 0) {
    const first = doc.pages.find(p => p.num === nums[0]);
    state.doc.pdfImported = true;
    if (first) state.doc.pdfPageSize = { w: first.w, h: first.h };
    onFitView();
    markDirty();
    setStatus(`已导入 PDF（${nums.length} 页，${added} 个矢量对象）`);
    toast(`已导入 PDF：${added} 个矢量对象${emptyPages.length ? `；第 ${emptyPages.join('、')} 页无矢量` : ''}`);
  } else {
    setStatus('PDF 中没有可提取的矢量线条', false);
    toast('该 PDF 没有可提取的矢量线条');
  }
  if (doc.warnings.length) toast(doc.warnings[0]);
  if (emptyPages.length) {
    // 扫描页确认前不能销毁 PDF 文档；取消也必须释放，避免 Worker / 内存泄漏。
    showConfirm({
      title: '无矢量页转图片底图？',
      message: `第 ${emptyPages.join('、')} 页没有可提取的矢量线条（可能是扫描页），是否把这些页渲染成图片作为底图导入？`,
      confirmText: '渲染为底图',
      onConfirm: async () => {
        try {
          for (const num of emptyPages) {
            try {
              const img = await doc.renderPageImage(num, 2);
              addObject({ type: 'imagebg', x: 0, y: 0, w: img.w, h: img.h, src: img.dataUrl, srcW: img.pxW, srcH: img.pxH });
            } catch (err) { toast(`第 ${num} 页渲染失败：` + String(err)); }
          }
          setStatus('扫描页已渲染为图片底图');
        } finally {
          await doc.destroy();
        }
      },
      onCancel: async () => { await doc.destroy(); },
    });
    return;
  }
  await doc.destroy();
}

// ---- 底图导入 ----
function onBgFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  resetFileInput(e);
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const cap = 12000;
      if (w > cap || h > cap) { const k = cap / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      addObject({ type: 'imagebg', x: 0, y: 0, w, h, src: dataUrl, srcW: img.naturalWidth, srcH: img.naturalHeight });
      onFitView();
      toast('底图已导入');
    };
    img.onerror = () => { toast('图片读取失败'); setStatus('底图图片读取失败', false); };
    img.src = dataUrl;
  };
  reader.onerror = () => { toast('读取图片失败'); setStatus('读取底图文件失败', false); };
  reader.readAsDataURL(f);
}

// ---- 校准对话框 ----
const calib = ref({ open: false, d: 0, real: 0 });
function onCalibrate(payload: { d: number; p1: { x: number; y: number }; p2: { x: number; y: number } }): void {
  calib.value = { open: true, d: payload.d, real: Math.round(payload.d) };
}
function confirmCalibrate(): void {
  const real = Number(calib.value.real);
  if (!real || real <= 0) { toast('请输入大于 0 的实际距离'); return; }
  calib.value.open = false;
  applyCalibration(real / calib.value.d);
  toast(`比例校准完成（×${(real / calib.value.d).toFixed(3)}）`);
}

// ---- 自检面板 ----
function testPdfBytes(): Uint8Array {
  if (testPdfUrl.startsWith('data:')) {
    const b64 = testPdfUrl.slice(testPdfUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  throw new Error('测试 PDF 未内联为 data URL（构建配置问题）');
}

function checkWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function runSelfChecks(): Promise<void> {
  checks.value.vue = `Vue ${vueVersion} 已挂载 · RoomSketch ${APP_VERSION}`;
  const depVersions = JSON.parse(__DEP_VERSIONS__);
  checks.value.build = `构建时间 ${__BUILD_TIME__} · RoomSketch ${APP_VERSION} · vue ${depVersions.vue} · pdfjs-dist ${depVersions['pdfjs-dist']} · three ${depVersions.three} · vite ${depVersions.vite}（构建时）`;
  // 阶段五已接入 Three.js 渲染：自检只探测 WebGL 可用性，真实渲染在 3D 预览里。
  checks.value.three = `Three.js r${THREE_REVISION} · WebGL ${checkWebGL() ? '可用' : '不可用（已降级）'} · 三维渲染已接入`;
  try {
    const probe = await probeStorage();
    checks.value.storage =
      `localStorage ${probe.localStorage ? '可用' : '不可用' + (probe.localStorageError ? '：' + probe.localStorageError : '')}` +
      `；IndexedDB ${probe.indexedDB ? '可用' : '不可用' + (probe.indexedDBError ? '：' + probe.indexedDBError : '')}`;
  } catch (e) {
    checks.value.storage = '存储检测失败：' + String(e);
  }
  try {
    const bytes = testPdfBytes();
    const doc = await loadPdfDocument(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const modeText = doc.mode === 'blob' ? 'Blob Worker' : '主线程（fake worker）';
    checks.value.pdf = `PDF.js ${(pdfjs as unknown as { version: string }).version} · ${modeText} · 测试 PDF ${doc.numPages} 页可解析`;
    await doc.destroy();
  } catch (e) {
    checks.value.pdf = 'PDF.js 自检失败：' + String(e);
  }
}

onMounted(async () => {
  initTheme();
  checkRestoreCandidate();
  await runSelfChecks();
  finishBoot();
  window.addEventListener('beforeunload', saveBackup);
});
onUnmounted(() => { window.removeEventListener('beforeunload', saveBackup); });
</script>

<style>
body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; margin: 0; background: #f4f6fa; color: #1c2733; }
.app { height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #fff; border-bottom: 1px solid #dfe5ee; flex-wrap: wrap; }
.brand { font-size: 20px; font-weight: 700; white-space: nowrap; }
.brand .ver { color: #2874dc; font-size: 14px; }
.brand .tag { font-size: 12px; color: #7a8698; font-weight: 400; }
.actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-left: auto; }
button { padding: 6px 12px; border: 1px solid #c4cede; background: #fff; border-radius: 6px; cursor: pointer; color: inherit; }
button:hover:not(:disabled) { background: #eef3fb; }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: #2874dc; color: #fff; border-color: #2874dc; }
button.primary:hover:not(:disabled) { background: #1f63c4; }
button.danger { background: #c0392b; color: #fff; border-color: #c0392b; }
button.danger:hover:not(:disabled) { background: #a93226; }
.scale-sel { font-size: 13px; color: #54627a; display: flex; align-items: center; gap: 4px; }
.scale-sel select { padding: 5px; border: 1px solid #c4cede; border-radius: 6px; background: #fff; color: inherit; }
.menu-wrap { position: relative; }
.menu { position: absolute; right: 0; top: 34px; background: #fff; border: 1px solid #dfe5ee; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.12); padding: 4px; z-index: 50; min-width: 160px; }
.menu button { display: block; width: 100%; text-align: left; border: none; background: none; }
.menu button:hover { background: #eef3fb; }
.menu-note { font-size: 12px; color: #7a8698; padding: 6px 10px; }
.restore-bar { background: #fff8e1; border-bottom: 1px solid #f0d48a; padding: 8px 14px; font-size: 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.layout { flex: 1; display: flex; min-height: 0; }
.stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 10px; }
.statusbar { display: flex; gap: 18px; padding: 6px 14px; background: #fff; border-top: 1px solid #dfe5ee; font-size: 13px; color: #54627a; flex-wrap: wrap; }
.statusbar .bad { color: #c0392b; font-weight: 600; }
.property-summary { background: #f7f9fc; border: 1px solid #e3e9f1; border-radius: 8px; padding: 10px; font-size: 13px; line-height: 1.5; }
.inspector-empty { text-align: center; color: #7a8698; padding: 22px 0; font-size: 13px; }
.inspector-empty .big { font-size: 30px; margin-bottom: 5px; }
.prop-actions { display: flex; gap: 6px; margin-top: 10px; }
.prop-actions button { flex: 1; }
.pdf-info-box { font-size: 12px; color: #7a8698; line-height: 1.55; background: #f7f9fc; border: 1px solid #e3e9f1; border-radius: 6px; padding: 8px; }
.tipbox { margin-top: 15px; padding: 10px; background: #f2f7ff; border: 1px solid #d8e5fa; border-radius: 8px; font-size: 12px; color: #4a5b72; line-height: 1.65; }
.layer-list { display: flex; flex-direction: column; gap: 5px; }
.layer-row { display: grid; grid-template-columns: 1fr auto auto auto auto; align-items: center; gap: 4px; background: #f7f9fc; border: 1px solid #e3e9f1; border-radius: 6px; padding: 5px 7px; font-size: 13px; }
.layer-row.hidden { opacity: .55; }
.layer-row.locked { border-color: #f0d48a; background: #fff8e1; }
.layer-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.layer-name small { color: #7a8698; margin-left: 4px; font-size: 11px; }
.layer-btn { border: none; background: none; padding: 2px 4px; font-size: 12px; cursor: pointer; }
.layer-btn:disabled { opacity: .3; cursor: default; }
.layer-btn input { margin: 0; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
.stat-cell { background: #f7f9fc; border: 1px solid #e3e9f1; border-radius: 6px; padding: 8px; text-align: center; }
.stat-cell b { display: block; font-size: 14px; }
.stat-cell span { color: #7a8698; font-size: 12px; }
.zone-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.zone-row { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; background: #f7f9fc; border-radius: 5px; padding: 5px 7px; }
.room-list { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; margin-bottom: 8px; }
.room-row { display: grid; grid-template-columns: 14px 1fr auto; align-items: center; gap: 6px; text-align: left; font-size: 12px; padding: 5px 7px; }
.room-swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(0,0,0,.15); }
.room-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.room-name small { display: block; color: #7a8698; font-size: 10px; }
.room-row b.muted { color: #98a2b0; font-weight: 500; }
#selfcheck { background: #fff; border-top: 1px solid #dfe5ee; padding: 12px 16px; }
#selfcheck h2 { font-size: 16px; margin: 0 0 8px; }
#selfcheck table { border-collapse: collapse; width: 100%; }
#selfcheck td { border: 1px solid #dfe5ee; padding: 7px 9px; vertical-align: top; font-size: 13px; }
#selfcheck td:first-child { width: 130px; font-weight: 600; background: #f7f9fc; }
.hint { color: #7a8698; font-size: 13px; }
.modal-mask { position: fixed; inset: 0; background: rgba(20,30,45,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 10px; padding: 20px; width: 420px; max-width: calc(100vw - 32px); max-height: calc(100vh - 60px); overflow: auto; color: #1c2733; }
.modal.pdf-dlg { width: 520px; }
.modal h3 { margin: 0 0 10px; font-size: 17px; }
.modal p { margin: 8px 0; font-size: 14px; line-height: 1.6; }
.modal-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.field { margin: 8px 0; }
.field label { display: block; font-size: 13px; color: #54627a; margin-bottom: 4px; }
.field input { width: 100%; box-sizing: border-box; padding: 7px; border: 1px solid #c4cede; border-radius: 6px; font-size: 14px; }
.checkline { display: flex; gap: 6px; align-items: center; padding: 7px 2px; font-size: 14px; border-bottom: 1px solid #eef1f5; cursor: pointer; }
.toast { position: fixed; left: 50%; bottom: 54px; transform: translateX(-50%); background: #1c2733; color: #fff; padding: 9px 16px; border-radius: 8px; font-size: 14px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,.25); max-width: calc(100vw - 32px); }
/* 左栏 / 属性栏 / 画布的通用样式（组件内未定义的部分） */
.panel { width: 260px; flex: none; min-height: 0; overflow-y: auto; background: #fff; border-right: 1px solid #dfe5ee; padding: 12px; box-sizing: border-box; }
.panel.left { border-right: 1px solid #dfe5ee; }
.panel.right { border-right: none; border-left: 1px solid #dfe5ee; }
.panel .section { margin-bottom: 18px; }
.panel-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tool-grid .tool { display: flex; gap: 6px; align-items: center; justify-content: flex-start; font-size: 13px; padding: 7px 8px; }
.tool-grid .tool.active { background: #2874dc; color: #fff; border-color: #2874dc; }
.tool-grid .ico { font-size: 15px; }
.field-row { display: flex; gap: 8px; margin: 6px 0; }
.field-row .field { flex: 1; min-width: 0; }
.field-row button { flex: 1; }
.field input, .field select { width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid #c4cede; border-radius: 6px; font-size: 13px; background: #fff; color: inherit; }
.furn-search { width: 100%; box-sizing: border-box; padding: 7px; border: 1px solid #c4cede; border-radius: 6px; margin-bottom: 8px; }
.furn-cats { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.furn-cat { font-size: 12px; padding: 4px 8px; }
.furn-cat.active { background: #2874dc; color: #fff; border-color: #2874dc; }
.furn-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.furn-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; font-size: 13px; text-align: left; }
.furn-item span { font-size: 12px; color: #7a8698; }
.kbd { background: #eef1f5; border: 1px solid #d5dce5; border-radius: 4px; padding: 0 5px; font-size: 12px; }
.stage-head { font-size: 13px; color: #54627a; display: flex; gap: 8px; align-items: center; padding: 2px 2px 8px; }
.pdf-badge { background: #e8f5e9; color: #2e7d32; border-radius: 4px; padding: 2px 7px; font-size: 12px; }
.canvas-wrap { flex: 1; min-height: 0; position: relative; background: #fff; border: 1px solid #dfe5ee; border-radius: 8px; overflow: hidden; }
#canvas { width: 100%; height: 100%; display: block; touch-action: none; }
#canvas .bbox { fill: none; stroke: #2874dc; stroke-width: 2; stroke-dasharray: 6 4; }
#canvas .handle { fill: #fff; stroke: #2874dc; stroke-width: 2; cursor: nwse-resize; }
#canvas .vhandle { fill: #fff; stroke: #2874dc; stroke-width: 2; cursor: move; }
#canvas .unlinked { fill: none; stroke: #e6a817; stroke-width: 2; stroke-dasharray: 5 4; }
#canvas .marquee-box { fill: rgba(40,116,220,.12); stroke: #2874dc; stroke-width: 2; stroke-dasharray: 5 4; }
#canvas .marquee-box.sel-box { fill: rgba(40,116,220,.08); }
#canvas .marquee-selected { opacity: .55; }
.finish-btn { position: absolute; right: 12px; bottom: 12px; }
.inspector .row { display: flex; gap: 8px; margin: 6px 0; align-items: center; }
.inspector .row label { flex: 1; font-size: 13px; color: #54627a; }
.inspector .row input, .inspector .row select { width: 110px; padding: 5px; border: 1px solid #c4cede; border-radius: 6px; font-size: 13px; background: #fff; color: inherit; }
.inspector .stat { font-size: 13px; color: #54627a; line-height: 1.8; }
/* 深色主题 */
.app.dark { background: #161b22; color: #e6e9ee; }
.app.dark body { background: #161b22; }
.app.dark .topbar, .app.dark .statusbar, .app.dark #selfcheck { background: #1e242e; border-color: #2e3846; color: #e6e9ee; }
.app.dark .panel { background: #1e242e; border-color: #2e3846; }
.app.dark .canvas-wrap { background: #222a35; border-color: #2e3846; }
.app.dark button { background: #262e3a; border-color: #3a4656; color: #e6e9ee; }
.app.dark button:hover:not(:disabled) { background: #303a49; }
.app.dark button.primary { background: #2874dc; border-color: #2874dc; color: #fff; }
.app.dark .scale-sel select, .app.dark .field input, .app.dark .field select, .app.dark .furn-search { background: #262e3a; border-color: #3a4656; color: #e6e9ee; }
.app.dark .menu { background: #262e3a; border-color: #3a4656; }
.app.dark .menu button:hover { background: #303a49; }
.app.dark .modal { background: #262e3a; color: #e6e9ee; }
.app.dark #selfcheck td { border-color: #2e3846; }
.app.dark #selfcheck td:first-child { background: #222a35; }
.app.dark .restore-bar { background: #3a2f10; border-color: #6b5518; color: #f5e6b3; }
.app.dark .hint { color: #9aa7b8; }
.app.dark .property-summary, .app.dark .stat-cell, .app.dark .zone-row,
.app.dark .pdf-info-box, .app.dark .layer-row { background: #222a35; border-color: #3a4656; }
.app.dark .tipbox { background: #243040; border-color: #354a63; color: #d6e1f0; }
.app.dark .layer-row.locked { background: #3a2f10; border-color: #6b5518; }
.app.dark .room-swatch { border-color: rgba(255,255,255,.25); }
.app.dark .kbd { background: #303a49; border-color: #3a4656; }
.app.dark .inspector .row input, .app.dark .inspector .row select { background: #262e3a; border-color: #3a4656; color: #e6e9ee; }
@media (max-width: 900px) {
  .app { height: auto; min-height: 100vh; overflow: visible; }
  .layout { flex-direction: column; overflow: visible; }
  .panel { width: 100%; border-right: none; border-bottom: 1px solid #dfe5ee; max-height: 260px; }
  .panel.right { border-left: none; border-top: 1px solid #dfe5ee; }
  .stage { min-height: 420px; }
}
</style>
