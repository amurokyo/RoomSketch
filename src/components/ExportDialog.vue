<!-- RoomSketch 2.0.2 — 统一导出对话框 -->
<!-- 紧致范围只包围实际参与导出的对象；隐藏图层与可选底图开关统一过滤。 -->
<template>
  <div class="modal-mask" @click.self="close">
    <div class="modal export-dlg" role="dialog" aria-modal="true">
      <h3>导出图纸</h3>
      <div class="field">
        <label>格式</label>
        <select v-model="format">
          <option value="png">PNG 位图</option>
          <option value="svg">SVG 矢量</option>
          <option value="pdf">PDF 图纸（矢量线条）</option>
        </select>
      </div>
      <div class="field">
        <label>导出范围</label>
        <select v-model="scope">
          <option value="tight">内容紧致（推荐）</option>
          <option value="view">当前视图</option>
          <option value="all">全部对象（旧版宽边距）</option>
        </select>
      </div>
      <div class="field">
        <label>紧致边距 (mm)</label>
        <input v-model.number="padding" type="number" min="0" max="500">
      </div>
      <label class="checkline"><input type="checkbox" v-model="includeBackground"> 包含图片底图</label>
      <label class="checkline"><input type="checkbox" v-model="hideGrid"> 不包含网格背景</label>
      <p class="hint">导出只包含当前显示图层；锁定不会排除对象。紧致模式不裁切厚墙、文字和房间名称。</p>
      <div v-if="format === 'png'" class="field">
        <label>PNG 分辨率</label>
        <select v-model.number="pngRes">
          <option :value="1">标准 · 宽 1600px</option>
          <option :value="2">高清 · 宽 3200px</option>
          <option :value="4">超清 · 宽 6400px</option>
        </select>
      </div>
      <div v-if="format === 'pdf'">
        <div class="field-row">
          <div class="field">
            <label>纸张</label>
            <select v-model="paper">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </div>
          <div class="field">
            <label>方向</label>
            <select v-model="orient">
              <option value="landscape">横向</option>
              <option value="portrait">纵向</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>出图比例</label>
          <select v-model.number="pdfScale">
            <option :value="20">1:20</option>
            <option :value="25">1:25</option>
            <option :value="50">1:50</option>
            <option :value="100">1:100</option>
            <option :value="200">1:200</option>
          </select>
        </div>
        <p class="hint">PDF 按所选比例输出真实矢量线条；纸张放不下时会自动放宽一档比例并提示。</p>
      </div>
      <p v-if="error" class="export-error">{{ error }}</p>
      <p v-if="busy" class="hint">正在生成{{ format.toUpperCase() }}，请稍候…</p>
      <div class="modal-btns">
        <button @click="close" :disabled="busy">取消</button>
        <button class="primary" @click="doExport" :disabled="busy || !state.doc.objects.length">开始导出</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { state, setStatus, toast } from '../store.ts';
import { exportRectFor, serializeCanvasSvg, svgToPngBlob } from '../model/exportSvgPng.ts';
import { buildPdfBytes, type PdfExportOptions } from '../model/exportPdf.ts';
import { orderedVisibleObjects } from '../model/layers.ts';
import { downloadBlob } from '../model/download.ts';
import { APP_VERSION } from '../version.ts';

const props = defineProps<{ format: 'png' | 'svg' | 'pdf' }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const format = ref<'png' | 'svg' | 'pdf'>(props.format);
const scope = ref<'view' | 'all' | 'tight'>('tight');
const includeBackground = ref(true);
const hideGrid = ref(false);
const padding = ref(80);
const pngRes = ref(2);
const paper = ref<'A4' | 'A3'>('A4');
const orient = ref<'landscape' | 'portrait'>('landscape');
const pdfScale = ref(state.scale || 50);
const busy = ref(false);
const error = ref('');
const MAX_PIXELS = 32_000_000;
const MAX_SIDE = 12_000;

function close(): void {
  if (busy.value) return;
  emit('close');
}

function exportObjects(): ReturnType<typeof orderedVisibleObjects> {
  const visible = orderedVisibleObjects(state.doc);
  return includeBackground.value ? visible : visible.filter(o => o.type !== 'imagebg');
}

async function doExport(): Promise<void> {
  const objects = exportObjects();
  if (!objects.length) { error.value = '没有可导出的显示对象；请显示图层或勾选包含底图'; return; }
  busy.value = true;
  error.value = '';
  try {
    // 图层 / 属性刚刚变更时，等 Vue 完成一帧渲染再克隆实时 SVG。
    await nextTick();
    const ids = new Set(objects.map(o => o.id));
    const rect = exportRectFor(objects, state.doc.view, scope.value, { padding: Math.max(0, Number(padding.value) || 0) });
    const fileBase = `RoomSketch-${APP_VERSION}-布局图`;
    if (format.value === 'svg') {
      const xml = serializeCanvasSvg(rect, { hideGrid: hideGrid.value, printScale: state.scale, includeIds: ids });
      if (!xml) throw new Error('找不到画布，无法导出 SVG');
      downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase}.svg`);
      setStatus('SVG 矢量文件已导出');
      toast('SVG 矢量文件已导出');
    } else if (format.value === 'png') {
      let W = 1600 * pngRes.value;
      let H = Math.round(W * rect.h / rect.w);
      const scaleDown = Math.min(MAX_PIXELS / (W * H), MAX_SIDE / Math.max(W, H), 1);
      W = Math.max(1, Math.round(W * scaleDown));
      H = Math.max(1, Math.round(H * scaleDown));
      const xml = serializeCanvasSvg(rect, {
        hideGrid: hideGrid.value, printScale: state.scale,
        widthAttr: String(W), heightAttr: String(H), includeIds: ids,
      });
      if (!xml) throw new Error('找不到画布，无法导出 PNG');
      const blob = await svgToPngBlob(xml, W, H);
      downloadBlob(blob, `${fileBase}.png`);
      setStatus(`PNG 图片已导出（${W}×${H}px）`);
      toast(`PNG 图片已导出（${W}×${H}px）`);
    } else {
      const opt: PdfExportOptions = {
        paper: paper.value, orient: orient.value,
        scale: pdfScale.value, scope: scope.value, hideGrid: hideGrid.value,
      };
      setStatus('正在生成矢量 PDF…');
      const r = await buildPdfBytes(objects, opt, state.doc.view);
      downloadBlob(new Blob([r.bytes as unknown as BlobPart], { type: 'application/pdf' }), `${fileBase}.pdf`);
      const relaxedNote = r.relaxed ? `（所选比例超出纸张，已自动改用 1:${r.scale}）` : '';
      setStatus(`矢量 PDF 已导出 · 1:${r.scale} · ${r.paper}${r.orient === 'landscape' ? ' 横版' : ' 竖版'}`);
      toast(`矢量 PDF 已导出（1:${r.scale}）${relaxedNote}`);
    }
    emit('close');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error.value = '导出失败：' + msg;
    setStatus('导出失败：' + msg, false);
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.export-dlg .field select { width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid #c4cede; border-radius: 6px; font-size: 13px; background: #fff; color: inherit; }
.export-error { color: #c0392b; font-size: 13px; font-weight: 600; }
</style>
