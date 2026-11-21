<!-- RoomSketch 2.0.2 — 右侧属性面板：对象属性 / 房间属性 / 图层控制 / 图纸统计 -->
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
        <span v-if="selectedLocked"> · <b>图层已锁定</b></span>
        <span v-if="areaText"><br>{{ areaText }}</span>
      </div>
      <div class="field-row">
        <div class="field"><label>位置 X (mm)</label><input type="number" :value="fmt(selected.x || 0)" :disabled="selectedLocked" @change="onProp('x', $event)"></div>
        <div class="field"><label>位置 Y (mm)</label><input type="number" :value="fmt(selected.y || 0)" :disabled="selectedLocked" @change="onProp('y', $event)"></div>
      </div>
      <div v-if="isRect" class="field-row">
        <div class="field"><label>宽度 (mm)</label><input type="number" min="1" :value="fmt(selected.w)" :disabled="selectedLocked" @change="onProp('w', $event)"></div>
        <div class="field"><label>深度 (mm)</label><input type="number" min="1" :value="fmt(selected.h)" :disabled="selectedLocked" @change="onProp('h', $event)"></div>
      </div>
      <div v-if="selected.type === 'wall'">
        <div class="field"><label>墙体厚度 (mm)</label><input type="number" min="20" :value="fmt(selected.wallWidth || 120)" :disabled="selectedLocked" @change="onProp('wallWidth', $event)"></div>
        <div class="field"><label>墙体高度 (mm)</label><input type="number" min="100" :value="fmt(selected.wallHeight || 2800)" :disabled="selectedLocked" @change="onProp('wallHeight', $event)"></div>
        <div class="hint">已关联门窗：{{ linkedCount }} 个（移动 / 改形墙体时跟随）</div>
      </div>
      <div v-if="selected.type === 'door' || selected.type === 'window' || selected.type === 'dimension'" class="field">
        <label>{{ selected.type === 'dimension' ? '标注长度 (mm)' : '开口宽度 (mm)' }}</label>
        <input type="number" min="50" :value="fmt(selected.type === 'dimension' ? (selected.length || selected.w) : selected.w)" :disabled="selectedLocked" @change="onProp(selected.type === 'dimension' ? 'length' : 'w', $event)">
      </div>
      <div v-if="selected.type === 'door' || selected.type === 'window'" class="field">
        <label>墙体关联</label>
        <div class="hint" style="margin:0">{{ linkText }}</div>
        <button style="margin-top:6px" :disabled="selectedLocked" @click="onReattach">重新吸附到最近墙体</button>
      </div>
      <div v-if="selected.type === 'door'" class="field">
        <label>开启方向</label>
        <select :value="selected.dir" :disabled="selectedLocked" @change="onProp('dir', $event)">
          <option :value="1">顺时针</option>
          <option :value="-1">逆时针</option>
        </select>
      </div>
      <div v-if="selected.type === 'imagebg'" class="field">
        <label>不透明度（{{ fmt((selected.opacity ?? 1) * 100) }}%）</label>
        <input type="range" min="10" max="100" :value="Math.round((selected.opacity ?? 1) * 100)" :disabled="selectedLocked" @change="onProp('opacity', $event)">
      </div>
      <div v-if="selected.type === 'furniture' || selected.type === 'label'" class="field">
        <label>名称 / 标注</label>
        <input type="text" :value="selected.label || ''" :disabled="selectedLocked" @change="onProp('label', $event)">
      </div>
      <div v-if="selected.type === 'furniture'" class="field">
        <label>家具高度 (mm)</label>
        <input type="number" min="10" :value="fmt(selected.furnH || furnH3D(selected.label))" :disabled="selectedLocked" @change="onProp('furnH', $event)">
      </div>

      <div v-if="isRoom" class="room-props">
        <div class="field"><label>房间名称</label><input type="text" :value="selected.label || ''" placeholder="如：调度大厅" :disabled="selectedLocked" @change="onProp('label', $event)"></div>
        <div class="field"><label>功能分区</label>
          <input list="room-zones" type="text" :value="selected.zone || '未分区'" placeholder="选择或输入分区名" :disabled="selectedLocked" @change="onRoomZone($event)">
          <datalist id="room-zones"><option v-for="z in ROOM_ZONES" :key="z" :value="z"></option></datalist>
        </div>
        <div class="field-row">
          <div class="field"><label>填充颜色</label><input type="color" :value="selected.fill || '#2e6ed8'" :disabled="selectedLocked" @change="onProp('fill', $event)"></div>
          <div class="field"><label>填充不透明度（{{ Math.round((selected.fillOpacity ?? 0.12) * 100) }}%）</label>
            <input type="range" min="4" max="45" :value="Math.round((selected.fillOpacity ?? 0.12) * 100)" :disabled="selectedLocked" @change="onRoomOpacity($event)">
          </div>
        </div>
        <label class="checkline"><input type="checkbox" :checked="selected.includeInTotal !== false" :disabled="selectedLocked" @change="onRoomInclude($event)"> 计入面积统计</label>
        <div class="hint">面积按顶点实时计算（{{ selected.points.length }} 个顶点），不重复保存；分区结果见下方统计。</div>
      </div>

      <div v-if="!isRoom" class="field"><label>旋转角度 (°)</label><input type="number" :value="fmt(selected.rotation || 0)" :disabled="selectedLocked" @change="onProp('rotation', $event)"></div>
      <div v-if="!isRoom" class="field"><label>线条颜色</label><input type="color" :value="selected.strokeColor || '#27384a'" :disabled="selectedLocked" @change="onProp('strokeColor', $event)"></div>
      <div class="prop-actions">
        <button :disabled="selectedLocked" @click="duplicateSelected">复制对象</button>
        <button :disabled="selectedLocked" @click="rotateSelected90">旋转 90°</button>
        <button class="danger" @click="deleteSelected">删除</button>
      </div>
    </div>

    <div class="section" style="margin-top:15px; padding-top:13px; border-top:1px solid #edf0f4">
      <div class="panel-title">图层控制</div>
      <div class="layer-list">
        <div v-for="l in layersDisplay" :key="l.id" class="layer-row" :class="{ hidden: !l.state.visible, locked: l.state.locked }">
          <span class="layer-name" :title="`${l.count} 个对象`">{{ l.name }}<small>{{ l.count }}</small></span>
          <label class="layer-btn" :title="l.state.visible ? '隐藏图层' : '显示图层'"><input type="checkbox" :checked="l.state.visible" @change="setLayerVisible(l.id, ($event.target as HTMLInputElement).checked)">👁</label>
          <button class="layer-btn" :title="l.state.locked ? '解锁图层' : '锁定图层'" @click="toggleLayerLock(l.id)">{{ l.state.locked ? '🔒' : '🔓' }}</button>
          <button class="layer-btn" title="上移一层" :disabled="l.first" @click="moveLayer(l.id, 1)">↑</button>
          <button class="layer-btn" title="下移一层" :disabled="l.last" @click="moveLayer(l.id, -1)">↓</button>
        </div>
      </div>
      <button style="width:100%; margin-top:8px" @click="resetLayers">恢复默认图层与顺序</button>
      <div class="hint">列表自上而下为叠放顺序；隐藏图层不参与画布、导出、框选和 PDF 清理；锁定图层不可编辑、不可删除。</div>
    </div>

    <div class="section" style="margin-top:15px; padding-top:13px; border-top:1px solid #edf0f4">
      <div class="panel-title">图纸信息</div>
      <div class="field"><label>当前比例标注</label><input readonly :value="'1 : ' + state.scale"></div>
      <div class="field"><label>对象数量</label><input readonly :value="`${state.doc.objects.length} 个对象`"></div>
      <div class="field"><label>房间面积合计</label><input readonly :value="areaTotal"></div>
      <div class="field"><label>PDF 线条提取</label><div class="pdf-info-box">{{ pdfInfo }}</div></div>
    </div>

    <div class="section">
      <div class="panel-title">房间 / 分区统计</div>
      <div class="stat-grid">
        <div class="stat-cell"><b>{{ roomStats.count }}</b><span>房间</span></div>
        <div class="stat-cell"><b>{{ formatArea(roomStats.totalMm2) }}</b><span>总面积</span></div>
        <div class="stat-cell"><b>{{ roomStats.zones.length }}</b><span>分区</span></div>
      </div>
      <div class="zone-list">
        <div v-for="z in roomStats.zones" :key="z.zone" class="zone-row">
          <span>{{ z.zone }}</span><b>{{ z.count }} 间 · {{ formatArea(z.areaMm2) }}</b>
        </div>
        <div v-if="!roomStats.zones.length" class="hint">还没有可统计的多边形房间。用「多边形房间」绘制后，可在属性栏设置名称、颜色和分区。</div>
      </div>
      <div class="room-list">
        <button v-for="r in roomStats.rooms" :key="r.id" class="room-row" @click="selectRoom(r.id)">
          <span class="room-swatch" :style="{ background: r.color }"></span>
          <span class="room-name">{{ r.name }}<small>{{ r.zone }}</small></span>
          <b :class="{ muted: !r.included }">{{ formatArea(r.areaMm2) }}</b>
        </button>
      </div>
      <div class="field-row">
        <button @click="copyRoomStats">复制统计表</button>
        <button @click="fitAllRooms">定位第一个房间</button>
      </div>
    </div>

    <div class="tipbox"><strong>快速操作</strong><br>• 选择对象后拖动移动；拖角点缩放、拖顶点改形<br>• <span class="kbd">Delete</span> 删除选中 · <span class="kbd">Ctrl+Z</span> 撤销<br>• 空白处拖动 = 框选多选；中键 / 空格 / Alt+左键平移；滚轮 / 双指缩放<br>• 双击或点“完成绘制”结束折线（方向键微移 · R 旋转90° · Ctrl+C/V 复制粘贴 · Ctrl+D 副本 · 门/窗自动贴墙）</div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  state, selectedObject, areaTotal, markDirty, deleteSelected,
  duplicateSelected, rotateSelected90, toast, selectObject,
  setLayerVisible, toggleLayerLock, moveLayer, resetLayers,
} from '../store.ts';
import { fmt, polyArea } from '../model/geometry.ts';
import { syncWallOpenings, relocateOpening, detachOpening, tryAttach } from '../model/wallLink.ts';
import { furnH3D } from '../model/furniture.ts';
import { ROOM_ZONES, collectRoomStats, formatArea } from '../model/rooms.ts';
import { LAYER_NAMES, isObjectLocked, normalizeLayerOrder } from '../model/layers.ts';
import type { LayerId } from '../model/types.ts';

