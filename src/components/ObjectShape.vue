<!-- RoomSketch 2.0.0 — 单个对象渲染（移植 1.0.0 renderObj） -->
<template>
  <g :transform="`translate(${o.x || 0} ${o.y || 0})${o.rotation ? ` rotate(${o.rotation})` : ''}`" :data-id="o.id" :data-type="o.type">
    <!-- 墙体 -->
    <polyline v-if="o.type === 'wall'" :points="pts(o.points)" fill="none" :stroke="stroke" :stroke-width="o.wallWidth || 120" stroke-linecap="square" stroke-linejoin="miter" class="main-shape" />
    <!-- 折线 / PDF 线条 / 辅助线 -->
    <polyline v-else-if="o.type === 'polyline' || o.type === 'pdf' || o.type === 'line'" :points="pts(o.points)" fill="none" :stroke="stroke" :stroke-width="o.stroke ?? (o.type === 'pdf' ? 0.25 : 8)" stroke-linecap="round" stroke-linejoin="round" class="main-shape" :fill="o.closed ? (o.fill || 'none') : 'none'" />
    <!-- 房间 -->
    <template v-else-if="o.type === 'polyroom'">
      <polygon :points="pts(o.points)" fill="#2e6ed8" fill-opacity="0.10" :stroke="stroke" :stroke-width="sw ?? 10" stroke-linejoin="round" class="main-shape" />
      <text :x="centroid[0]" :y="centroid[1]" text-anchor="middle" :font-size="Math.max(80, Math.sqrt(polyArea(o.points)) / 5)" fill="#2e5fb0" pointer-events="none">{{ o.label || `≈ ${(polyArea(o.points) / 1e6).toFixed(1)} m²` }}</text>
    </template>
    <!-- 图片底图 -->
    <image v-else-if="o.type === 'imagebg'" x="0" y="0" :width="o.w" :height="o.h" preserveAspectRatio="none" :opacity="o.opacity ?? 1" class="main-shape" :href="o.src" />
    <!-- 矩形 -->
    <rect v-else-if="o.type === 'rect'" x="0" y="0" :width="o.w" :height="o.h" :fill="o.fill || 'none'" :stroke="stroke" :stroke-width="sw" class="main-shape" />
    <!-- 家具 -->
    <template v-else-if="o.type === 'furniture'">
      <component :is="s.tag" v-for="(s, i) in furnBase" :key="'b' + i" v-bind="s.attrs" />
      <component :is="s.tag" v-for="(s, i) in furnDetail" :key="'d' + i" v-bind="s.attrs" />
      <text :x="o.w / 2" :y="o.h / 2 + 5" text-anchor="middle" :font-size="Math.min(95, Math.max(32, Math.min(o.w, o.h) / 5))" fill="#42546a" paint-order="stroke" stroke="#f2f6fb" stroke-width="14" pointer-events="none">{{ o.label || '家具' }}</text>
    </template>
    <!-- 门 -->
    <template v-else-if="o.type === 'door'">
      <path :d="`M 0 0 L 0 ${dir * o.w} M ${o.w} 0 A ${o.w} ${o.w} 0 0 ${dir === 1 ? 1 : 0} 0 ${dir * o.w}`" fill="none" :stroke="stroke" :stroke-width="sw" stroke-linecap="round" class="main-shape" />
      <circle cx="0" cy="0" :r="Math.max(80, sw * 2)" :fill="stroke" pointer-events="none" />
      <rect :x="-40" :y="Math.min(0, dir * o.w) - 40" :width="o.w + 80" :height="Math.abs(dir * o.w) + 80" fill="#000" fill-opacity="0" pointer-events="all" />
    </template>
    <!-- 窗 -->
    <template v-else-if="o.type === 'window'">
      <g class="main-shape">
        <line x1="0" y1="-18" :x2="o.w" y2="-18" :stroke="stroke" :stroke-width="sw" />
        <line x1="0" y1="18" :x2="o.w" y2="18" :stroke="stroke" :stroke-width="sw" />
        <line x1="0" y1="-28" x2="0" y2="28" :stroke="stroke" :stroke-width="sw / 2" />
        <line :x1="o.w" y1="-28" :x2="o.w" y2="28" :stroke="stroke" :stroke-width="sw / 2" />
      </g>
      <rect :x="-40" :y="-70" :width="o.w + 80" height="140" fill="#000" fill-opacity="0" pointer-events="all" />
    </template>
    <!-- 尺寸标注 -->
    <template v-else-if="o.type === 'dimension'">
      <g class="main-shape">
        <line x1="0" y1="0" :x2="len" y2="0" :stroke="stroke" :stroke-width="8" />
        <line x1="0" y1="-30" x2="0" y2="30" :stroke="stroke" :stroke-width="8" />
        <line :x1="len" y1="-30" :x2="len" y2="30" :stroke="stroke" :stroke-width="8" />
        <path :d="`M 0 0 l 45 -18 l 0 36 z M ${len} 0 l -45 -18 l 0 36 z`" :fill="stroke" />
        <text :x="len / 2" y="-45" text-anchor="middle" font-size="90" :fill="stroke" paint-order="stroke" stroke="#fbfcfe" stroke-width="14">{{ o.label || `${Math.round(len)} mm` }}</text>
      </g>
    </template>
    <!-- 文字标注 -->
    <text v-else-if="o.type === 'label'" x="0" y="0" :font-size="o.fontSize || 120" :fill="stroke" class="main-shape">{{ o.label || '文字标注' }}</text>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RsObject } from '../model/types.ts';
import { polyArea, polyCentroid } from '../model/geometry.ts';
import { furnBaseShapes, furnDetailShapes } from '../model/furnitureRender.ts';

const props = defineProps<{ o: RsObject }>();
const o = props.o;
const stroke = computed(() => o.strokeColor || (o.type === 'pdf' ? '#65758a' : '#27384a'));
const sw = computed(() => o.stroke || 12);
const dir = computed(() => (o.type === 'door' ? (o.dir || 1) : 1));
const len = computed(() => (o.type === 'dimension' ? (o.length || o.w || 0) : 0));
const centroid = computed(() => (o.type === 'polyroom' ? polyCentroid(o.points) : [0, 0]));
const furnBase = computed(() => (o.type === 'furniture' ? furnBaseShapes(o.label, o.w, o.h, stroke.value, sw.value) : []));
const furnDetail = computed(() => (o.type === 'furniture' ? furnDetailShapes(o.label, o.w, o.h, stroke.value, sw.value) : []));
function pts(points: [number, number][] | undefined): string {
  return (points || []).map(p => p.join(',')).join(' ');
}
</script>
