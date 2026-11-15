// RoomSketch 2.0.1 — 家具风格化平面图形描述子（移植 1.0.0 furnBase/furnDetail）
// 返回 SVG 元素描述子，由 ObjectShape.vue 以 <component :is> 渲染。
// 圆形/椭圆家具体系与 1.0.0 完全一致。
import { furnKind, ROUND_KINDS, type FurnKind } from './furniture.ts';

export interface ShapeDesc {
  tag: 'line' | 'rect' | 'circle' | 'ellipse' | 'path';
  attrs: Record<string, string | number>;
}

export function furnBaseShapes(label: string | undefined, w: number, h: number, stroke: string, sw: number): ShapeDesc[] {
  const kind = furnKind(label);
  if (ROUND_KINDS.includes(kind)) {
    return [{
      tag: 'ellipse',
      attrs: { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, fill: kind === 'roundcarpet' ? 'none' : '#e9eef5', stroke, 'stroke-width': sw, class: 'main-shape' },
    }];
  }
  return [{
    tag: 'rect',
    attrs: { x: 0, y: 0, width: w, height: h, rx: 8, fill: '#e9eef5', stroke, 'stroke-width': sw, class: 'main-shape' },
  }];
}

export function furnDetailShapes(label: string | undefined, w: number, h: number, stroke: string, sw: number): ShapeDesc[] {
  const kind: FurnKind = furnKind(label);
  const d = Math.max(3, sw * 0.55);
  const L = (x1: number, y1: number, x2: number, y2: number): ShapeDesc => ({ tag: 'line', attrs: { x1, y1, x2, y2, stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const R = (x: number, y: number, ww: number, hh: number, rx = 0): ShapeDesc => ({ tag: 'rect', attrs: { x, y, width: ww, height: hh, rx, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const C = (cx: number, cy: number, r: number): ShapeDesc => ({ tag: 'circle', attrs: { cx, cy, r, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const E = (cx: number, cy: number, rx: number, ry: number): ShapeDesc => ({ tag: 'ellipse', attrs: { cx, cy, rx, ry, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  switch (kind) {
    case 'bed': { const pw = Math.min(w * 0.28, 500), ph = Math.min(h * 0.22, 320); return [R(w * 0.08, h * 0.05, pw, ph, pw * 0.2), R(w * 0.92 - pw, h * 0.05, pw, ph, pw * 0.2), L(0, h * 0.38, w, h * 0.38), L(w * 0.32, h * 0.38, w * 0.12, h * 0.94)]; }
    case 'sofa': { const ah = Math.min(w * 0.12, 220); return [R(0, 0, w, h * 0.32, 8), R(0, 0, ah, h, 8), R(w - ah, 0, ah, h, 8), L(ah, h * 0.32, w - ah, h * 0.32), L(ah + (w - 2 * ah) / 3, h * 0.32, ah + (w - 2 * ah) / 3, h), L(ah + 2 * (w - 2 * ah) / 3, h * 0.32, ah + 2 * (w - 2 * ah) / 3, h)]; }
    case 'chair': return [R(w * 0.08, 0, w * 0.84, h * 0.24, 6), R(w * 0.15, h * 0.24, w * 0.7, h * 0.62, 8)];
    case 'wardrobe': return [L(0, h * 0.5, w, h * 0.5), L(w * 0.5, 0, w * 0.5, h), C(w * 0.44, h * 0.5, Math.min(40, w * 0.05)), C(w * 0.56, h * 0.5, Math.min(40, w * 0.05))];
    case 'cabinet': return [L(w * 0.33, 0, w * 0.33, h), L(w * 0.66, 0, w * 0.66, h), C(w * 0.3, h * 0.82, Math.min(28, w * 0.04))];
    case 'toilet': return [R(w * 0.12, -h * 0.05, w * 0.76, h * 0.24, 10), E(w * 0.5, h * 0.58, w * 0.36, h * 0.3)];
    case 'bath': return [R(w * 0.07, h * 0.08, w * 0.86, h * 0.84, Math.min(w, h) * 0.18), C(w * 0.82, h * 0.82, Math.min(w, h) * 0.05)];
    case 'sink': return [E(w * 0.5, h * 0.56, w * 0.32, h * 0.32), C(w * 0.5, h * 0.14, Math.min(28, w * 0.06))];
    case 'shower': return [L(0, 0, w, h), L(w, 0, 0, h), C(w * 0.5, h * 0.5, Math.min(w, h) * 0.08)];
    case 'fridge': return [L(0, h * 0.34, w, h * 0.34), R(w * 0.32, h * 0.07, w * 0.09, h * 0.2, 6), R(w * 0.32, h * 0.42, w * 0.09, h * 0.28, 6)];
    case 'stove': { const r = Math.min(w, h) * 0.13; return [C(w * 0.28, h * 0.3, r), C(w * 0.72, h * 0.3, r), C(w * 0.28, h * 0.7, r), C(w * 0.72, h * 0.7, r)]; }
    case 'washer': return [C(w * 0.5, h * 0.56, Math.min(w, h) * 0.3), C(w * 0.5, h * 0.56, Math.min(w, h) * 0.18), L(w * 0.14, h * 0.12, w * 0.86, h * 0.12)];
    case 'stairs': { const n = Math.max(3, Math.round(h / (Math.min(w, h) * 0.3))); const out: ShapeDesc[] = []; for (let i = 1; i < n; i++) out.push(L(0, h * i / n, w, h * i / n)); out.push(L(w * 0.5, 0, w * 0.5, h)); return out; }
    case 'plant': { const r = Math.min(w, h) * 0.32; return [C(w * 0.5, h * 0.5, r), L(w * 0.5, h * 0.5 - r * 0.72, w * 0.5, h * 0.5 + r * 0.72), L(w * 0.5 - r * 0.72, h * 0.5, w * 0.5 + r * 0.72, h * 0.5)]; }
    case 'carpet': return [{ tag: 'rect', attrs: { x: sw, y: sw, width: Math.max(1, w - 2 * sw), height: Math.max(1, h - 2 * sw), rx: 10, fill: 'none', stroke, 'stroke-width': d, 'stroke-dasharray': '26 18', 'pointer-events': 'none' } }];
    case 'screen': return [L(0, h * 0.5, w, h * 0.5)];
    case 'table': { const ix = Math.min(w, h) * 0.1; return [R(ix, ix, w - 2 * ix, h - 2 * ix, 8)]; }
    case 'roundtable': return [C(w / 2, h / 2, Math.min(w, h) * 0.12), E(w / 2, h / 2, w * 0.34, h * 0.34)];
    case 'roundbed': return [C(w * 0.34, h * 0.30, Math.min(w, h) * 0.13), C(w * 0.66, h * 0.30, Math.min(w, h) * 0.13), E(w / 2, h * 0.62, w * 0.34, h * 0.24)];
    case 'roundstool': return [C(w / 2, h / 2, Math.min(w, h) * 0.32)];
    case 'roundcoffee': return [C(w / 2, h / 2, Math.min(w, h) * 0.36)];
    case 'roundbath': return [C(w / 2, h / 2, Math.min(w, h) * 0.36), C(w / 2, h / 2, Math.min(w, h) * 0.05)];
    case 'roundsink': return [E(w / 2, h / 2, w * 0.30, h * 0.30), C(w / 2, h * 0.14, Math.min(26, w * 0.06))];
    case 'roundcarpet': return [{ tag: 'circle', attrs: { cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.36, fill: 'none', stroke, 'stroke-width': d, 'stroke-dasharray': '26 18', 'pointer-events': 'none' } }];
    default: return [];
  }
}
