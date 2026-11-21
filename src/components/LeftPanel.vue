<!-- RoomSketch 2.0.2 — 左侧面板：工具 / 参数 / 家具图库 / PDF 净化 / 画布管理 -->
<template>
  <aside class="panel left" id="leftPanel">
    <div class="section">
      <div class="panel-title">绘图工具</div>
      <div class="tool-grid">
        <button
          v-for="t in tools" :key="t.id" class="tool" :class="{ active: state.tool === t.id }"
          @click="setTool(t.id)"
        ><span class="ico">{{ t.ico }}</span>{{ t.name }}</button>
      </div>
      <div class="hint" style="margin-top:9px">墙体 / 房间：连续单击添加拐点（默认自动横竖对齐网格，按住 Shift 可画斜线），双击或“完成绘制”结束；其他图形：按住拖动绘制。选中对象后可拖动 <b>角点手柄</b> 缩放、拖动 <b>顶点手柄</b> 改形。按 <span class="kbd">Esc</span> 结束当前绘制。中键、<span class="kbd">空格</span>+左键或 Alt+左键可临时平移画布。</div>
    </div>

    <div class="section">
      <div class="panel-title">绘图参数</div>
      <div class="field-row">
        <div class="field"><label>墙体厚度 (mm)</label><input v-model.number="state.wallWidth" max="1000" min="20" type="number"></div>
        <div class="field"><label>捕捉间距 (mm)</label><input v-model.number="state.gridSize" min="1" type="number"></div>
      </div>
      <div class="field"><label>家具类型（快速选择）</label>
        <select v-model="state.furnitureType" @change="onFurnTypeChange">
          <option value="custom">自定义尺寸 / 从图库选择</option>
          <option value="table">桌子 · 1400×700</option>
          <option value="desk">办公桌 · 1200×600</option>
          <option value="cabinet">柜子 · 900×450</option>
          <option value="wardrobe">衣柜 · 1800×600</option>
          <option value="bed">床 · 2000×1500</option>
          <option value="sofa">沙发 · 2100×850</option>
          <option value="chair">椅子 · 500×500</option>
          <option value="roundtable">圆桌 · 1200×1200</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>家具宽 (mm)</label><input v-model.number="state.furnW" min="50" type="number"></div>
        <div class="field"><label>家具深 (mm)</label><input v-model.number="state.furnH" min="50" type="number"></div>
      </div>
      <div class="field"><label>门扇开启方向</label>
        <select v-model.number="state.doorDir">
          <option :value="1">顺时针 / 向下侧</option>
          <option :value="-1">逆时针 / 向上侧</option>
        </select>
      </div>
      <button style="margin-top:8px" @click="reattachAll">门窗重新贴墙</button>
      <div class="hint">把未关联的门窗吸附到 600mm 内最近的墙体（打开旧工程后可一键批量关联）。</div>
      <label class="checkline"><input v-model="state.snapEnabled" type="checkbox"> 启用网格吸附</label>
      <label class="checkline"><input v-model="state.gridVisible" type="checkbox"> 显示网格</label>
    </div>

    <div class="section">
      <div class="panel-title">家具图库（{{ furnTotal }} 件）</div>
      <input v-model="furnQuery" class="furn-search" placeholder="搜索家具，如：床 / 沙发 / 柜 / 机柜">
      <div class="furn-cats">
        <button
          v-for="c in furnCats" :key="c" class="furn-cat" :class="{ active: furnCat === c }"
          @click="furnCat = c"
        >{{ c }}</button>
      </div>
      <div class="furn-list">
        <button v-for="(it, i) in furnItems" :key="it.label + i" class="furn-item" @click="pickFurn(it)">
          <b>{{ it.label }}</b><span>{{ it.w }} × {{ it.h }} mm · {{ it.cat }}</span>
        </button>
        <div v-if="!furnItems.length" class="hint">没有匹配的家具</div>
      </div>
      <div class="hint" style="margin-top:7px">点击图库项后切换到家具工具：轻点按标准尺寸居中放置，拖动按实际尺寸放置；移动时支持边线 / 中心线吸附，重叠会提示。</div>
    </div>

    <div class="section">
      <div class="panel-title">PDF 图纸净化</div>
      <div class="field-row">
        <div class="field"><label>清理强度</label><select v-model="cleanupMode"><option value="conservative">保守 · 少删</option><option value="balanced">均衡 · 推荐</option><option value="aggressive">深度 · 多删</option></select></div>
        <div class="field"><label>字形阈值 (mm)</label><input v-model.number="glyphSize" type="number" min="2" max="18" step="0.5"></div>
      </div>
      <label class="checkline"><input v-model="preserveConnected" type="checkbox"> 保留连接主结构的小墙段 / 楼梯线</label>
      <label class="checkline"><input v-model="removeOutside" type="checkbox"> 清理主体外的图签 / 引出标记（默认关闭，避免误删房间结构）</label>
      <div class="field-row">
        <button :disabled="!cleanInfo.count" @click="previewClean">{{ cleanPreviewActive ? '取消高亮预览' : `预览待清理（${cleanInfo.count}）` }}</button>
        <button class="danger" :disabled="!cleanInfo.count" @click="onCleanPdf">确认净化</button>
      </div>
      <button class="primary" :disabled="!state.doc.pdfImported" style="width:100%; margin-top:7px" @click="startMarqueeMode">▧ 框选区域删除</button>
      <div class="field-row" style="margin-top:7px">
        <button class="danger" :disabled="!state.marqueeIds.length" @click="deleteMarqueeSelection">删除高亮对象（{{ state.marqueeIds.length }}）</button>
        <button :disabled="!state.marqueeMode && !state.marqueeIds.length" @click="cancelMarqueeSelection">退出 / 取消</button>
      </div>
      <div class="hint" style="margin-top:7px">{{ marqueeHint }}</div>
      <div class="hint" style="margin-top:8px">{{ cleanHint }}</div>
      <div v-if="selectedImage" class="raster-clean" style="margin-top:10px; padding-top:10px; border-top:1px solid #edf0f4">
        <div class="panel-title">扫描页 / 图片底图净化</div>
        <div class="field-row">
          <div class="field"><label>前景阈值</label><input v-model.number="rasterThreshold" type="number" min="60" max="230"></div>
          <div class="field"><label>文字块上限 (px)</label><input v-model.number="rasterGlyph" type="number" min="8" max="300"></div>
        </div>
        <button style="width:100%" :disabled="rasterBusy" @click="onCleanRaster">{{ rasterBusy ? '正在分析连通区域…' : '净化选中图片底图' }}</button>
        <div class="hint">按 8 邻域连通域去除文字和噪点，始终保留最大主体结构；深色图纸自动反色。净化前可撤销原操作。</div>
      </div>
    </div>

    <div class="section">
      <div class="panel-title">画布管理</div>
      <div class="field-row">
        <button @click="$emit('zoom-out')">－ 缩小</button>
        <button @click="$emit('zoom-in')">＋ 放大</button>
      </div>
      <div class="field-row">
        <button @click="$emit('fit-view')">适合窗口</button>
        <button class="danger" @click="deleteSelected">删除选中</button>
      </div>
      <button class="danger" style="width:100%; margin-top:6px" @click="onClear">一键清空画布</button>
      <div class="hint" style="margin-top:8px">清空会删除全部墙体、门窗、家具及导入线条。可使用撤销恢复。编辑内容会自动备份到本机浏览器。</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  state, setTool, reattachAll, deleteSelected, setStatus, toast,
  startMarqueeMode, deleteMarqueeSelection, cancelMarqueeSelection, clearCanvas,
  deleteObjectsByIds, type ToolId,
} from '../store.ts';
import { FURN_LIB, FURN_PRESETS, type FurnItem } from '../model/furniture.ts';
import { detectPdfMarkup, DEFAULT_PDF_CLEANUP, type MarkupResult } from '../model/pdfCleanup.ts';
import { cleanRasterDataUrl } from '../model/rasterCleanup.ts';
import { orderedVisibleObjects, isObjectLocked } from '../model/layers.ts';
import { showConfirm } from '../modal.ts';