const selected = selectedObject;
const multiIds = computed(() => state.multiIds);
const selectedLocked = computed(() => !!selected.value && isObjectLocked(state.doc, selected.value));
const isRoom = computed(() => selected.value?.type === 'polyroom');
const isRect = computed(() => !!selected.value && ['rect', 'furniture', 'imagebg'].includes(selected.value.type));

const TYPE_NAMES: Record<string, string> = {
  wall: '墙体', door: '门', window: '窗户', rect: '矩形区域', furniture: '家具',
  pdf: 'PDF线条', line: '辅助线', polyline: '折线', polyroom: '房间',
  imagebg: '图片底图', label: '文字', dimension: '尺寸标注',
};
const typeName = computed(() => selected.value ? (TYPE_NAMES[selected.value.type] || selected.value.type) : '');

const areaText = computed(() => {
  const o = selected.value;
  if (!o) return '';
  if (isRect.value && o.w && o.h) return `尺寸 ${fmt(o.w)} × ${fmt(o.h)} mm · 面积 ${(o.w * o.h / 1e6).toFixed(2)} m²`;
  if (o.type === 'polyroom') {
    const area = collectRoomStats([o]).rooms[0]?.areaMm2 ?? 0;
    return `面积 ${(area / 1e6).toFixed(2)} m² · ${o.points.length} 个顶点 · 分区 ${o.zone || '未分区'}`;
  }
  if (o.type === 'wall' && o.points?.length >= 4) {
    const ps = o.points, first = ps[0], last = ps[ps.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1) {
      return `闭合轮廓估算面积 ${(polyArea(ps) / 1e6).toFixed(2)} m²`;
    }
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
  ? '工程文件包含已导入的 PDF 矢量路径；可用左侧净化面板高亮预览并按页清理。'
  : '尚未导入 PDF。支持常见矢量 PDF 的线条和曲线路径提取；默认忽略纯填充路径（如字体轮廓和大面积填充），避免产生杂乱线条；线宽按 PDF 原始设置保留。扫描版 PDF 请先转为图片后使用“导入底图”。');

// ---- 图层控制 ----
const layersDisplay = computed(() => {
  const order = normalizeLayerOrder(state.doc.layerOrder).slice().reverse();
  const counts = new Map<LayerId, number>();
  for (const o of state.doc.objects) {
    const id = layerIdOf(o.type);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return order.map((id, index) => ({
    id,
    name: LAYER_NAMES[id],
    count: counts.get(id) || 0,
    state: state.doc.layers?.[id] ?? { visible: true, locked: false },
    first: index === 0,
    last: index === order.length - 1,
  }));
});

function layerIdOf(type: string): LayerId {
  if (type === 'imagebg') return 'background';
  if (type === 'pdf') return 'pdf';
  if (type === 'polyroom' || (type === 'rect' && !!state.doc.objects.find(o => o.type === 'rect')?.label)) return 'rooms';
  if (type === 'wall') return 'walls';
  if (type === 'furniture') return 'furniture';
  if (type === 'door' || type === 'window') return 'openings';
  return 'annotations';
}

// ---- 房间统计 ----
const roomStats = computed(() => collectRoomStats(state.doc.objects));

function onProp(key: string, e: Event): void {
  const o = selected.value;
  if (!o) return;
  if (isObjectLocked(state.doc, o)) { toast('对象所在图层已锁定'); return; }
  const inp = e.target as HTMLInputElement | HTMLSelectElement;
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

function onRoomZone(e: Event): void {
  const o = selected.value;
  if (!o || o.type !== 'polyroom') return;
  if (isObjectLocked(state.doc, o)) { toast('房间所在图层已锁定'); return; }
  o.zone = ((e.target as HTMLInputElement).value || '').trim() || '未分区';
  markDirty();
}

function onRoomOpacity(e: Event): void {
  const o = selected.value;
  if (!o || o.type !== 'polyroom') return;
  if (isObjectLocked(state.doc, o)) { toast('房间所在图层已锁定'); return; }
  o.fillOpacity = Math.max(0.04, Math.min(0.45, Number((e.target as HTMLInputElement).value) / 100));
  markDirty();
}

function onRoomInclude(e: Event): void {
  const o = selected.value;
  if (!o || o.type !== 'polyroom') return;
  if (isObjectLocked(state.doc, o)) { toast('房间所在图层已锁定'); return; }
  o.includeInTotal = (e.target as HTMLInputElement).checked;
  markDirty();
}

function selectRoom(id: string): void {
  selectObject(id);
  toast('已定位并选中该房间');
}

function fitAllRooms(): void {
  const rooms = state.doc.objects.filter(o => o.type === 'polyroom');
  if (!rooms.length) { toast('没有房间可定位'); return; }
  selectObject(rooms[0].id);
  toast(`共 ${rooms.length} 个房间；可使用左侧“适合窗口”查看全部`);
}

async function copyRoomStats(): Promise<void> {
  if (!roomStats.value.rooms.length) { toast('没有房间统计可复制'); return; }
  const lines = ['房间,分区,面积(m²),计入统计'];
  for (const r of roomStats.value.rooms) lines.push(`${r.name},${r.zone},${(r.areaMm2 / 1e6).toFixed(2)},${r.included ? '是' : '否'}`);
  for (const z of roomStats.value.zones) lines.push(`小计:${z.zone},,,${(z.areaMm2 / 1e6).toFixed(2)}`);
  lines.push(`总计,,,${(roomStats.value.totalMm2 / 1e6).toFixed(2)}`);
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('房间统计表已复制到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('房间统计表已复制');
  }
}

function onReattach(): void {
  const o = selected.value;
  if (!o || (o.type !== 'door' && o.type !== 'window')) return;
  if (isObjectLocked(state.doc, o)) { toast('门窗所在图层已锁定'); return; }
  if (tryAttach(state.doc.objects, o)) toast('已吸附到墙体');
  else toast('附近 600mm 内没有墙体，保持独立对象');
  markDirty();
}
</script>
