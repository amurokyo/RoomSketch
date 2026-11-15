<!-- RoomSketch 2.0.0 — 二维画布（SVG + 指针交互，移植 1.0.0 并修旋转手柄） -->
<template>
  <div class="stage-head">
    <span>{{ toolName }}</span><span>·</span><span>{{ coordText }}</span>
    <span v-if="state.doc.pdfImported" class="pdf-badge">PDF 已导入</span>
  </div>
  <div class="canvas-wrap">
    <svg
      id="canvas" ref="svgEl" aria-label="房屋布局绘图画布"
      :class="svgMode" :viewBox="`${state.doc.view.x} ${state.doc.view.y} ${state.doc.view.w} ${state.doc.view.h}`"
      xmlns="http://www.w3.org/2000/svg"
      @pointermove="onPointerMove" @pointerdown="onPointerDown" @pointerup="onPointerUp"
      @pointercancel="onPointerCancel" @dblclick="onDblClick" @click="onClick" @wheel.prevent="onWheel"
    >
      <defs>
        <pattern id="smallGrid" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#e9edf2" stroke-width="2" />
        </pattern>
        <pattern id="bigGrid" width="500" height="500" patternUnits="userSpaceOnUse">
          <rect fill="url(#smallGrid)" width="500" height="500" />
          <path d="M 500 0 L 0 0 0 500" fill="none" stroke="#d9e0e8" stroke-width="3" />
        </pattern>
      </defs>
      <rect v-show="state.gridVisible" id="gridBg" x="-50000" y="-50000" width="100000" height="100000" fill="url(#bigGrid)" />
      <g id="objects">
        <ObjectShape
          v-for="o in state.doc.objects" :key="o.id" :o="o"
          :class="{ 'marquee-selected': marqueeSet.has(o.id) }"
        />
      </g>
      <g id="draft"><ObjectShape v-if="draftObj" :o="draftObj" /></g>
      <g id="selection-ui">
        <!-- 选中包围盒 -->
        <rect v-if="selBounds" :x="selBounds.x - 10" :y="selBounds.y - 10" :width="selBounds.w + 20" :height="selBounds.h + 20" rx="4" class="bbox" />
        <!-- 角点手柄：画在旋转后的真实角点上（2.0.0 修 1.0.0 旋转后无手柄的限制） -->
        <rect
          v-for="h in cornerHandles" :key="h.id"
          :x="h.x - handleHalf" :y="h.y - handleHalf" :width="handleHalf * 2" :height="handleHalf * 2" rx="1"
          class="handle" :data-handle="'c:' + h.id"
        />
        <!-- 顶点手柄：世界坐标 = 局部点经旋转变换（1.0.0 曾忽略 rotation） -->
        <circle
          v-for="h in vertexHandles" :key="h.id"
          :cx="h.x" :cy="h.y" :r="handleHalf" class="vhandle" :data-handle="'v:' + h.index"
        />
        <!-- 多选包围盒 -->
        <rect
          v-for="mb in multiBounds" :key="mb.id"
          :x="mb.x - 10" :y="mb.y - 10" :width="mb.w + 20" :height="mb.h + 20" rx="4" class="bbox"
        />
        <!-- 未关联门窗：琥珀色虚线框 -->
        <rect
          v-for="u in unlinkedBounds" :key="u.id"
          :x="u.x - 8" :y="u.y - 8" :width="u.w + 16" :height="u.h + 16" rx="4" class="unlinked"
        />
        <!-- PDF 框选矩形 / 通用框选矩形 -->
        <rect v-if="marqueeBox" :x="marqueeBox.x" :y="marqueeBox.y" :width="marqueeBox.w" :height="marqueeBox.h" rx="2" class="marquee-box" />
        <rect v-if="selBoxRect" :x="selBoxRect.x" :y="selBoxRect.y" :width="selBoxRect.w" :height="selBoxRect.h" rx="2" class="marquee-box sel-box" />
      </g>
    </svg>
    <button v-if="drawing" class="primary finish-btn" @click="finishDraw(true)">✓ 完成绘制</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ObjectShape from './ObjectShape.vue';