defineEmits(['zoom-in', 'zoom-out', 'fit-view']);

const tools: { id: ToolId; name: string; ico: string }[] = [
  { id: 'select', name: '选择 / 移动', ico: '↖' },
  { id: 'wall', name: '墙体 / 折线', ico: '／' },
  { id: 'room', name: '多边形房间', ico: '⬟' },
  { id: 'rect', name: '矩形区域', ico: '▱' },
  { id: 'line', name: '辅助线', ico: '╱' },
  { id: 'dimension', name: '尺寸标注', ico: '↔' },
  { id: 'door', name: '门 / 开向弧线', ico: '◜' },
  { id: 'window', name: '窗户', ico: '▥' },
  { id: 'furniture', name: '桌柜 / 家具', ico: '▤' },
  { id: 'label', name: '文字标注', ico: 'T' },
  { id: 'pan', name: '平移画布', ico: '✥' },
  { id: 'calibrate', name: '比例校准', ico: '⌁' },
];

const furnQuery = ref('');
const furnCat = ref('全部');
const furnTotal = FURN_LIB.reduce((sum, c) => sum + c.items.length, 0);
const furnCats = computed(() => ['全部', ...FURN_LIB.map(c => c.cat)]);
const furnItems = computed(() => {
  const q = furnQuery.value.trim().toLowerCase();
  const out: (FurnItem & { cat: string })[] = [];
  for (const g of FURN_LIB) {
    if (furnCat.value !== '全部' && g.cat !== furnCat.value) continue;
    for (const it of g.items) if (!q || it.label.toLowerCase().includes(q)) out.push({ ...it, cat: g.cat });
  }
  return out;
});

