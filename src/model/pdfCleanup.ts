// RoomSketch 2.0.2 — PDF 标注清理检测
// 在原有颜色 / 连通区域 / 文字簇算法上增加：逐页检测、三级强度、可调字形阈值、
// 与主结构相连的小路径抢救。所有结果都可先高亮预览，再由调用方快照删除。
import type { RsObject } from './types.ts';

interface M {
  o: RsObject; id: string; x: number; y: number; r: number; b: number;
  w: number; h: number; maxDim: number; length: number; color: string;
  neutral: boolean; pointCount: number;
}

export type PdfCleanupMode = 'conservative' | 'balanced' | 'aggressive';
export interface PdfCleanupOptions {
  mode: PdfCleanupMode;
  /** 小型字形路径的最大边长（mm） */
  glyphSize: number;
  removeNeutral: boolean;
  removeFrames: boolean;
  removeOutside: boolean;
  preserveConnected: boolean;
}

export const DEFAULT_PDF_CLEANUP: PdfCleanupOptions = {
  mode: 'balanced', glyphSize: 6, removeNeutral: true,
  removeFrames: true, removeOutside: false, preserveConnected: true,
};

export interface MarkupResult {
  ids: string[];
  count: number;
  details: {
    removedBlack: number; removedFrame: number; removedOutside: number; removedGlyph: number;
    rescuedSmall: number; coreFound: boolean; neutralIsMarkup: boolean;
  };
}

const EMPTY_DETAILS = () => ({
  removedBlack: 0, removedFrame: 0, removedOutside: 0, removedGlyph: 0,
  rescuedSmall: 0, coreFound: false, neutralIsMarkup: false,
});

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
    neutral = Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 32 && Math.max(cr, cg, cb) < 200;
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
  const cell = Math.max(4, gap * 3), grid = new Map<string, number[]>();
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

/** 用空间网格判断小路径端点是否接到主结构，避免全量两两扫描。 */
function connectedRescue(candidates: M[], major: M[], remove: Set<string>, tolerance: number): Set<string> {
  const rescued = new Set<string>();
  if (!candidates.length || !major.length) return rescued;
  const cell = Math.max(1, tolerance), grid = new Map<string, [number, number][]>();
  const put = (p: [number, number]): void => {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  };
  for (const a of major) {
    if (remove.has(a.id)) continue;
    const pts = (a.o as { points?: [number, number][] }).points || [];
    for (const p of pts) put([p[0] + (a.o.x || 0), p[1] + (a.o.y || 0)]);
  }
  for (const a of candidates) {
    const pts = (a.o as { points?: [number, number][] }).points || [];
    const ends = [pts[0], pts[pts.length - 1]].filter(Boolean).map(p => [p[0] + (a.o.x || 0), p[1] + (a.o.y || 0)] as [number, number]);
    let found = false;
    for (const p of ends) {
      const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
      for (let yy = gy - 1; yy <= gy + 1 && !found; yy++) for (let xx = gx - 1; xx <= gx + 1 && !found; xx++) {
        for (const q of grid.get(`${xx},${yy}`) || []) {
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance) { found = true; break; }
        }
      }
      if (found) break;
    }
    if (found) rescued.add(a.id);
  }
  return rescued;
}

