<!-- RoomSketch 2.0.1 — 右侧属性面板（移植 1.0.0 updateInspector） -->
<template>
  <aside class="panel right" id="rightPanel">
    <div class="panel-title">对象属性</div>
    <div v-if="multiIds.length && !selected">
      <div class="property-summary">已框选 <b>{{ multiIds.length }}</b> 个对象</div>
      <p class="hint">拖动任意选中对象可整体移动；按 Delete 或下方按钮统一删除。</p>
      <div class="prop-actions"><button class="danger" @click="deleteSelected">删除所选（{{ multiIds.length }}）</button></div>
    </div>
    <div v-else-if="!selected" class="inspector-empty">
      <div class="big">⌖</div>选择画布中的墙体、门窗或家具<br>即可查看和调整对象属性。
    </div>
    <div v-else>
      <div class="property-summary">
        <strong>{{ typeName }}</strong><br>
        <span>{{ selected.type }} · {{ selected.id }}</span>
        <span v-if="areaText"><br>{{ areaText }}</span>
      </div>
      <div class="field-row">
        <div class="field"><label>位置 X (mm)</label><input type="number" :value="fmt(selected.x || 0)" @change="onProp('x', $event)"></div>
        <div class="field"><label>位置 Y (mm)</label><input type="number" :value="fmt(selected.y || 0)" @change="onProp('y', $event)"></div>
      </div>
      <div v-if="isRect" class="field-row">
        <div class="field"><label>宽度 (mm)</label><input type="number" min="1" :value="fmt(selected.w)" @change="onProp('w', $event)"></div>
        <div class="field"><label>深度 (mm)</label><input type="number" min="1" :value="fmt(selected.h)" @change="onProp('h', $event)"></div>
      </div>
      <div v-if="selected.type === 'wall'">
        <div class="field"><label>墙体厚度 (mm)</label><input type="number" min="20" :value="fmt(selected.wallWidth || 120)" @change="onProp('wallWidth', $event)"></div>
        <div class="field"><label>墙体高度 (mm)</label><input type="number" min="100" :value="fmt(selected.wallHeight || 2800)" @change="onProp('wallHeight', $event)"></div>
        <div class="hint">已关联门窗：{{ linkedCount }} 个（移动 / 改形墙体时跟随）</div>
      </div>
      <div v-if="selected.type === 'door' || selected.type === 'window' || selected.type === 'dimension'" class="field">
        <label>{{ selected.type === 'dimension' ? '标注长度 (mm)' : '开口宽度 (mm)' }}</label>
        <input type="number" min="50" :value="fmt(selected.type === 'dimension' ? (selected.length || selected.w) : selected.w)" @change="onProp(selected.type === 'dimension' ? 'length' : 'w', $event)">
      </div>
      <div v-if="selected.type === 'door' || selected.type === 'window'" class="field">
        <label>墙体关联</label>
        <div class="hint" style="margin:0">{{ linkText }}</div>
        <button style="margin-top:6px" @click="onReattach">重新吸附到最近墙体</button>
      </div>
      <div v-if="selected.type === 'door'" class="field">
        <label>开启方向</label>
        <select :value="selected.dir" @change="onProp('dir', $event)">
          <option :value="1">顺时针</option>
          <option :value="-1">逆时针</option>
        </select>
      </div>
      <div v-if="selected.type === 'imagebg'" class="field">
        <label>不透明度（{{ fmt((selected.opacity ?? 1) * 100) }}%）</label>
        <input type="range" min="10" max="100" :value="Math.round((selected.opacity ?? 1) * 100)" @change="onProp('opacity', $event)">
      </div>
      <div v-if="selected.type === 'furniture' || selected.type === 'label'" class="field">
        <label>名称 / 标注</label>
        <input type="text" :value="selected.label || ''" @change="onProp('label', $event)">
      </div>
      <div v-if="selected.type === 'furniture'" class="field">
        <label>家具高度 (mm)</label>
        <input type="number" min="10" :value="fmt(selected.furnH || furnH3D(selected.label))" @change="onProp('furnH', $event)">
      </div>
      <div v-if="selected.type === 'polyroom'" class="field">
        <label>房间名称</label>
        <input type="text" :value="selected.label || ''" placeholder="留空则显示面积" @change="onProp('label', $event)">
      </div>
      <div class="field"><label>旋转角度 (°)</label><input type="number" :value="fmt(selected.rotation || 0)" @change="onProp('rotation', $event)"></div>
      <div class="field"><label>线条颜色</label><input type="color" :value="selected.strokeColor || '#27384a'" @change="onProp('strokeColor', $event)"></div>
      <div class="prop-actions">
        <button @click="duplicateSelected">复制对象</button>
        <button @click="rotateSelected90">旋转 90°</button>
        <button class="danger" @click="deleteSelected">删除</button>
      </div>
    </div>

    <div class="section" style="margin-top:15px; padding-top:13px; border-top:1px solid #edf0f4">
      <div class="panel-title">图纸信息</div>
      <div class="field"><label>当前比例标注</label><input readonly :value="'1 : ' + state.scale"></div>
      <div class="field"><label>对象数量</label><input readonly :value="`${state.doc.objects.length} 个对象`"></div>
      <div class="field"><label>房间面积合计</label><input readonly :value="areaTotal"></div>
      <div class="field"><label>PDF 线条提取</label><div class="pdf-info-box">{{ pdfInfo }}</div></div>
    </div>
    <div class="tipbox"><strong>快速操作</strong><br>• 选择对象后拖动移动；拖角点缩放、拖顶点改形<br>• <span class="kbd">Delete</span> 删除选中 · <span class="kbd">Ctrl+Z</span> 撤销<br>• 空白处拖动 = 框选多选；平移请用「平移画布」工具；滚轮 / 双指缩放<br>• 双击或点“完成绘制”结束折线（方向键微移 · R 旋转90° · Ctrl+C/V 复制粘贴 · Ctrl+D 副本 · 门/窗自动贴墙）</div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  state, selectedObject, areaTotal, snapshot, markDirty, deleteSelected,
  duplicateSelected, rotateSelected90, toast,
} from '../store.ts';
import { fmt, polyArea } from '../model/geometry.ts';
import { syncWallOpenings, relocateOpening, detachOpening, tryAttach } from '../model/wallLink.ts';
import { furnH3D } from '../model/furniture.ts';

