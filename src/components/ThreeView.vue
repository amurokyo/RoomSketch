<!-- RoomSketch 2.0.2 — 3D 整体预览（Three.js，阶段五） -->
<!-- 手动轨道控制（拖拽旋转 / 滚轮缩放 / 重置视角 / Esc 关闭），不引 OrbitControls。 -->
<!-- 异常隔离：先算可渲染对象再决定内容——无对象时显示提示不建空白画布； -->
<!-- WebGL 不可用或渲染失败时显示降级信息与几何统计，不白屏、不阻断二维。 -->
<template>
  <div class="r3d-backdrop open">
    <div class="r3d-bar">
      <strong>⫯ 3D 整体预览</strong>
      <span class="r3d-hint">拖拽旋转 · 滚轮缩放 · Esc 关闭{{ unsupportedText }}</span>
      <span class="r3d-sp"></span>
      <button v-if="status === 'ready'" @click="resetView">重置视角</button>
      <button class="primary" @click="close">关闭</button>
    </div>
    <div class="r3d-wrap">
      <canvas v-show="status === 'ready'" ref="canvasEl" class="r3d-canvas"></canvas>
      <div v-if="status !== 'ready'" class="r3d-fallback">
        <p class="r3d-title">{{ fallbackTitle }}</p>
        <p>{{ fallbackMsg }}</p>
        <p v-if="statsText" class="r3d-stats">{{ statsText }}</p>
        <ul v-if="warnings.length" class="r3d-warns">
          <li v-for="w in warnings" :key="w.id + w.message">{{ w.type === 'door' ? '门' : '窗' }}：{{ w.message }}</li>
        </ul>
        <p class="hint">二维编辑、保存与导出不受影响。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { state } from '../store.ts';
import { collect3D, buildScene, probeWebGL, fitCameraToBox, validateOpenings, type OpeningWarning, type SceneStats } from '../model/threeScene.ts';

const emit = defineEmits<{ (e: 'close'): void }>();
const canvasEl = ref<HTMLCanvasElement | null>(null);

type Status = 'ready' | 'empty' | 'degraded';
const status = ref<Status>('degraded');
const fallbackTitle = ref('三维预览不可用');
const fallbackMsg = ref('');
const statsText = ref('');
const warnings = ref<OpeningWarning[]>([]);
const unsupportedText = computed(() => {
  const u = collectedUnsupported.value;
  const names: Record<string, string> = {
    door: '门', rect: '矩形', line: '辅助线', polyline: '折线',
    pdf: 'PDF线条', label: '文字', dimension: '尺寸标注', imagebg: '图片底图',
  };
  const parts = Object.entries(u).map(([t, n]) => `${names[t] || t}×${n}`);
  return parts.length ? ` · 未在 3D 中显示：${parts.join('、')}` : '';
});
const collectedUnsupported = ref<Record<string, number>>({});

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let box: THREE.Box3 | null = null;
let stats: SceneStats | null = null;
let alive = true;
let drag: { x: number; y: number } | null = null;
let pend = false;
const orbit = { yaw: 35, pitch: 32, zoom: 1 };
let ro: ResizeObserver | null = null;

function statsLine(s: SceneStats): string {
  return `墙体 ${s.wallPieces} 段 · 玻璃 ${s.glass} 块 · 地板 ${s.floors} 个 · 家具 ${s.items} 个 · 顶点 ${s.vertices} · 三角形 ${s.triangles}`;
}

function render(): void {
  if (!alive || !renderer || !scene || !camera || !box) return;
  const w = canvasEl.value?.clientWidth || 800, h = canvasEl.value?.clientHeight || 500;
  fitCameraToBox(camera, box, w / Math.max(1, h), orbit.yaw, orbit.pitch, orbit.zoom);
  renderer.render(scene, camera);
}

function requestRender(): void {
  if (pend) return;
  pend = true;
  requestAnimationFrame(() => { pend = false; render(); });
}

function resetView(): void {
  orbit.yaw = 35; orbit.pitch = 32; orbit.zoom = 1;
  requestRender();
}

function close(): void {
  alive = false;
  emit('close');
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.stopPropagation(); close(); }
}

function sizeRenderer(): void {
  const cv = canvasEl.value;
  if (!cv || !renderer) return;
  const w = cv.clientWidth || 800, h = cv.clientHeight || 500;
  const dpr = window.devicePixelRatio || 1;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(dpr);
}

