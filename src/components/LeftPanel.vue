<!-- RoomSketch 2.0.1 — 左侧面板：工具 / 参数 / 家具图库 / PDF 净化 / 画布管理 -->
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
      <div class="hint" style="margin-top:9px">墙体 / 房间：连续单击添加拐点（默认自动横竖对齐网格，按住 Shift 可画斜线），双击或“完成绘制”结束；其他图形：按住拖动绘制。选中对象后可拖动 <b>角点手柄</b> 缩放、拖动 <b>顶点手柄</b> 改形。按 <span class="kbd">Esc</span> 结束当前绘制。</div>
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
      <div class="panel-title">家具图库</div>
      <input v-model="furnQuery" class="furn-search" placeholder="搜索家具，如：床 / 沙发 / 柜">
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
      <div class="hint" style="margin-top:7px">点击图库项后切换到家具工具，在画布上按住拖动放置（轻轻一点则按标准尺寸放置）。</div>
    </div>

    <div class="section">
      <div class="panel-title">PDF 图纸净化</div>
      <button class="danger" :disabled="!cleanInfo.count" style="width:100%" @click="onCleanPdf">
        {{ cleanInfo.count ? `一键清除标注 / 文字（${cleanInfo.count}）` : '一键清除标注 / 文字' }}
      </button>
      <button class="primary" :disabled="!state.doc.pdfImported" style="width:100%; margin-top:7px" @click="startMarqueeMode">▧ 框选区域删除</button>
      <div class="field-row" style="margin-top:7px">
        <button class="danger" :disabled="!state.marqueeIds.length" @click="deleteMarqueeSelection">删除框选对象（{{ state.marqueeIds.length }}）</button>
        <button :disabled="!state.marqueeMode && !state.marqueeIds.length" @click="cancelMarqueeSelection">退出框选</button>
      </div>
      <div class="hint" style="margin-top:7px">{{ marqueeHint }}</div>
      <div class="hint" style="margin-top:8px">{{ cleanHint }}</div>
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
  state, setTool, reattachAll, deleteSelected, snapshot, markDirty, setStatus, toast,
  startMarqueeMode, deleteMarqueeSelection, cancelMarqueeSelection, clearCanvas,
  type ToolId,
} from '../store.ts';
import { FURN_LIB, FURN_PRESETS, type FurnItem } from '../model/furniture.ts';
import { detectPdfMarkup } from '../model/pdfCleanup.ts';
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
  const a = FURN_PRESETS[state.furnitureType];
  if (a) { state.furnW = a[0]; state.furnH = a[1]; }
}

function pickFurn(it: FurnItem & { cat: string }): void {
  state.customFurnLabel = it.label;
  state.furnitureType = 'custom';
  state.furnW = it.w;
  state.furnH = it.h;
  setTool('furniture');
  toast(`已选择「${it.label}」，在画布上拖动放置`);
}

// ---- PDF 净化 ----
const cleanInfo = computed(() =>
  state.doc.pdfImported
    ? detectPdfMarkup(state.doc.objects, state.doc.pdfPageSize)
    : { ids: [] as string[], count: 0, details: { removedBlack: 0, removedFrame: 0, removedOutside: 0, removedGlyph: 0, coreFound: false, neutralIsMarkup: false } });

const marqueeHint = computed(() =>
  state.marqueeIds.length
    ? `已框选 ${state.marqueeIds.length} 个 PDF 对象。红色高亮区域为待删除对象；确认删除前可重新框选。`
    : '导入 PDF 后点击“框选区域删除”，在图纸上按住拖出矩形。红色高亮的 PDF 线条将被选中，确认后删除。');

const cleanHint = computed(() => {
  if (!state.doc.pdfImported) return '针对 CAD 矢量 PDF：按颜色、主体连通区域和小型文字簇识别标注；清理前显示统计数量，Ctrl+Z 可撤销。';
  const d = cleanInfo.value.details;
  if (cleanInfo.value.count) return `发现约 ${cleanInfo.value.count} 个待清理矢量对象：黑色文字/引线 ${d.removedBlack || 0}，页面边框 ${d.removedFrame || 0}，主体外标记 ${d.removedOutside || 0}，小型文字簇 ${d.removedGlyph || 0}。点击即可净化，Ctrl+Z 可撤销。`;
  return '没有发现足够明确的多余标注。为避免误删墙体结构，建议使用“框选区域删除”手动清理。';
});

function onCleanPdf(): void {
  if (!state.doc.pdfImported) { toast('请先导入 PDF'); return; }
  const result = cleanInfo.value;
  if (!result.count) { toast('未发现可安全自动清理的标注；可使用框选删除'); return; }
  const d = result.details;
  showConfirm({
    title: '确认清理标注 / 文字？',
    message: `将删除 ${result.count} 个矢量对象：黑色文字/引线 ${d.removedBlack || 0}，页面边框 ${d.removedFrame || 0}，主体外标记 ${d.removedOutside || 0}，小型文字簇 ${d.removedGlyph || 0}。主要房间结构会保留，清理后可按 Ctrl+Z 撤销。`,
    confirmText: `确认清理（${result.count}）`,
    danger: true,
    onConfirm: () => {
      const remove = new Set(result.ids);
      const oldCount = state.doc.objects.length;
      snapshot();
      state.doc.objects = state.doc.objects.filter(o => !remove.has(o.id));
      state.marqueeIds = [];
      if (state.selectedId && remove.has(state.selectedId)) state.selectedId = null;
      markDirty();
      const removed = oldCount - state.doc.objects.length;
      setStatus(`已清理 ${removed} 个标注 / 文字对象，保留主要房间结构`);
      toast(`已清除 ${removed} 个标注 / 文字对象；可按 Ctrl+Z 撤销`);
    },
  });
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
