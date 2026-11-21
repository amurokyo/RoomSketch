// RoomSketch 2.0.2 — 家具风格化平面图形描述子（移植 1.0.0 furnBase/furnDetail）
// 返回 SVG 元素描述子，由 ObjectShape.vue 以 <component :is> 渲染。
// 圆形/椭圆家具体系与 1.0.0 完全一致。
import { furnKind, ROUND_KINDS, type FurnKind } from './furniture.ts';

export interface ShapeDesc {
  tag: 'line' | 'rect' | 'circle' | 'ellipse' | 'path';
  attrs: Record<string, string | number>;
}

export function furnBaseShapes(label: string | undefined, w: number, h: number, stroke: string, sw: number, stableKind?: string): ShapeDesc[] {
  const kind = (stableKind as FurnKind | undefined) || furnKind(label);
  if (kind === 'lsofa') return [{ tag: 'path', attrs: { d: `M 0 0 H ${w} V ${h} H ${w * 0.46} V ${h * 0.48} H 0 Z`, fill: '#e9eef5', stroke, 'stroke-width': sw, 'stroke-linejoin': 'round', class: 'main-shape' } }];
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

export function furnDetailShapes(label: string | undefined, w: number, h: number, stroke: string, sw: number, stableKind?: string): ShapeDesc[] {
  const kind: FurnKind = (stableKind as FurnKind | undefined) || furnKind(label);
  const d = Math.max(3, sw * 0.55);
  const L = (x1: number, y1: number, x2: number, y2: number): ShapeDesc => ({ tag: 'line', attrs: { x1, y1, x2, y2, stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const R = (x: number, y: number, ww: number, hh: number, rx = 0): ShapeDesc => ({ tag: 'rect', attrs: { x, y, width: ww, height: hh, rx, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const C = (cx: number, cy: number, r: number): ShapeDesc => ({ tag: 'circle', attrs: { cx, cy, r, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const E = (cx: number, cy: number, rx: number, ry: number): ShapeDesc => ({ tag: 'ellipse', attrs: { cx, cy, rx, ry, fill: 'none', stroke, 'stroke-width': d, 'pointer-events': 'none' } });
  const P = (path: string): ShapeDesc => ({ tag: 'path', attrs: { d: path, fill: 'none', stroke, 'stroke-width': d, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' } });
  switch (kind) {
    case 'bed': { const pw = Math.min(w * 0.28, 500), ph = Math.min(h * 0.22, 320); return [R(w * 0.08, h * 0.05, pw, ph, pw * 0.2), R(w * 0.92 - pw, h * 0.05, pw, ph, pw * 0.2), L(0, h * 0.38, w, h * 0.38), L(w * 0.32, h * 0.38, w * 0.12, h * 0.94)]; }
    case 'sofa': { const ah = Math.min(w * 0.12, 220); return [R(0, 0, w, h * 0.32, 8), R(0, 0, ah, h, 8), R(w - ah, 0, ah, h, 8), L(ah, h * 0.32, w - ah, h * 0.32), L(ah + (w - 2 * ah) / 3, h * 0.32, ah + (w - 2 * ah) / 3, h), L(ah + 2 * (w - 2 * ah) / 3, h * 0.32, ah + 2 * (w - 2 * ah) / 3, h)]; }
    case 'lsofa': { const a = Math.min(w, h) * 0.1; return [R(0, 0, w, h * 0.22, 8), R(0, 0, w * 0.24, h, 8), R(a, h * 0.24, w * 0.42 - a, h * 0.2, 6), R(w * 0.48, h * 0.24, w * 0.48, h * 0.2, 6), R(a, h * 0.5, w * 0.22, h * 0.42, 6), L(w * 0.46, h * 0.48, w, h * 0.48)]; }
    case 'crib': { const out = [R(w * 0.08, h * 0.12, w * 0.84, h * 0.76, 10)]; for (let i = 1; i < 7; i++) out.push(L(w * i / 7, h * 0.12, w * i / 7, h * 0.3)); return out; }
    case 'chair': return [R(w * 0.08, 0, w * 0.84, h * 0.24, 6), R(w * 0.15, h * 0.24, w * 0.7, h * 0.62, 8)];
    case 'wardrobe': return [L(0, h * 0.5, w, h * 0.5), L(w * 0.5, 0, w * 0.5, h), C(w * 0.44, h * 0.5, Math.min(40, w * 0.05)), C(w * 0.56, h * 0.5, Math.min(40, w * 0.05))];
    case 'bookshelf': { const out = [L(0, h * 0.5, w, h * 0.5)]; const n = Math.max(2, Math.round(w / 350)); for (let i = 1; i < n; i++) out.push(L(w * i / n, 0, w * i / n, h)); return out; }
    case 'shoecabinet': return [L(0, h * 0.33, w, h * 0.33), L(0, h * 0.66, w, h * 0.66), L(w * 0.5, 0, w * 0.5, h)];
    case 'rack': { const out = [R(w * 0.1, h * 0.04, w * 0.8, h * 0.92, 5)]; const n = Math.max(3, Math.round(h / 180)); for (let i = 1; i < n; i++) out.push(L(w * 0.16, h * i / n, w * 0.84, h * i / n)); return out; }
    case 'cabinet': return [L(w * 0.33, 0, w * 0.33, h), L(w * 0.66, 0, w * 0.66, h), C(w * 0.3, h * 0.82, Math.min(28, w * 0.04))];
    case 'toilet': return [R(w * 0.12, -h * 0.05, w * 0.76, h * 0.24, 10), E(w * 0.5, h * 0.58, w * 0.36, h * 0.3)];
    case 'bath': return [R(w * 0.07, h * 0.08, w * 0.86, h * 0.84, Math.min(w, h) * 0.18), C(w * 0.82, h * 0.82, Math.min(w, h) * 0.05)];
    case 'sink': return [E(w * 0.5, h * 0.56, w * 0.32, h * 0.32), C(w * 0.5, h * 0.14, Math.min(28, w * 0.06))];
    case 'kitchensink': return [R(w * 0.08, h * 0.12, w * 0.84, h * 0.76, 12), E(w * 0.34, h * 0.55, w * 0.2, h * 0.25), E(w * 0.7, h * 0.55, w * 0.16, h * 0.25), C(w * 0.52, h * 0.2, Math.min(24, w * 0.04))];
    case 'vanity': return [L(w * 0.5, 0, w * 0.5, h), E(w * 0.5, h * 0.48, w * 0.28, h * 0.28), C(w * 0.5, h * 0.1, Math.min(24, w * 0.04))];
    case 'urinal': return [E(w * 0.5, h * 0.52, w * 0.34, h * 0.38), P(`M ${w * 0.2} ${h * 0.12} Q ${w * 0.5} ${-h * 0.05} ${w * 0.8} ${h * 0.12}`)];
    case 'squat': return [E(w * 0.5, h * 0.5, w * 0.28, h * 0.38), L(w * 0.12, h * 0.25, w * 0.28, h * 0.25), L(w * 0.72, h * 0.25, w * 0.88, h * 0.25)];
    case 'shower': return [L(0, 0, w, h), L(w, 0, 0, h), C(w * 0.5, h * 0.5, Math.min(w, h) * 0.08)];
    case 'fridge': return [L(0, h * 0.34, w, h * 0.34), R(w * 0.32, h * 0.07, w * 0.09, h * 0.2, 6), R(w * 0.32, h * 0.42, w * 0.09, h * 0.28, 6)];
    case 'stove': { const r = Math.min(w, h) * 0.13; return [C(w * 0.28, h * 0.3, r), C(w * 0.72, h * 0.3, r), C(w * 0.28, h * 0.7, r), C(w * 0.72, h * 0.7, r)]; }
    case 'washer': return [C(w * 0.5, h * 0.56, Math.min(w, h) * 0.3), C(w * 0.5, h * 0.56, Math.min(w, h) * 0.18), L(w * 0.14, h * 0.12, w * 0.86, h * 0.12)];
    case 'dishwasher': return [L(w * 0.12, h * 0.18, w * 0.88, h * 0.18), R(w * 0.32, h * 0.06, w * 0.36, h * 0.08, 4), C(w * 0.5, h * 0.58, Math.min(w, h) * 0.18)];
    case 'oven': return [R(w * 0.12, h * 0.24, w * 0.76, h * 0.62, 8), L(w * 0.18, h * 0.34, w * 0.82, h * 0.34), C(w * 0.25, h * 0.12, Math.min(22, w * 0.04)), C(w * 0.75, h * 0.12, Math.min(22, w * 0.04))];
    case 'microwave': return [R(w * 0.1, h * 0.18, w * 0.58, h * 0.64, 6), R(w * 0.76, h * 0.18, w * 0.14, h * 0.64, 4), C(w * 0.83, h * 0.32, Math.min(18, w * 0.03))];
    case 'island': return [R(w * 0.05, h * 0.08, w * 0.9, h * 0.84, 8), L(w * 0.33, h * 0.1, w * 0.33, h * 0.9), L(w * 0.66, h * 0.1, w * 0.66, h * 0.9)];
    case 'printer': return [R(w * 0.16, h * 0.08, w * 0.68, h * 0.28, 4), R(w * 0.12, h * 0.58, w * 0.76, h * 0.3, 4), L(w * 0.25, h * 0.7, w * 0.75, h * 0.7)];
    case 'cooler': return [E(w * 0.5, h * 0.18, w * 0.28, h * 0.16), R(w * 0.18, h * 0.36, w * 0.64, h * 0.56, 8), C(w * 0.38, h * 0.52, Math.min(18, w * 0.04)), C(w * 0.62, h * 0.52, Math.min(18, w * 0.04))];
    case 'stairs': { const n = Math.max(3, Math.round(h / (Math.min(w, h) * 0.3))); const out: ShapeDesc[] = []; for (let i = 1; i < n; i++) out.push(L(0, h * i / n, w, h * i / n)); out.push(L(w * 0.5, 0, w * 0.5, h)); return out; }
    case 'plant': { const r = Math.min(w, h) * 0.32; return [C(w * 0.5, h * 0.5, r), L(w * 0.5, h * 0.5 - r * 0.72, w * 0.5, h * 0.5 + r * 0.72), L(w * 0.5 - r * 0.72, h * 0.5, w * 0.5 + r * 0.72, h * 0.5)]; }
    case 'carpet': return [{ tag: 'rect', attrs: { x: sw, y: sw, width: Math.max(1, w - 2 * sw), height: Math.max(1, h - 2 * sw), rx: 10, fill: 'none', stroke, 'stroke-width': d, 'stroke-dasharray': '26 18', 'pointer-events': 'none' } }];
    case 'screen': return [L(0, h * 0.5, w, h * 0.5)];
    case 'table': { const ix = Math.min(w, h) * 0.1; return [R(ix, ix, w - 2 * ix, h - 2 * ix, 8)]; }
    case 'desk': return [R(w * 0.3, h * 0.08, w * 0.4, h * 0.34, 5), L(w * 0.5, h * 0.42, w * 0.5, h * 0.58), R(w * 0.34, h * 0.58, w * 0.32, h * 0.08, 3), R(w * 0.7, h * 0.52, w * 0.2, h * 0.3, 4)];
    case 'workstation': return [L(w * 0.5, 0, w * 0.5, h), R(w * 0.2, h * 0.08, w * 0.2, h * 0.25, 4), R(w * 0.6, h * 0.08, w * 0.2, h * 0.25, 4), R(w * 0.18, h * 0.56, w * 0.25, h * 0.3, 6), R(w * 0.57, h * 0.56, w * 0.25, h * 0.3, 6)];
    case 'bench': return [R(w * 0.04, h * 0.15, w * 0.92, h * 0.7, 8), L(w * 0.15, h * 0.85, w * 0.15, h), L(w * 0.85, h * 0.85, w * 0.85, h)];
    case 'firehydrant': return [R(w * 0.08, h * 0.08, w * 0.84, h * 0.84, 6), C(w * 0.5, h * 0.48, Math.min(w, h) * 0.22), P(`M ${w * 0.36} ${h * 0.48} H ${w * 0.64} M ${w * 0.5} ${h * 0.34} V ${h * 0.62}`)];
    case 'extinguisher': return [E(w * 0.5, h * 0.56, w * 0.26, h * 0.32), R(w * 0.38, h * 0.08, w * 0.24, h * 0.16, 4), P(`M ${w * 0.62} ${h * 0.16} Q ${w * 0.9} ${h * 0.2} ${w * 0.82} ${h * 0.54}`)];
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