onMounted(() => {
  // 1. 先算可渲染对象（1.0.0 曾先建遮罩后判断，无对象时留下一个关不掉的空白层）。
  const objects = state.doc.objects;
  const collected = collect3D(objects);
  collectedUnsupported.value = collected.unsupported;
  warnings.value = [];
  if (!collected.floors.length && !collected.walls.length && !collected.items.length) {
    status.value = 'empty';
    fallbackTitle.value = '没有可生成 3D 的对象';
    fallbackMsg.value = '画布中没有可生成 3D 的对象（需要墙体 / 房间 / 家具）。';
    return;
  }
  // 2. WebGL 探测：不可用则降级显示几何统计，不建 Renderer。
  const webgl = probeWebGL();
  if (!webgl.ok) {
    status.value = 'degraded';
    fallbackTitle.value = 'WebGL 不可用，三维预览已降级';
    fallbackMsg.value = `原因：${webgl.reason}。仅显示几何校验结果：`;
    statsText.value = `墙段 ${collected.walls.length} 块 · 地板 ${collected.floors.length} 个 · 家具 ${collected.items.length} 个`;
    warnings.value = validateOpenings(objects);
    return;
  }
  // 3. 建场景 + 渲染；任何一步抛错都降级，不阻断二维。
  try {
    const built = buildScene(objects);
    scene = built.scene;
    stats = built.stats;
    box = built.box;
    warnings.value = built.warnings;
    collectedUnsupported.value = built.unsupported;
    const dark = !!document.querySelector('.app')?.classList.contains('dark');
    scene.background = new THREE.Color(dark ? 0x0c1426 : 0xf2f4f9);
    const cv = canvasEl.value;
    if (!cv) throw new Error('找不到 3D 画布');
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 200000);
    sizeRenderer();
    status.value = 'ready';
    statsText.value = statsLine(stats);
    requestRender();
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { sizeRenderer(); requestRender(); });
      ro.observe(cv);
    }
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointercancel', onPointerUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey, true);
  } catch (e) {
    status.value = 'degraded';
    fallbackTitle.value = '三维渲染失败，已降级';
    fallbackMsg.value = '原因：' + String(e instanceof Error ? e.message : e) + '。';
    statsText.value = `墙段 ${collected.walls.length} 块 · 地板 ${collected.floors.length} 个 · 家具 ${collected.items.length} 个`;
    warnings.value = validateOpenings(objects);
  }
});

function onPointerDown(e: PointerEvent): void {
  drag = { x: e.clientX, y: e.clientY };
  (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent): void {
  if (!drag) return;
  orbit.yaw += (e.clientX - drag.x) * 0.4;
  orbit.pitch = Math.min(85, Math.max(10, orbit.pitch + (e.clientY - drag.y) * 0.3));
  drag = { x: e.clientX, y: e.clientY };
  requestRender();
}
function onPointerUp(): void { drag = null; }
function onWheel(e: WheelEvent): void {
  e.preventDefault();
  orbit.zoom = Math.min(4, Math.max(0.35, orbit.zoom * (e.deltaY < 0 ? 1.12 : 0.9)));
  requestRender();
}

onUnmounted(() => {
  alive = false;
  ro?.disconnect();
  document.removeEventListener('keydown', onKey, true);
  const cv = canvasEl.value;
  if (cv) {
    cv.removeEventListener('pointerdown', onPointerDown);
    cv.removeEventListener('pointermove', onPointerMove);
    cv.removeEventListener('pointerup', onPointerUp);
    cv.removeEventListener('pointercancel', onPointerUp);
    cv.removeEventListener('wheel', onWheel);
  }
  try { renderer?.dispose(); } catch { /* ignore */ }
  renderer = null;
});
</script>

<style>
.r3d-backdrop { display: none; position: fixed; inset: 0; background: rgba(240,243,248,.97); z-index: 90; flex-direction: column; }
.r3d-backdrop.open { display: flex; }
.r3d-bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e3e7ef; font-size: 13.5px; flex-wrap: wrap; }
.r3d-bar .r3d-hint { color: #8792a6; font-size: 12px; }
.r3d-bar .r3d-sp { flex: 1; }
.r3d-wrap { flex: 1; min-height: 0; position: relative; }
.r3d-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
.r3d-canvas:active { cursor: grabbing; }
.r3d-fallback { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; color: #3c4a5c; }
.r3d-fallback .r3d-title { font-size: 17px; font-weight: 700; margin: 0; }
.r3d-fallback p { margin: 0; font-size: 14px; line-height: 1.7; max-width: 560px; }
.r3d-fallback .r3d-stats { font-weight: 600; }
.r3d-warns { text-align: left; font-size: 13px; color: #7a5c14; margin: 4px 0; }
.app.dark .r3d-backdrop { background: rgba(4,9,20,.92); }
.app.dark .r3d-bar { background: #0e1730; border-color: #1e2d4d; color: #e6edf8; }
.app.dark .r3d-fallback { color: #b9c7dc; }
</style>