const selected = selectedObject;
const multiIds = computed(() => state.multiIds);

const TYPE_NAMES: Record<string, string> = {
  wall: '墙体', door: '门', window: '窗户', rect: '矩形区域', furniture: '家具',
  pdf: 'PDF线条', line: '辅助线', polyline: '折线', polyroom: '房间',
  imagebg: '图片底图', label: '文字', dimension: '尺寸标注',
};
const typeName = computed(() => selected.value ? (TYPE_NAMES[selected.value.type] || selected.value.type) : '');

const isRect = computed(() => selected.value && ['rect', 'furniture', 'imagebg'].includes(selected.value.type));

const areaText = computed(() => {
  const o = selected.value;
  if (!o) return '';
  if (isRect.value && o.w && o.h) return `尺寸 ${fmt(o.w)} × ${fmt(o.h)} mm · 面积 ${(o.w * o.h / 1e6).toFixed(2)} m²`;
  if (o.type === 'polyroom') return `面积 ${(polyArea(o.points) / 1e6).toFixed(2)} m² · ${o.points.length} 个顶点`;
  if (o.type === 'wall' && o.points?.length >= 4) {
    const ps = o.points, first = ps[0], last = ps[ps.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1) return `闭合轮廓估算面积 ${(polyArea(ps) / 1e6).toFixed(2)} m²`;
  }
  return '';
});

const linkedCount = computed(() => selected.value?.type === 'wall'
  ? state.doc.objects.filter(x => (x.type === 'door' || x.type === 'window') && x.wallId === selected.value!.id).length
  : 0);

const linkText = computed(() => {
  const o = selected.value;
  if (!o || (o.type !== 'door' && o.type !== 'window')) return '';
  if (!o.wallId) return '未关联墙体（独立对象）';
  const w = state.doc.objects.find(x => x.id === o.wallId);
  return w ? `已关联墙体 · 沿墙位置 ${Math.round((o.wallT || 0) * 100)}%` : '关联的墙体已不存在';
});

const pdfInfo = computed(() => state.doc.pdfImported
  ? '工程文件包含已导入的 PDF 矢量路径。'
  : '尚未导入 PDF。支持常见矢量 PDF 的线条和曲线路径提取；默认忽略纯填充路径（如字体轮廓和大面积填充），避免产生杂乱线条；线宽按 PDF 原始设置保留。扫描版 PDF 请先转为图片后使用“导入底图”。');

function onProp(key: string, e: Event): void {
  const o = selected.value;
  if (!o) return;
  const inp = e.target as HTMLInputElement | HTMLSelectElement;
  snapshot();
  let v: string | number = inp.type === 'number' || inp.type === 'range' ? Number(inp.value) : inp.value;
  if (key === 'opacity') v = Number(inp.value) / 100;
  if (key === 'dir') v = Number(v);
  (o as Record<string, unknown>)[key] = v;
  if (o.type === 'wall' && (key === 'x' || key === 'y' || key === 'rotation')) syncWallOpenings(state.doc.objects, o);
  else if ((o.type === 'door' || o.type === 'window') && (key === 'x' || key === 'y')) relocateOpening(state.doc.objects, o);
  else if ((o.type === 'door' || o.type === 'window') && key === 'rotation') detachOpening(o);
  if (o.type === 'dimension' && key === 'length') o.label = `${Math.round(Number(v))} mm`;
  markDirty();
}

function onReattach(): void {
  const o = selected.value;
  if (!o || (o.type !== 'door' && o.type !== 'window')) return;
  snapshot();
  if (tryAttach(state.doc.objects, o)) toast('已吸附到墙体');
  else toast('附近 600mm 内没有墙体，保持独立对象');
  markDirty();
}
</script>
