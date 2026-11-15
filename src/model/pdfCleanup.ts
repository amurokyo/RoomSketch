// RoomSketch 2.0.1 — PDF 标注清理检测（移植 1.0.0 detectPdfMarkup）
// 按颜色、主体连通区域和小型文字簇识别标注；只做检测与统计，删除由调用方
// 在确认框 + 快照后执行（可 Ctrl+Z 撤销）。
import type { RsObject } from './types.ts';

interface M {
  o: RsObject; id: string; x: number; y: number; r: number; b: number;
  w: number; h: number; maxDim: number; length: number; color: string;
  neutral: boolean; pointCount: number;
}

export interface MarkupResult {
  ids: string[];
  count: number;
  details: { removedBlack: number; removedFrame: number; removedOutside: number; removedGlyph: number; coreFound: boolean; neutralIsMarkup: boolean };
}

function pdfMetrics(o: RsObject): M | null {
  const pts = (o as { points?: [number, number][] }).points || [];
  if (pts.length < 2) return null;
  const xs = pts.map(p => p[0] + (o.x || 0)), ys = pts.map(p => p[1] + (o.y || 0));
  const x = Math.min(...xs), y = Math.min(...ys), r = Math.max(...xs), b = Math.max(...ys);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const color = String((o as { pdfStrokeColor?: string }).pdfStrokeColor || o.strokeColor || '#65758a').toLowerCase();
  const rgb = color.match(/^#([0-9a-f]{6})$/i);
  let neutral = false;
  if (rgb) {
    const n = rgb[1];
    const cr = parseInt(n.slice(0, 2), 16), cg = parseInt(n.slice(2, 4), 16), cb = parseInt(n.slice(4, 6), 16);
    neutral = Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 28 && Math.max(cr, cg, cb) < 90;
  }
  return { o, id: o.id, x, y, r, b, w: r - x, h: b - y, maxDim: Math.max(r - x, b - y), length, color, neutral, pointCount: pts.length };
}

interface Comp { items: M[]; x: number; y: number; r: number; b: number; length: number; score: number }

function pdfComponents(items: M[], gap: number): Comp[] {
  if (!items.length) return [];
  const parent = items.map((_, i) => i), rank = items.map(() => 0);
  const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number): void => {
    a = root(a); b = root(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };
  const boxGap = (a: M, b: M): number => {
    const dx = Math.max(0, a.x - b.r, b.x - a.r), dy = Math.max(0, a.y - b.b, b.y - a.b);
    return Math.hypot(dx, dy);
  };
  const cell = 12, grid = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const a = items[i], gx = Math.floor((a.x + a.r) / 2 / cell), gy = Math.floor((a.y + a.b) / 2 / cell);
    for (let yy = gy - 1; yy <= gy + 1; yy++) for (let xx = gx - 1; xx <= gx + 1; xx++) {
      for (const j of grid.get(`${xx},${yy}`) || []) if (boxGap(a, items[j]) <= gap) join(i, j);
    }
    const key = `${gx},${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(i);
  }
  const groups = new Map<number, M[]>();
  for (let i = 0; i < items.length; i++) {
    const k = root(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(items[i]);
  }
  return [...groups.values()].map(g => ({
    items: g, x: Math.min(...g.map(a => a.x)), y: Math.min(...g.map(a => a.y)),
    r: Math.max(...g.map(a => a.r)), b: Math.max(...g.map(a => a.b)),
    length: g.reduce((s, a) => s + a.length, 0),
    score: g.length + g.reduce((s, a) => s + a.length, 0) * 0.025,
  }));
}

export function detectPdfMarkup(objects: RsObject[], pdfPageSize: { w: number; h: number } | null): MarkupResult {
  const source = objects.filter(o => o.type === 'pdf' && o.pdfOrigin && Array.isArray((o as { points?: unknown }).points));
  const empty: MarkupResult = { ids: [], count: 0, details: { removedBlack: 0, removedFrame: 0, removedOutside: 0, removedGlyph: 0, coreFound: false, neutralIsMarkup: false } };
  if (!source.length) return empty;
  const m = source.map(pdfMetrics).filter((x): x is M => !!x);
  const pageW = pdfPageSize?.w || 0, pageH = pdfPageSize?.h || 0;
  const remove = new Set<string>();
  const frames = m.filter(a => pageW && pageH && a.w > pageW * 0.88 && a.h > pageH * 0.88);
  for (const a of frames) remove.add(a.id);
  const body = m.filter(a => !remove.has(a.id));
  const chromatic = body.filter(a => !a.neutral && a.maxDim > 0.12);
  const comps = pdfComponents(chromatic, 2.0).sort((a, b) => b.score - a.score);
  const core = comps[0] || null;
  const coreBox = core ? { x: core.x, y: core.y, r: core.r, b: core.b } : null;
  const byColor = new Map<string, { longLength: number; longCount: number; totalLength: number }>();
  for (const a of body) {
    const s = byColor.get(a.color) || { longLength: 0, longCount: 0, totalLength: 0 };
    s.totalLength += a.length;
    if (a.maxDim >= 20) { s.longLength += a.length; s.longCount++; }
    byColor.set(a.color, s);
  }
  let bestColorScore = 0;
  for (const [c, s] of byColor) {
    const exemplar = body.find(a => a.color === c);
    if (exemplar && !exemplar.neutral) bestColorScore = Math.max(bestColorScore, s.longLength);
  }
  const neutralEntries = [...byColor.entries()].filter(([c]) => body.find(x => x.color === c)?.neutral);
  let neutralLong = 0;
  for (const [, s] of neutralEntries) neutralLong += s.longLength;
  const hasClearColorStructure = !!core && core.items.length >= 20 && bestColorScore > 250;
  const neutralIsMarkup = hasClearColorStructure && neutralLong < bestColorScore * 0.42;
  let removedBlack = 0, removedFrame = frames.length, removedOutside = 0, removedGlyph = 0;
  if (neutralIsMarkup) {
    for (const a of body) if (a.neutral) { remove.add(a.id); removedBlack++; }
  }
  if (coreBox) {
    const outsideComps = pdfComponents(chromatic.filter(a => !remove.has(a.id)), 2.0);
    for (const g of outsideComps) {
      const outside = g.r < coreBox.x - 0.7 || g.x > coreBox.r + 0.7 || g.b < coreBox.y - 0.7 || g.y > coreBox.b + 0.7;
      if (outside) for (const a of g.items) if (!remove.has(a.id)) { remove.add(a.id); removedOutside++; }
    }
  }
  const glyphCandidates = body.filter(a => !a.neutral && !remove.has(a.id) && a.maxDim <= 6.0 && a.maxDim >= 0.08 && a.length <= 8.5);
  const glyphGroups = pdfComponents(glyphCandidates, 0.55);
  for (const g of glyphGroups) {
    const w = g.r - g.x, h = g.b - g.y;
    if (g.items.length >= 8 && w <= 6.2 && h <= 6.2 && g.length >= 7.5 && g.length <= 90) {
      for (const a of g.items) if (!remove.has(a.id)) { remove.add(a.id); removedGlyph++; }
    }
  }
  const ids = [...remove];
  return { ids, count: ids.length, details: { removedBlack, removedFrame, removedOutside, removedGlyph, coreFound: !!core, neutralIsMarkup } };
}
