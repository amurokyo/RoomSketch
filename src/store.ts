// RoomSketch 2.0.0 — 响应式工程 store（单例）
// 集中管理工程文档、选中、工具、历史、保存/备份状态；
// 视图状态（view 除外）不进历史，与 1.0.0 的 snapshot 语义一致。
import { reactive, computed } from 'vue';
import type { ProjectDoc, RsObject, ViewBox } from './model/types.ts';
import { DEFAULT_VIEW } from './model/types.ts';
import { createEmptyProject, serializeProject, validateProject } from './model/project.ts';
import { History, type HistoryState } from './model/history.ts';
import { readBackup, writeBackup, clearBackup, BACKUP_KEY } from './model/storage.ts';
import { APP_VERSION, SCHEMA_VERSION } from './version.ts';
import {
  syncWallOpenings, detachWallOpenings, tryAttach, relocateOpening,
  slideOpening, normalizeOpenings, WALL_SNAP_DIST,
} from './model/wallLink.ts';
import { polyArea, objBounds, boundsUnion } from './model/geometry.ts';
import { downloadBlob } from './model/download.ts';

export type ToolId =
  | 'select' | 'wall' | 'room' | 'rect' | 'line' | 'dimension'
  | 'door' | 'window' | 'furniture' | 'label' | 'pan' | 'calibrate';

export const TOOL_NAMES: Record<ToolId, string> = {
  select: '选择 / 移动', wall: '墙体 / 折线', room: '多边形房间 / 面积', rect: '矩形区域',
  line: '辅助线', dimension: '尺寸标注', door: '门 / 开向弧线', window: '窗户',
  furniture: '桌柜 / 家具', label: '文字标注', pan: '平移画布', calibrate: '比例校准',
};

export const state = reactive({
  doc: createEmptyProject() as ProjectDoc,
  selectedId: null as string | null,
  multiIds: [] as string[],
  tool: 'select' as ToolId,
  dirty: false,
  bkFailed: false,
  bkFailNotified: false,
  lastSavedAt: null as string | null,
  statusMsg: '已就绪 · 数据仅保存在本机浏览器中',
  statusOk: true,
  toastMsg: '',
  toastTimer: 0 as unknown as ReturnType<typeof setTimeout>,
  // PDF 框选清理
  marqueeMode: false,
  marqueeIds: [] as string[],
  marqueeRect: null as { x: number; y: number; w: number; h: number } | null,
  // 绘图参数
  wallWidth: 120,
  gridSize: 100,
  snapEnabled: true,
  gridVisible: true,
  furnitureType: 'custom',
  furnW: 1400,
  furnH: 700,
  doorDir: 1 as 1 | -1,
  customFurnLabel: null as string | null,
  scale: 50,
  // 3D
  threeOpen: false,
  // 恢复
  restoreCandidate: null as { at: number; count: number } | null,
  booting: true,
});

export const history = new History();
let bkTimer: ReturnType<typeof setTimeout> | null = null;
let clip: RsObject | null = null;

export const selectedObject = computed(() =>
  state.doc.objects.find(o => o.id === state.selectedId) ?? null);

export const objectCount = computed(() => state.doc.objects.length);

export const areaTotal = computed(() => {
  let total = 0;
  for (const o of state.doc.objects) {
    if (o.type === 'polyroom') total += polyArea(o.points);
    else if (o.type === 'rect' && o.label) total += o.w * o.h;
  }
  return total > 0 ? `${(total / 1e6).toFixed(1)} m²` : '—';
});

export const undoDepth = computed(() => history.undoDepth);
export const redoDepth = computed(() => history.redoDepth);

function historyState(): HistoryState {
  return {
    objects: JSON.parse(JSON.stringify(state.doc.objects)),
    pdfImported: state.doc.pdfImported,
    pdfPageSize: JSON.parse(JSON.stringify(state.doc.pdfPageSize)),
    counter: state.doc.counter,
  };
}

function applyHistoryState(s: HistoryState): void {
  state.doc.objects = JSON.parse(JSON.stringify(s.objects));
  state.doc.pdfImported = s.pdfImported;
  state.doc.pdfPageSize = JSON.parse(JSON.stringify(s.pdfPageSize));
  state.doc.counter = s.counter;
  state.selectedId = null;
  state.multiIds = [];
  state.marqueeIds = [];
}

export function snapshot(): void { history.snapshot(historyState()); }

export function undo(): void {
  const s = history.undo(historyState());
  if (s) { applyHistoryState(s); setStatus('已撤销'); markDirty(); }
}

export function redo(): void {
  const s = history.redo(historyState());
  if (s) { applyHistoryState(s); setStatus('已重做'); markDirty(); }
}