import {
  state, TOOL_NAMES, snapshot, dropLastSnapshot, addObject, selectObject,
  deleteSelected, markDirty, setStatus, toast, setTool, undo, redo,
  copySelected, pasteClip, rotateSelected90, duplicateSelected, nudgeSelected,
  deleteMarqueeSelection, cancelMarqueeSelection,
} from '../store.ts';
import type { RsObject, ToolId } from '../model/types.ts';
import { objBounds, selectionBounds, rectsIntersect, rectContains, localToWorld, worldToLocal, fmt } from '../model/geometry.ts';
import { cornerResize, cornerLocal, type CornerId } from '../model/cornerResize.ts';
import { syncWallOpenings, relocateOpening, slideOpening, snapToWall, WALL_SNAP_DIST } from '../model/wallLink.ts';
import { FURN_PRESETS } from '../model/furniture.ts';

const emit = defineEmits<{
  (e: 'calibrate', payload: { d: number; p1: { x: number; y: number }; p2: { x: number; y: number } }): void;
}>();

const svgEl = ref<SVGSVGElement | null>(null);
const coordText = ref('X 0 · Y 0 mm');
const canvasSize = ref({ w: 800, h: 500 });

// ---- 绘制 / 拖动状态 ----
type Drawing =
  | { kind: 'wall' | 'room'; points: { x: number; y: number }[] }
  | { kind: 'shape'; type: ToolId; start: { x: number; y: number } }
  | null;
type DragState =
  | { kind: 'handle'; hkind: 'c' | 'v'; index: number; id: string; start: { x: number; y: number }; corner?: CornerId }
  | { kind: 'move'; id: string; start: { x: number; y: number }; baseX: number; baseY: number; moves: { id: string; x: number; y: number }[] | null }
  | null;

const drawing = ref<Drawing>(null);
const draftObj = ref<RsObject | null>(null);
const dragState = ref<DragState>(null);
const panState = ref<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
const selBox = ref<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
const marqueeDrag = ref<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
const calibratePts = ref<{ x: number; y: number }[]>([]);
const lastTap = ref({ t: 0, x: 0, y: 0 });
const justFinished = ref(0);
const lastNudge = ref(0);
const activePtrs = new Map<number, { x: number; y: number }>();
const pinch = ref<{ d0: number; view0: { x: number; y: number; w: number; h: number }; anchor: { x: number; y: number } } | null>(null);

const toolName = computed(() => TOOL_NAMES[state.tool]);
const svgMode = computed(() =>
  state.marqueeMode ? 'mode-marquee' : state.tool === 'pan' ? 'mode-pan' : state.tool === 'select' ? 'mode-select' : 'mode-draw');
const marqueeSet = computed(() => new Set(state.marqueeIds));

const selectedObj = computed(() => state.doc.objects.find(o => o.id === state.selectedId) ?? null);
const selBounds = computed(() => (selectedObj.value ? objBounds(selectedObj.value) : null));

const pxPerUnit = computed(() => Math.max(
  state.doc.view.w / Math.max(1, canvasSize.value.w),
  state.doc.view.h / Math.max(1, canvasSize.value.h),
));
const handleHalf = computed(() => (canvasSize.value.w < 700 ? 7 : 4.5) * pxPerUnit.value);

/** 角点手柄：旋转后的真实角点（局部角点经 translate+rotate 变换）。 */
const cornerHandles = computed(() => {
  const s = selectedObj.value;
  if (!s || !['rect', 'furniture', 'imagebg', 'door', 'window', 'dimension'].includes(s.type)) return [];
  const ids: CornerId[] = ['nw', 'ne', 'se', 'sw'];
  return ids.map(id => {
    const [lx, ly] = cornerLocal(s, id);
    const [wx, wy] = localToWorld(s, lx, ly);
    return { id, x: wx, y: wy };
  });
});

/** 顶点手柄：局部点经旋转变换到世界坐标。 */
const vertexHandles = computed(() => {
  const s = selectedObj.value;
  if (!s || !['wall', 'polyline', 'line', 'polyroom'].includes(s.type) || !('points' in s)) return [];
  return s.points.map((p, i) => {
    const [wx, wy] = localToWorld(s, p[0], p[1]);
    return { id: `v${i}`, index: i, x: wx, y: wy };
  });
});