function onFurnTypeChange(): void {
  state.customFurnLabel = null;
  state.customFurnKind = null;
  const a = FURN_PRESETS[state.furnitureType];
  if (a) { state.furnW = a[0]; state.furnH = a[1]; }
}

function pickFurn(it: FurnItem & { cat: string }): void {
  state.customFurnLabel = it.label;
  state.customFurnKind = it.kind;
  state.furnitureType = 'custom';
  state.furnW = it.w;
  state.furnH = it.h;
  setTool('furniture');
  toast(`已选择「${it.label}」，在画布上轻点或拖动放置`);
}

// ---- PDF 净化 ----
const EMPTY_RESULT: MarkupResult = {
  ids: [], count: 0,
  details: { removedBlack: 0, removedFrame: 0, removedOutside: 0, removedGlyph: 0, rescuedSmall: 0, coreFound: false, neutralIsMarkup: false },
};
const cleanupMode = ref(DEFAULT_PDF_CLEANUP.mode);
const glyphSize = ref(DEFAULT_PDF_CLEANUP.glyphSize);
const preserveConnected = ref(DEFAULT_PDF_CLEANUP.preserveConnected);
const removeOutside = ref(DEFAULT_PDF_CLEANUP.removeOutside);

const cleanInfo = computed(() => {
  if (!state.doc.pdfImported) return EMPTY_RESULT;
  const targets = orderedVisibleObjects(state.doc)
    .filter(o => (o.type === 'pdf') && !isObjectLocked(state.doc, o));
  return detectPdfMarkup(targets, state.doc.pdfPageSize, {
    mode: cleanupMode.value, glyphSize: glyphSize.value,
    preserveConnected: preserveConnected.value, removeOutside: removeOutside.value,
  }, state.doc.pdfPageSizes || {});
});
const cleanPreviewActive = computed(() => cleanInfo.value.count > 0 && state.marqueeIds.length === cleanInfo.value.count);

const marqueeHint = computed(() =>
  state.marqueeIds.length
    ? `已高亮 ${state.marqueeIds.length} 个对象。红色高亮为待删除范围；重新框选或预览都会更新该范围。`
    : '导入 PDF 后可点击“预览待清理”，也可使用“框选区域删除”在图纸上手动圈选。红色高亮的对象确认后删除。');

const cleanHint = computed(() => {
  if (!state.doc.pdfImported) return '针对 CAD 矢量 PDF：逐页识别颜色、主体连通区域和小型文字簇；与主结构相连的小路径可抢救保留。清理前先高亮预览，Ctrl+Z 可撤销。';
  const d = cleanInfo.value.details;
  if (cleanInfo.value.count) {
    return `检测到 ${cleanInfo.value.count} 个待清理对象：文字/引线 ${d.removedBlack || 0}，页面边框 ${d.removedFrame || 0}，主体外标记 ${d.removedOutside || 0}，小型文字簇 ${d.removedGlyph || 0}；已保护连接主结构的小路径 ${d.rescuedSmall || 0} 个。`;
  }
  return '当前强度下没有明确的多余标注。为避免误删墙体结构，建议调低阈值或使用框选删除。';
});