export function dropLastSnapshot(): void { history.dropLastSnapshot(); }

export function toast(msg: string): void {
  state.toastMsg = msg;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { state.toastMsg = ''; }, 2300);
}

export function setStatus(msg: string, ok = true): void {
  state.statusMsg = msg;
  state.statusOk = ok;
}

export function markDirty(): void {
  if (state.booting) return;
  state.dirty = true;
  if (bkTimer) clearTimeout(bkTimer);
  bkTimer = setTimeout(saveBackup, 900);
}

export function saveBackup(): void {
  if (!state.dirty) return; // 无更改不写备份（1.0.0 曾用空画布覆盖待恢复备份）
  const ok = writeBackup({
    format: 'roomsketch', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
    at: Date.now(), objects: state.doc.objects, view: state.doc.view,
    scale: state.scale, pdfImported: state.doc.pdfImported,
    pdfPageSize: state.doc.pdfPageSize, counter: state.doc.counter,
  });
  if (ok) { state.bkFailed = false; state.bkFailNotified = false; }
  else {
    state.bkFailed = true;
    if (!state.bkFailNotified) {
      state.bkFailNotified = true;
      toast('自动备份失败：浏览器存储不可用，请立即导出工程文件保存');
    }
  }
}

export function setTool(t: ToolId): void {
  state.marqueeMode = false;
  state.marqueeIds = [];
  state.multiIds = [];
  state.tool = t;
}

export function uid(): string { return `o${state.doc.counter++}`; }

export function addObject(o: Omit<RsObject, 'id'> & { id?: string }): RsObject {
  snapshot();
  const obj = { ...o, id: o.id ?? uid() } as RsObject;
  state.doc.objects.push(obj);
  state.selectedId = obj.id;
  state.multiIds = [];
  markDirty();
  setStatus('已添加对象');
  return obj;
}

export function selectObject(id: string | null): void {
  state.selectedId = id;
  state.multiIds = [];
}

export function deleteSelected(): void {
  if (!state.selectedId && !state.multiIds.length) return;
  snapshot();
  const del = new Set(state.multiIds);
  if (state.selectedId) del.add(state.selectedId);
  const delWalls = state.doc.objects.filter(o => del.has(o.id) && o.type === 'wall').map(o => o.id);
  state.doc.objects = state.doc.objects.filter(o => !del.has(o.id));
  let detached = 0;
  for (const wid of delWalls) detached += detachWallOpenings(state.doc.objects, wid);
  const cnt = del.size;
  state.selectedId = null;
  state.multiIds = [];
  markDirty();
  setStatus(`已删除 ${cnt} 个对象${detached ? `；${detached} 个门窗已脱离墙体（待关联）` : ''}`);
  if (detached) toast(`${detached} 个门窗已脱离墙体，可拖到墙边重新吸附`);
}

export function duplicateSelected(): void {
  const o = selectedObject.value;
  if (!o) return;
  snapshot();
  const n = JSON.parse(JSON.stringify(o)) as RsObject;
  n.id = uid();
  if (n.type === 'door' || n.type === 'window') { n.wallId = null; n.wallSeg = null; n.wallT = null; }
  n.x = (n.x || 0) + 200; n.y = (n.y || 0) + 200;
  state.doc.objects.push(n);
  state.selectedId = n.id;
  markDirty();
  setStatus('已创建副本');
}

export function rotateSelected90(): void {
  const o = selectedObject.value;
  if (!o) return;
  snapshot();
  o.rotation = ((o.rotation || 0) + 90) % 360;
  if (o.type === 'wall') syncWallOpenings(state.doc.objects, o);
  else if (o.type === 'door' || o.type === 'window') { o.wallId = null; o.wallSeg = null; o.wallT = null; }
  markDirty();
  setStatus('已旋转 90°');
}

export function copySelected(): void {
  const o = selectedObject.value;
  if (!o) return;
  clip = JSON.parse(JSON.stringify(o));
  toast('已复制对象，Ctrl+V 粘贴');
}

export function pasteClip(): void {
  if (!clip) return;
  snapshot();
  const pn = JSON.parse(JSON.stringify(clip)) as RsObject;
  pn.id = uid();
  if (pn.type === 'door' || pn.type === 'window') { pn.wallId = null; pn.wallSeg = null; pn.wallT = null; }
  pn.x = (pn.x || 0) + 200; pn.y = (pn.y || 0) + 200;
  state.doc.objects.push(pn);
  state.selectedId = pn.id;
  markDirty();
  setStatus('已粘贴对象');
}