const multiBounds = computed(() => state.multiIds
  .filter(id => id !== state.selectedId)
  .map(id => state.doc.objects.find(x => x.id === id))
  .filter((o): o is RsObject => !!o)
  .map(o => ({ id: o.id, ...objBounds(o) })));

const unlinkedBounds = computed(() => state.doc.objects
  .filter(o => (o.type === 'door' || o.type === 'window') && !o.wallId)
  .map(o => ({ id: o.id, ...objBounds(o) })));

const marqueeBox = computed(() => {
  if (marqueeDrag.value) {
    const a = marqueeDrag.value.start, b = marqueeDrag.value.end;
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  return state.marqueeRect;
});
const selBoxRect = computed(() => {
  if (!selBox.value) return null;
  const a = selBox.value.start, b = selBox.value.end;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
});

// ---- 坐标换算 ----
function worldPoint(e: PointerEvent | MouseEvent | WheelEvent): { x: number; y: number } {
  const svg = svgEl.value;
  if (!svg) return { x: 0, y: 0 };
  const p = (svg as SVGSVGElement).createSVGPoint();
  p.x = (e as PointerEvent).clientX; p.y = (e as PointerEvent).clientY;
  const q = p.matrixTransform((svg as SVGSVGElement).getScreenCTM()?.inverse());
  return { x: q.x, y: q.y };
}

function snap(p: { x: number; y: number }): { x: number; y: number } {
  if (!state.snapEnabled) return p;
  const g = Math.max(1, state.gridSize || 100);
  const v = state.doc.view;
  const s = Math.min(g, Math.max(v.w, v.h) / 40);
  return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
}

function orthoPoint(prev: { x: number; y: number }, p: { x: number; y: number }, free: boolean): { x: number; y: number } {
  if (free || !prev) return p;
  const dx = Math.abs(p.x - prev.x), dy = Math.abs(p.y - prev.y);
  return dx >= dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
}

function furnLabel(): string {
  if (state.tool === 'furniture' && state.customFurnLabel) return state.customFurnLabel;
  return FURN_PRESETS[state.furnitureType]?.[2] || '自定义家具';
}

function drawPreview(o: RsObject | null): void {
  draftObj.value = o ? { ...o, id: 'draft', strokeColor: '#2874dc', fill: 'none' } as RsObject : null;
}

function updateFinishBtn(): void { /* 完成按钮由 drawing 的存在与否控制 */ }

function finishDraw(add = true): void {
  const d = drawing.value;
  if (d?.kind === 'wall' && d.points.length >= 2 && add) {
    const pts = d.points;
    const minx = Math.min(...pts.map(p => p.x)), miny = Math.min(...pts.map(p => p.y));
    addObject({ type: 'wall', x: minx, y: miny, points: pts.map(p => [p.x - minx, p.y - miny] as [number, number]), wallWidth: state.wallWidth || 120, strokeColor: '#29394c' });
  } else if (d?.kind === 'room' && d.points.length >= 3 && add) {
    const pts = d.points;
    const minx = Math.min(...pts.map(p => p.x)), miny = Math.min(...pts.map(p => p.y));
    addObject({ type: 'polyroom', x: minx, y: miny, points: pts.map(p => [p.x - minx, p.y - miny] as [number, number]), stroke: 12, strokeColor: '#2e6ed8', fill: '#2e6ed8' });
  }
  drawing.value = null;
  drawPreview(null);
  updateFinishBtn();
}

// ---- PDF 框选删除 ----
function finishMarqueeSelection(): void {
  if (!marqueeDrag.value) return;
  const a = marqueeDrag.value.start, b = marqueeDrag.value.end;
  marqueeDrag.value = null;
  const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  const minSize = pxPerUnit.value * 5;
  if (r.w < minSize || r.h < minSize) {
    state.marqueeRect = null; state.marqueeIds = [];
    toast('框选范围太小，请按住鼠标重新拖动');
    return;
  }
  state.marqueeRect = r;
  const contain = true; // 仅删除完全位于框内的对象（更安全），与 1.0.0 默认一致
  state.marqueeIds = state.doc.objects
    .filter(o => o.pdfOrigin || o.type === 'pdf')
    .filter(o => { const bb = selectionBounds(o); return contain ? rectContains(r, bb) : rectsIntersect(r, bb); })
    .map(o => o.id);
  state.selectedId = null;
  setStatus(state.marqueeIds.length ? `框选完成：${state.marqueeIds.length} 个 PDF 对象待删除` : '该区域内没有符合条件的 PDF 对象');
}

// ---- 通用框选多选 ----
function finishSelBox(endP: { x: number; y: number }): void {
  if (!selBox.value) return;
  const a = selBox.value.start, b = endP;
  selBox.value = null;
  const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  const minSize = pxPerUnit.value * 5;
  if (r.w < minSize && r.h < minSize) { selectObject(null); return; }
  state.multiIds = state.doc.objects.filter(o => rectsIntersect(r, objBounds(o))).map(o => o.id);
  state.selectedId = null;
  setStatus(state.multiIds.length ? `已框选 ${state.multiIds.length} 个对象（拖动可整体移动）` : '框选范围内没有对象');
}

// ---- 比例校准 ----
function addCalibratedPoint(p: { x: number; y: number }): void {
  calibratePts.value.push(p);
  if (calibratePts.value.length === 2) {
    const d = Math.hypot(calibratePts.value[1].x - calibratePts.value[0].x, calibratePts.value[1].y - calibratePts.value[0].y);
    if (d < 1) { toast('两点距离太近，请重新选择'); calibratePts.value = []; return; }
    emit('calibrate', { d, p1: calibratePts.value[0], p2: calibratePts.value[1] });
    calibratePts.value = [];
  }
}

// ---- 指针事件 ----
function onPointerMove(e: PointerEvent): void {
  if (activePtrs.has(e.pointerId)) activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch.value && activePtrs.size >= 2) { applyPinch(); return; }
  const p = worldPoint(e);
  coordText.value = `X ${fmt(p.x)} · Y ${fmt(p.y)} mm`;
  if (state.marqueeMode && marqueeDrag.value) { marqueeDrag.value.end = p; return; }
  if (selBox.value) { selBox.value.end = p; return; }
  if (panState.value) {
    const v = state.doc.view;
    const cw = canvasSize.value.w || 800, ch = canvasSize.value.h || 500;
    state.doc.view = {
      ...v,
      x: panState.value.vx - (e.clientX - panState.value.cx) * v.w / cw,
      y: panState.value.vy - (e.clientY - panState.value.cy) * v.h / ch,
    };
    return;
  }
  if (dragState.value) {
    const d = dragState.value;
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.kind === 'handle') {
      const o = state.doc.objects.find(x => x.id === d.id);
      if (o) {
        if (d.hkind === 'v') {
          const i = d.index;
          if ('points' in o && o.points) {
            // 顶点拖动：世界坐标逆变换到局部坐标（1.0.0 曾忽略 rotation）
            const [lx, ly] = worldToLocal(o, p.x, p.y);
            o.points[i] = [lx, ly];
            if (o.type === 'wall') syncWallOpenings(state.doc.objects, o);
          }
        } else {
          const r = cornerResize(o, d.corner as CornerId, p);
          o.x = r.x; o.y = r.y;
          if (r.w !== undefined && 'w' in o) (o as { w: number }).w = r.w;
          if (r.h !== undefined && 'h' in o) (o as { h: number }).h = r.h;
          if (r.length !== undefined && o.type === 'dimension') { o.length = r.length; o.label = `${Math.round(r.length)} mm`; }
          if ((o.type === 'door' || o.type === 'window') && o.wallId) relocateOpening(state.doc.objects, o);
        }
      }
      return;
    }
    if (d.moves) {
      for (const mv of d.moves) {
        const mob = state.doc.objects.find(x => x.id === mv.id);
        if (mob) { mob.x = mv.x + dx; mob.y = mv.y + dy; if (mob.type === 'wall') syncWallOpenings(state.doc.objects, mob); }
      }
    } else {
      const o = state.doc.objects.find(x => x.id === d.id);
      if (o) { o.x = d.baseX + dx; o.y = d.baseY + dy; if (o.type === 'wall') syncWallOpenings(state.doc.objects, o); }
    }
    return;
  }
  if (drawing.value) {
    const dlast = drawing.value.kind === 'wall' || drawing.value.kind === 'room'
      ? drawing.value.points[drawing.value.points.length - 1] : null;
    const dsp = snap(p);
    const dpe = dlast ? (e.shiftKey ? dsp : orthoPoint(dlast, dsp, false)) : dsp;
    if (drawing.value.kind === 'wall') {
      drawPreview({ type: 'wall', id: 'draft', x: 0, y: 0, points: [...drawing.value.points, dpe].map(pt => [pt.x, pt.y] as [number, number]), wallWidth: state.wallWidth || 120 } as RsObject);
    } else if (drawing.value.kind === 'room') {
      drawPreview({ type: 'polyroom', id: 'draft', x: 0, y: 0, points: [...drawing.value.points, dpe].map(pt => [pt.x, pt.y] as [number, number]), stroke: 12, strokeColor: '#2874dc' } as RsObject);
    } else if (drawing.value.kind === 'shape') {
      const a = drawing.value.start, b = snap(p);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.max(20, Math.abs(b.x - a.x)), h = Math.max(20, Math.abs(b.y - a.y));
      let o: RsObject | null = null;
      const t = drawing.value.type;
      if (t === 'rect') o = { type: 'rect', id: 'draft', x, y, w, h, stroke: 12 } as RsObject;
      else if (t === 'line') o = { type: 'line', id: 'draft', x: a.x, y: a.y, points: [[0, 0], [b.x - a.x, b.y - a.y]], stroke: 10 } as RsObject;
      else if (t === 'door') o = { type: 'door', id: 'draft', x: a.x, y: a.y, w: Math.max(100, Math.hypot(b.x - a.x, b.y - a.y)), dir: state.doorDir, stroke: 10 } as RsObject;
      else if (t === 'window') o = { type: 'window', id: 'draft', x: a.x, y: a.y, w: Math.max(100, Math.hypot(b.x - a.x, b.y - a.y)), rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, stroke: 10 } as RsObject;
      else if (t === 'dimension') o = { type: 'dimension', id: 'draft', x: a.x, y: a.y, length: Math.max(100, Math.hypot(b.x - a.x, b.y - a.y)), rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, label: `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} mm`, stroke: 8 } as RsObject;
      else if (t === 'furniture') o = { type: 'furniture', id: 'draft', x, y, w, h, label: furnLabel(), stroke: 12 } as RsObject;
      drawPreview(o);
    }
  }
}