function detectPage(source: RsObject[], pageSize: { w: number; h: number } | null, options: PdfCleanupOptions): MarkupResult {
  const m = source.map(pdfMetrics).filter((x): x is M => !!x);
  const details = EMPTY_DETAILS();
  if (!m.length) return { ids: [], count: 0, details };
  const pageW = pageSize?.w || 0, pageH = pageSize?.h || 0;
  const remove = new Set<string>();
  const frames = options.removeFrames ? m.filter(a => pageW && pageH && a.w > pageW * 0.88 && a.h > pageH * 0.88) : [];
  for (const a of frames) remove.add(a.id);
  details.removedFrame = frames.length;
  const body = m.filter(a => !remove.has(a.id));
  const chromatic = body.filter(a => !a.neutral && a.maxDim > 0.12);
  const comps = pdfComponents(chromatic, 2.0).sort((a, b) => b.score - a.score);
  const core = comps[0] || null;
  details.coreFound = !!core;
  const coreBox = core ? { x: core.x, y: core.y, r: core.r, b: core.b } : null;
  const byColor = new Map<string, { longLength: number; longCount: number; totalLength: number; total: number; tiny: number }>();
  for (const a of body) {
    const s = byColor.get(a.color) || { longLength: 0, longCount: 0, totalLength: 0, total: 0, tiny: 0 };
    s.totalLength += a.length; s.total++;
    if (a.maxDim >= 20) { s.longLength += a.length; s.longCount++; }
    if (a.maxDim <= options.glyphSize * 1.8) s.tiny++;
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
  details.neutralIsMarkup = neutralIsMarkup;

  const major = body.filter(a => (a.maxDim >= Math.max(16, options.glyphSize * 3) || a.length >= 30) && !a.neutral);
  // 参考原版规则：一旦中性色被判定为文字层，整色删除，不再因为端点
  // 碰到墙体就抢救；连接抢救只用于彩色结构的小路径。
  const neutralRescued = (options.preserveConnected && !neutralIsMarkup)
    ? connectedRescue(body.filter(a => a.neutral), major, remove, Math.max(1.2, options.glyphSize * 0.3))
    : new Set<string>();
  const canRescue = (a: M): boolean => neutralRescued.has(a.id);
  if (options.removeNeutral && neutralIsMarkup) {
    for (const a of body) {
      if (!a.neutral) continue;
      const stats = byColor.get(a.color);
      const tinyRatio = stats?.total ? stats.tiny / stats.total : 0;
      const pts = (a.o as { points?: [number, number][] }).points || [];
      const dx = Math.abs(pts[pts.length - 1][0] - pts[0][0]), dy = Math.abs(pts[pts.length - 1][1] - pts[0][1]);
      const diagonalLeader = a.pointCount <= 3 && a.maxDim >= 10 && dx > 3 && dy > 3 && Math.abs(dx - dy) > 1.5;
      const threshold = options.mode === 'conservative' ? 0.9 : 0.72;
      const smallText = tinyRatio >= threshold && a.maxDim <= options.glyphSize * (options.mode === 'conservative' ? 1.2 : 1.8);
      // 原版规则：中性色一旦判定为文字层，均衡/深度模式整色删除；
      // 保守模式仍只删小型文字和斜引线，避免误删黑色结构。
      const shouldRemove = options.mode === 'aggressive'
        || (neutralIsMarkup && options.mode === 'balanced')
        || smallText
        || (options.mode !== 'conservative' && diagonalLeader);
      if (shouldRemove && !canRescue(a)) { remove.add(a.id); details.removedBlack++; }
      else if (shouldRemove) details.rescuedSmall++;
    }
  }
  if (coreBox && options.removeOutside) {
    const outsideComps = pdfComponents(chromatic.filter(a => !remove.has(a.id)), 2.0);
    for (const g of outsideComps) {
      const outside = g.r < coreBox.x - 0.7 || g.x > coreBox.r + 0.7 || g.b < coreBox.y - 0.7 || g.y > coreBox.b + 0.7;
      if (outside && (options.mode !== 'conservative' || g.items.length <= 12)) {
        for (const a of g.items) if (!remove.has(a.id)) { remove.add(a.id); details.removedOutside++; }
      }
    }
  }
  const glyphCandidates = body.filter(a => !a.neutral && !remove.has(a.id) && a.maxDim <= options.glyphSize && a.maxDim >= 0.08 && a.length <= options.glyphSize * 1.45);
  const glyphGroups = pdfComponents(glyphCandidates, Math.max(0.4, options.glyphSize * 0.09));
  const minItems = options.mode === 'aggressive' ? 5 : options.mode === 'conservative' ? 10 : 8;
  for (const g of glyphGroups) {
    const w = g.r - g.x, h = g.b - g.y;
    if (g.items.length >= minItems && w <= options.glyphSize * 1.05 && h <= options.glyphSize * 1.05 && g.length >= options.glyphSize * 1.25 && g.length <= options.glyphSize * 15) {
      const rescued = options.preserveConnected ? connectedRescue(g.items, major, remove, Math.max(1.2, options.glyphSize * 0.3)) : new Set<string>();
      for (const a of g.items) {
        if (rescued.has(a.id)) { details.rescuedSmall++; continue; }
        if (!remove.has(a.id)) { remove.add(a.id); details.removedGlyph++; }
      }
    }
  }
  const ids = [...remove];
  return { ids, count: ids.length, details };
}

export function detectPdfMarkup(
  objects: RsObject[], pdfPageSize: { w: number; h: number } | null,
  options: Partial<PdfCleanupOptions> = {}, pdfPageSizes: Record<string, { w: number; h: number }> = {},
): MarkupResult {
  const opts = { ...DEFAULT_PDF_CLEANUP, ...options, glyphSize: Math.max(2, Math.min(18, options.glyphSize ?? DEFAULT_PDF_CLEANUP.glyphSize)) };
  const source = objects.filter(o => o.type === 'pdf' && o.pdfOrigin && Array.isArray((o as { points?: unknown }).points));
  const total: MarkupResult = { ids: [], count: 0, details: EMPTY_DETAILS() };
  if (!source.length) return total;
  const groups = new Map<number, RsObject[]>();
  for (const o of source) {
    const page = Math.max(1, Math.floor((o as { pdfPage?: number }).pdfPage || 1));
    if (!groups.has(page)) groups.set(page, []);
    groups.get(page)!.push(o);
  }
  for (const [page, items] of groups) {
    const r = detectPage(items, pdfPageSizes[String(page)] || (page === 1 ? pdfPageSize : null), opts);
    total.ids.push(...r.ids);
    total.details.removedBlack += r.details.removedBlack;
    total.details.removedFrame += r.details.removedFrame;
    total.details.removedOutside += r.details.removedOutside;
    total.details.removedGlyph += r.details.removedGlyph;
    total.details.rescuedSmall += r.details.rescuedSmall;
    total.details.coreFound ||= r.details.coreFound;
    total.details.neutralIsMarkup ||= r.details.neutralIsMarkup;
  }
  total.count = total.ids.length;
  return total;
}