export function nudgeSelected(dx: number, dy: number): void {
  const ids = state.multiIds.length ? state.multiIds.slice() : state.selectedId ? [state.selectedId] : [];
  if (!ids.length) return;
  for (const id of ids) {
    const o = state.doc.objects.find(x => x.id === id);
    if (o) { o.x = (o.x || 0) + dx; o.y = (o.y || 0) + dy; }
  }
  for (const id of ids) {
    const o = state.doc.objects.find(x => x.id === id);
    if (!o) continue;
    if (o.type === 'wall') syncWallOpenings(state.doc.objects, o);
    else if ((o.type === 'door' || o.type === 'window') && o.wallId) slideOpening(state.doc.objects, o);
  }
  markDirty();
}

export function reattachAll(): void {
  const free = state.doc.objects.filter(o => (o.type === 'door' || o.type === 'window') && !o.wallId);
  if (!free.length) { toast('没有未关联的门窗'); return; }
  snapshot();
  let ok = 0;
  for (const o of free) if (tryAttach(state.doc.objects, o as never)) ok++;
  markDirty();
  const miss = free.length - ok;
  toast(ok ? `已吸附 ${ok} 个门窗${miss ? `，${miss} 个附近 600mm 内无墙体` : ''}` : '附近没有墙体，未吸附任何门窗');
  setStatus(`门窗重新贴墙：已吸附 ${ok} 个${miss ? `，${miss} 个无墙体` : ''}`);
}

/** 比例校准：按 factor 缩放全部对象与视图，门窗按锚点重算。 */
export function applyCalibration(factor: number): void {
  snapshot();
  state.doc.objects = state.doc.objects.map(o => {
    const n = JSON.parse(JSON.stringify(o)) as RsObject;
    n.x = (n.x || 0) * factor; n.y = (n.y || 0) * factor;
    if ('w' in n && n.w) n.w *= factor;
    if ('h' in n && n.h) n.h *= factor;
    if (n.type === 'dimension') { n.length *= factor; n.label = `${Math.round(n.length)} mm`; }
    if (n.type === 'wall' && n.wallWidth) n.wallWidth *= factor;
    if (n.stroke) n.stroke *= factor;
    if ('points' in n && n.points) n.points = n.points.map(p => [p[0] * factor, p[1] * factor] as [number, number]);
    if (n.type === 'label' && n.fontSize) n.fontSize *= factor;
    return n;
  });
  for (const o of state.doc.objects) if (o.type === 'wall') syncWallOpenings(state.doc.objects, o);
  const v = state.doc.view;
  state.doc.view = { x: v.x * factor, y: v.y * factor, w: v.w * factor, h: v.h * factor };
  markDirty();
  setStatus('比例校准完成');
}

export function fitView(canvasW: number, canvasH: number): void {
  if (!state.doc.objects.length) { state.doc.view = { ...DEFAULT_VIEW }; return; }
  const bs = state.doc.objects.map(objBounds);
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  const r = Math.max(...bs.map(b => b.x + b.w)), bt = Math.max(...bs.map(b => b.y + b.h));
  let w = Math.max(100, r - x), h = Math.max(80, bt - y);
  const pad = Math.max(w, h) * 0.12;
  const ar = canvasW / Math.max(1, canvasH);
  w += pad * 2; h += pad * 2;
  if (w / h < ar) w = h * ar; else h = w / ar;
  state.doc.view = { x: x - pad - (w - (r - x + 2 * pad)) / 2, y: y - pad - (h - (bt - y + 2 * pad)) / 2, w, h };
}

export function zoomView(f: number): void {
  const v = state.doc.view;
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  state.doc.view = { x: cx - (v.w * f) / 2, y: cy - (v.h * f) / 2, w: v.w * f, h: v.h * f };
}

export function clearCanvas(): void {
  snapshot();
  state.doc.objects = [];
  state.selectedId = null;
  state.multiIds = [];
  state.marqueeMode = false;
  state.marqueeIds = [];
  state.doc.pdfImported = false;
  state.doc.pdfPageSize = null;
  state.doc.view = { ...DEFAULT_VIEW };
  state.dirty = true;
  markDirty();
  setStatus('画布已清空');
}

export function newProject(): void {
  snapshot();
  const fresh = createEmptyProject();
  fresh.metadata.createdAt = state.doc.metadata.createdAt;
  state.doc.objects = [];
  state.doc.pdfImported = false;
  state.doc.pdfPageSize = null;
  state.doc.view = { ...DEFAULT_VIEW };
  state.doc.counter = 1;
  state.selectedId = null;
  state.multiIds = [];
  state.marqueeMode = false;
  state.marqueeIds = [];
  state.dirty = true;
  markDirty();
  setStatus('画布已清空');
}