function onPointerDown(e: PointerEvent): void {
  activePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePtrs.size === 2) { cancelDragForPinch(); pinch.value = startPinch(); toast('双指缩放画布'); return; }
  if (e.button !== 0) return;
  const raw = worldPoint(e);
  if (state.marqueeMode) {
    marqueeDrag.value = { start: raw, end: raw };
    state.marqueeIds = [];
    state.marqueeRect = null;
    state.selectedId = null;
    (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
    return;
  }
  const p = snap(raw);
  if (state.tool === 'pan') {
    panState.value = { cx: e.clientX, cy: e.clientY, vx: state.doc.view.x, vy: state.doc.view.y };
    (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
    return;
  }
  if (state.tool === 'calibrate') { addCalibratedPoint(p); return; }
  if (state.tool === 'wall' || state.tool === 'room') {
    const kind = state.tool;
    const now = performance.now();
    if (now - justFinished.value < 250) return;
    if (drawing.value?.kind === kind && drawing.value.points.length >= 2 &&
      now - lastTap.value.t < 420 &&
      Math.hypot(p.x - lastTap.value.x, p.y - lastTap.value.y) < 14 * pxPerUnit.value) {
      finishDraw(true);
      justFinished.value = now;
      lastTap.value = { t: 0, x: 0, y: 0 };
      return;
    }
    lastTap.value = { t: now, x: p.x, y: p.y };
    if (!drawing.value || drawing.value.kind !== kind) drawing.value = { kind, points: [p] };
    else {
      const dprev = drawing.value.points[drawing.value.points.length - 1];
      drawing.value.points.push(e.shiftKey ? p : orthoPoint(dprev, p, false));
    }
    if (kind === 'wall') drawPreview({ type: 'wall', id: 'draft', x: 0, y: 0, points: drawing.value.points.map(q => [q.x, q.y] as [number, number]), wallWidth: state.wallWidth || 120 } as RsObject);
    else drawPreview({ type: 'polyroom', id: 'draft', x: 0, y: 0, points: drawing.value.points.map(q => [q.x, q.y] as [number, number]), stroke: 12, strokeColor: '#2874dc' } as RsObject);
    updateFinishBtn();
    return;
  }
  if (state.tool === 'label') {
    const text = prompt('请输入文字标注', '房间名称');
    if (text) addObject({ type: 'label', x: p.x, y: p.y, label: text, fontSize: 130, strokeColor: '#25364a' });
    return;
  }
  if (state.tool === 'select') {
    const hEl = (e.target as Element).closest?.('[data-handle]');
    if (hEl && state.selectedId) {
      const o = state.doc.objects.find(x => x.id === state.selectedId);
      if (o) {
        snapshot();
        const [hk, idx] = (hEl.getAttribute('data-handle') || '').split(':');
        dragState.value = {
          kind: 'handle', hkind: hk as 'c' | 'v', index: +(idx || 0), id: o.id, start: raw,
          corner: hk === 'c' ? (idx as CornerId) : undefined,
        };
        (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
        return;
      }
    }
    const target = (e.target as Element).closest?.('[data-id]');
    if (target) {
      const id = target.getAttribute('data-id') as string;
      const grp = (state.multiIds.includes(id) && state.multiIds.length > 1) ? state.multiIds.slice() : null;
      if (!grp) selectObject(id);
      const o = state.doc.objects.find(x => x.id === id);
      if (o) {
        snapshot();
        dragState.value = {
          kind: 'move', id, start: worldPoint(e), baseX: o.x || 0, baseY: o.y || 0,
          moves: grp ? grp.map(gid => { const g2 = state.doc.objects.find(x => x.id === gid); return { id: gid, x: g2?.x || 0, y: g2?.y || 0 }; }) : null,
        };
        (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
      }
    } else {
      selBox.value = { start: raw, end: raw };
      (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (['rect', 'line', 'door', 'window', 'furniture', 'dimension'].includes(state.tool)) {
    drawing.value = { kind: 'shape', type: state.tool, start: p };
    (svgEl.value as SVGSVGElement | null)?.setPointerCapture(e.pointerId);
  }
}

function onPointerUp(e: PointerEvent): void {
  activePtrs.delete(e.pointerId);
  if (pinch.value) { if (activePtrs.size < 2) pinch.value = null; return; }
  if (state.marqueeMode && marqueeDrag.value) { marqueeDrag.value.end = worldPoint(e); finishMarqueeSelection(); return; }
  if (selBox.value) { finishSelBox(worldPoint(e)); return; }
  if (panState.value) { panState.value = null; return; }
  if (dragState.value) {
    const d = dragState.value;
    dragState.value = null;
    if (d.kind === 'handle') { setStatus('对象已调整'); markDirty(); return; }
    const moved = Math.hypot(worldPoint(e).x - d.start.x, worldPoint(e).y - d.start.y) > 0.1;
    if (moved) {
      const movedIds = d.moves ? d.moves.map(m => m.id) : [d.id];
      for (const mid of movedIds) {
        const mo = state.doc.objects.find(x => x.id === mid);
        if (!mo) continue;
        if (mo.type === 'wall') syncWallOpenings(state.doc.objects, mo);
        else if (mo.type === 'door' || mo.type === 'window') relocateOpening(state.doc.objects, mo);
      }
      setStatus('对象已移动');
      markDirty();
    } else {
      dropLastSnapshot(); // 点击未移动：撤掉按下时预拍的快照
    }
    return;
  }
  if (drawing.value?.kind === 'wall' || drawing.value?.kind === 'room') return;
  if (drawing.value?.kind === 'shape') {
    const p = snap(worldPoint(e)), a = drawing.value.start, typ = drawing.value.type;
    const x = Math.min(a.x, p.x), y = Math.min(a.y, p.y);
    const w = Math.max(30, Math.abs(p.x - a.x)), h = Math.max(30, Math.abs(p.y - a.y));
    if (typ === 'rect') addObject({ type: 'rect', x, y, w, h, stroke: 12, strokeColor: '#29394c', fill: 'none' });
    if (typ === 'line') addObject({ type: 'line', x: a.x, y: a.y, points: [[0, 0], [p.x - a.x, p.y - a.y]], stroke: 9, strokeColor: '#55708c' });
    const wsnap = snapToWall(state.doc.objects, a);
    const useWall = !!wsnap && wsnap.d < WALL_SNAP_DIST;
    if (useWall) setStatus('已自动贴合墙体');
    const apos = useWall ? { x: wsnap.px, y: wsnap.py } : a;
    const link = useWall ? { wallId: wsnap.wallId, wallSeg: wsnap.seg, wallT: wsnap.t } : {};
    if (typ === 'door') addObject({ type: 'door', x: apos.x, y: apos.y, w: Math.max(100, Math.hypot(p.x - apos.x, p.y - apos.y)), rotation: useWall ? wsnap.ang : Math.atan2(p.y - a.y, p.x - a.x) * 180 / Math.PI, dir: state.doorDir, stroke: 10, strokeColor: '#344b64', ...link });
    if (typ === 'window') addObject({ type: 'window', x: apos.x, y: apos.y, w: Math.max(100, Math.hypot(p.x - apos.x, p.y - apos.y)), rotation: useWall ? wsnap.ang : Math.atan2(p.y - a.y, p.x - a.x) * 180 / Math.PI, stroke: 12, strokeColor: '#3178aa', ...link });
    if (typ === 'dimension') {
      const len = Math.hypot(p.x - a.x, p.y - a.y);
      addObject({ type: 'dimension', x: a.x, y: a.y, length: len, rotation: Math.atan2(p.y - a.y, p.x - a.x) * 180 / Math.PI, label: `${Math.round(len)} mm`, stroke: 8, strokeColor: '#4f647d' });
    }
    if (typ === 'furniture') {
      let fw = w, fh = h;
      const choice = state.furnitureType;
      if (choice === 'custom') { fw = state.furnW || 1400; fh = state.furnH || 700; }
      else if (Math.abs(p.x - a.x) < 20 || Math.abs(p.y - a.y) < 20) {
        const dims = FURN_PRESETS[choice];
        fw = dims?.[0] || state.furnW || 1400; fh = dims?.[1] || state.furnH || 700;
      }
      addObject({ type: 'furniture', x, y, w: fw, h: fh, label: furnLabel(), stroke: 12, strokeColor: '#65758a', fill: '#e9eef5' });
    }
    drawing.value = null;
    drawPreview(null);
    updateFinishBtn();
  }
}

function onPointerCancel(e: PointerEvent): void {
  activePtrs.delete(e.pointerId);
  if (pinch.value && activePtrs.size < 2) pinch.value = null;
  if (marqueeDrag.value) { marqueeDrag.value = null; state.marqueeRect = null; state.marqueeIds = []; }
  if (selBox.value) selBox.value = null;
}

function onDblClick(e: MouseEvent): void {
  if (state.tool === 'wall' || state.tool === 'room') finishDraw(true);
}

function onClick(e: MouseEvent): void {
  if ((e as MouseEvent).detail >= 2 && (state.tool === 'wall' || state.tool === 'room')) finishDraw(true);
}

function onWheel(e: WheelEvent): void {
  const factor = e.deltaY < 0 ? 0.88 : 1.14;
  const p = worldPoint(e);
  const v = state.doc.view;
  state.doc.view = { x: p.x - (p.x - v.x) * factor, y: p.y - (p.y - v.y) * factor, w: v.w * factor, h: v.h * factor };
}

// ---- 双指缩放 ----
function startPinch(): { d0: number; view0: { x: number; y: number; w: number; h: number }; anchor: { x: number; y: number } } {
  const pts = [...activePtrs.values()];
  const a = pts[0], b = pts[1];
  const mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
  return { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, view0: { ...state.doc.view }, anchor: worldPoint(mid as unknown as PointerEvent) };
}

function applyPinch(): void {
  if (!pinch.value) return;
  const pts = [...activePtrs.values()];
  if (pts.length < 2) return;
  const a = pts[0], b = pts[1];
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const ratio = pinch.value.d0 / d;
  const nw = Math.max(200, Math.min(5e6, pinch.value.view0.w * ratio));
  const nh = Math.max(150, Math.min(5e6, pinch.value.view0.h * ratio));
  const f = nw / pinch.value.view0.w;
  state.doc.view = {
    x: pinch.value.anchor.x - (pinch.value.anchor.x - pinch.value.view0.x) * f,
    y: pinch.value.anchor.y - (pinch.value.anchor.y - pinch.value.view0.y) * f,
    w: nw, h: nh,
  };
}

function cancelDragForPinch(): void {
  if (dragState.value) { dropLastSnapshot(); dragState.value = null; }
  if (drawing.value) { drawing.value = null; drawPreview(null); updateFinishBtn(); }
  panState.value = null;
}

// ---- 键盘 ----
function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (state.marqueeMode || state.marqueeIds.length) cancelMarqueeSelection();
    finishDraw(true);
    drawing.value = null;
    drawPreview(null);
    calibratePts.value = [];
    setTool('select');
  }
  const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
    if (state.marqueeIds.length) deleteMarqueeSelection();
    else deleteSelected();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
  if (!typing && e.key.startsWith('Arrow')) {
    const ids = state.multiIds.length ? state.multiIds.slice() : state.selectedId ? [state.selectedId] : [];
    if (ids.length) {
      e.preventDefault();
      const now2 = performance.now();
      if (now2 - lastNudge.value > 1200) snapshot();
      lastNudge.value = now2;
      const step = (state.snapEnabled ? (state.gridSize || 100) : 10) * (e.shiftKey ? 1 : 0.1);
      let mdx = 0, mdy = 0;
      if (e.key === 'ArrowLeft') mdx = -step;
      if (e.key === 'ArrowRight') mdx = step;
      if (e.key === 'ArrowUp') mdy = -step;
      if (e.key === 'ArrowDown') mdy = step;
      nudgeSelected(mdx, mdy);
    }
  }
  if (!typing && e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && state.selectedId) {
    e.preventDefault();
    rotateSelected90();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !typing && state.selectedId) { e.preventDefault(); copySelected(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !typing) { e.preventDefault(); pasteClip(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing && state.selectedId) { e.preventDefault(); duplicateSelected(); }
}

// 供 App 调用：退出框选 / 删除框选（左栏按钮用）
function requestDeleteMarquee(): void { deleteMarqueeSelection(); }
function requestCancelMarquee(): void { cancelMarqueeSelection(); }

defineExpose({ requestDeleteMarquee, requestCancelMarquee, finishDraw, getCanvasSize: () => canvasSize.value });

onMounted(() => {
  // ResizeObserver 在现代浏览器都有；无则退化为初始尺寸（jsdom/极旧环境），
  // 挂载钩子不抛错。
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (svgEl.value) canvasSize.value = { w: svgEl.value.clientWidth || 800, h: svgEl.value.clientHeight || 500 };
    });
    if (svgEl.value) {
      ro.observe(svgEl.value);
      canvasSize.value = { w: svgEl.value.clientWidth || 800, h: svgEl.value.clientHeight || 500 };
    }
  } else if (svgEl.value) {
    canvasSize.value = { w: svgEl.value.clientWidth || 800, h: svgEl.value.clientHeight || 500 };
  }
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>