function previewClean(): void {
  if (!cleanInfo.value.count) return;
  const isPreview = cleanPreviewActive.value;
  state.marqueeIds = isPreview ? [] : cleanInfo.value.ids;
  state.marqueeRect = null;
  state.marqueeMode = false;
  setStatus(isPreview ? '已取消清理预览' : `已高亮 ${state.marqueeIds.length} 个待清理对象，请确认后净化`);
}

function onCleanPdf(): void {
  if (!state.doc.pdfImported) { toast('请先导入 PDF'); return; }
  const result = cleanInfo.value;
  if (!result.count) { toast('未发现可安全自动清理的标注；可使用框选删除'); return; }
  const d = result.details;
  showConfirm({
    title: '确认清理标注 / 文字？',
    message: `将删除 ${result.count} 个矢量对象：文字/引线 ${d.removedBlack || 0}，页面边框 ${d.removedFrame || 0}，主体外标记 ${d.removedOutside || 0}，小型文字簇 ${d.removedGlyph || 0}；已保护 ${d.rescuedSmall || 0} 个连接主结构的小路径。可按 Ctrl+Z 撤销。`,
    confirmText: `确认清理（${result.count}）`,
    danger: true,
    onConfirm: () => {
      const removed = deleteObjectsByIds(result.ids);
      state.marqueeRect = null;
      setStatus(`已清理 ${removed} 个标注 / 文字对象，主要房间结构已保留`);
      toast(`已清除 ${removed} 个标注 / 文字对象；可按 Ctrl+Z 撤销`);
    },
  });
}

// ---- 扫描页 / 图片底图净化 ----
const selectedImage = computed(() => (selectedObjectRaw()?.type === 'imagebg' ? selectedObjectRaw() : null));
const rasterThreshold = ref(175);
const rasterGlyph = ref(80);
const rasterBusy = ref(false);

function selectedObjectRaw() {
  return state.doc.objects.find(o => o.id === state.selectedId) ?? null;
}

async function onCleanRaster(): Promise<void> {
  const o = selectedImage.value;
  if (!o) { toast('请先选中一张图片底图'); return; }
  if (isObjectLocked(state.doc, o)) { toast('图片底图所在图层已锁定'); return; }
  rasterBusy.value = true;
  try {
    const r = await cleanRasterDataUrl(o.src, {
      threshold: rasterThreshold.value,
      maxGlyphSize: rasterGlyph.value,
      removeThin: false,
    });
    const note = `噪点 ${r.removedNoise}、文字块 ${r.removedGlyphs}${r.removedThin ? `、细线 ${r.removedThin}` : ''}${r.inverted ? '（已自动反色）' : ''}`;
    showConfirm({
      title: '应用图片净化结果？',
      message: `将替换当前底图为净化位图（${r.width}×${r.height} px），删除：${note}。原结果可通过撤销恢复。`,
      confirmText: '应用净化',
      onConfirm: () => {
        o.src = r.dataUrl;
        o.srcW = r.width;
        o.srcH = r.height;
        setStatus(`图片底图已净化：删除 ${r.removedNoise + r.removedGlyphs + r.removedThin} 个小型连通块`);
        toast('图片底图净化完成，可按 Ctrl+Z 撤销');
      },
    });
  } catch (err) {
    toast('图片净化失败：' + String(err));
    setStatus('图片底图净化失败', false);
  } finally {
    rasterBusy.value = false;
  }
}

function onClear(): void {
  showConfirm({
    title: '清空整个画布？',
    message: '此操作会删除当前画布中的全部对象，包括 PDF 提取线条、墙体、门窗、家具和图片底图。可以通过撤销恢复。',
    confirmText: '确认清空',
    danger: true,
    onConfirm: () => { clearCanvas(); },
  });
}
</script>