export function saveProjectFile(): void {
  const data = serializeProject(state.doc);
  state.lastSavedAt = new Date().toISOString();
  downloadBlob(new Blob([data], { type: 'application/json;charset=utf-8' }), 'RoomSketch-2.0.0-工程.json');
  state.dirty = false;
  setStatus('已导出工程文件 · 请确认浏览器下载完成');
  toast('工程文件已导出，请确认浏览器下载完成');
}

/** 打开工程文件（JSON 文本）。失败时不改动当前工程。 */
export function openProjectText(text: string): { ok: boolean; error?: string; upgraded?: boolean } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: '不是有效的 JSON 文件' }; }
  const r = validateProject(data);
  if (!r.ok || !r.doc) return { ok: false, error: r.error ?? '工程文件格式不正确' };
  snapshot();
  const d = r.doc;
  state.doc.objects = d.objects.map(o => ({ ...o, id: typeof o.id === 'string' && o.id ? o.id : uid() }));
  state.doc.counter = Math.max(state.doc.counter, d.counter);
  state.doc.view = d.view;
  state.doc.scale = d.scale;
  state.doc.pdfImported = d.pdfImported;
  state.doc.pdfPageSize = d.pdfPageSize;
  state.doc.metadata = d.metadata;
  state.scale = d.scale;
  state.selectedId = null;
  state.multiIds = [];
  state.marqueeMode = false;
  state.marqueeIds = [];
  state.dirty = false;
  state.lastSavedAt = d.metadata.updatedAt;
  setStatus('工程文件已打开');
  toast(`已载入 ${state.doc.objects.length} 个对象${r.upgradedFromOld ? '（旧版工程，已升级为 2.0.0 格式）' : ''}`);
  return { ok: true, upgraded: r.upgradedFromOld };
}

/** 启动时检查自动备份；有备份则提示用户确认恢复（不自动覆盖）。 */
export function checkRestoreCandidate(): void {
  const d = readBackup();
  if (!d) return;
  state.restoreCandidate = { at: d.at, count: d.objects.length };
}

export function restoreBackup(): void {
  const d = readBackup();
  if (!d) return;
  // 备份经 validateProject 全量校验（对象形状 + 关联归一）：损坏的备份
  // 不碰当前工程，并清掉它免得恢复条反复出现。
  const r = validateProject({
    format: 'roomsketch', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
    objects: d.objects, view: d.view, scale: d.scale,
  });
  if (!r.ok || !r.doc) {
    clearBackup();
    state.restoreCandidate = null;
    toast('自动备份已损坏，无法恢复（已清除）');
    setStatus('自动备份已损坏，无法恢复', false);
    return;
  }
  snapshot();
  const doc = r.doc;
  state.doc.objects = doc.objects.map(o => ({ ...o, id: typeof o.id === 'string' && o.id ? o.id : uid() }));
  state.doc.counter = Math.max(state.doc.counter, doc.counter);
  state.doc.pdfImported = doc.pdfImported;
  state.doc.pdfPageSize = doc.pdfPageSize;
  state.doc.view = doc.view;
  state.scale = doc.scale;
  state.doc.scale = state.scale;
  state.restoreCandidate = null;
  state.dirty = true;
  markDirty();
  setStatus('已恢复自动备份');
  toast('自动备份已恢复');
}

export function dismissRestore(): void { state.restoreCandidate = null; }

export function startMarqueeMode(): void {
  state.marqueeMode = true;
  state.marqueeIds = [];
  state.marqueeRect = null;
  state.selectedId = null;
  setStatus('框选删除模式：拖动鼠标圈选 PDF 对象');
}

export function deleteMarqueeSelection(): void {
  if (!state.marqueeIds.length) return;
  const remove = new Set(state.marqueeIds), count = remove.size;
  snapshot();
  state.doc.objects = state.doc.objects.filter(o => !remove.has(o.id));
  state.marqueeIds = [];
  state.marqueeRect = null;
  if (state.selectedId && remove.has(state.selectedId)) state.selectedId = null;
  markDirty();
  setStatus(`已删除框选区域内 ${count} 个 PDF 对象`);
  toast(`已删除 ${count} 个对象，可按 Ctrl+Z 撤销`);
}

export function cancelMarqueeSelection(): void {
  state.marqueeMode = false;
  state.marqueeIds = [];
  state.marqueeRect = null;
}

export function finishBoot(): void {
  state.booting = false;
  state.dirty = false;
}

export { WALL_SNAP_DIST, boundsUnion };
