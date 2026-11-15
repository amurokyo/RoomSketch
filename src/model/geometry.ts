// RoomSketch 2.0.1 — 统一几何模块（文档 §6.2）
// 与 1.0.0 的 objBounds 完全同一套数学：先取局部包围盒，再按 rotation
// 绕对象原点旋转四个角，取轴对齐包围盒。render() 用 translate(x,y)
// rotate(rotation) 绘制，包围盒必须用同一变换，否则选框 / 适合窗口 /
// 框选 / 导出范围会与画面不一致（1.0.0 曾因此出过 bug，已修）。
import type { Point, RsObject, ViewBox } from './types.ts';

export interface Bounds { x: number; y: number; w: number; h: number }

export function fmt(n: number): number { return Math.round(n * 10) / 10; }

export function polyArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function polyCentroid(pts: Point[]): Point {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** 旋转后的轴对齐包围盒（世界坐标）。与 render 的 translate+rotate 同一变换。 */
export function objBounds(o: RsObject): Bounds {
  let xs: number[] = [], ys: number[] = [];
  if ('points' in o && o.points) {
    for (const p of o.points) { xs.push(p[0]); ys.push(p[1]); }
  } else if (o.type === 'dimension') {
    xs = [0, o.length || o.w || 0]; ys = [-70, 40];
  } else {
    xs = [0, (o as { w?: number }).w || 0]; ys = [0, (o as { h?: number }).h || 0];
    if (o.type === 'door' || o.type === 'window') ys = [0, (o.dir || 1) * (o.w || 0)];
  }
  const lx0 = Math.min(...xs), lx1 = Math.max(...xs), ly0 = Math.min(...ys), ly1 = Math.max(...ys);
  if (!isFinite(lx0)) return { x: o.x || 0, y: o.y || 0, w: 100, h: 100 };
  const ang = (o.rotation || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  const corners = [[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]].map(([px, py]) => [
    (o.x || 0) + px * c - py * sn,
    (o.y || 0) + px * sn + py * c,
  ]);
  const cx = corners.map(q => q[0]), cy = corners.map(q => q[1]);
  // 1.0.0 坑：角点缩放代码曾用未定义的 o.h 导致 NaN；此处 pad 只依赖 stroke。
  const pad = (o.stroke || 10) / 2;
  const minx = Math.min(...cx) - pad, maxx = Math.max(...cx) + pad;
  const miny = Math.min(...cy) - pad, maxy = Math.max(...cy) + pad;
  return { x: minx, y: miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
}

/** 选择边界 = 旋转包围盒（1.0.0 已删二次旋转逻辑，此处直接别名）。 */
export function selectionBounds(o: RsObject): Bounds { return objBounds(o); }

export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function rectContains(a: Bounds, b: Bounds): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

export function boundsUnion(bs: Bounds[]): Bounds | null {
  if (!bs.length) return null;
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  const r = Math.max(...bs.map(b => b.x + b.w)), bt = Math.max(...bs.map(b => b.y + b.h));
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, bt - y) };
}

/** 导出范围：'all' 为全部对象的包围盒 + 4% 边距（至少 50mm）；'view' 为当前视图。 */
export function exportRectFor(objects: RsObject[], view: ViewBox, scope: 'view' | 'all'): Bounds {
  if (scope === 'all' && objects.length) {
    const bs = objects.map(objBounds);
    const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
    const r = Math.max(...bs.map(b => b.x + b.w)), bt = Math.max(...bs.map(b => b.y + b.h));
    const pad = Math.max(r - x, bt - y) * 0.04 + 50;
    return { x: x - pad, y: y - pad, w: (r - x) + pad * 2, h: (bt - y) + pad * 2 };
  }
  return { x: view.x, y: view.y, w: view.w, h: view.h };
}

/** 点到线段的投影（返回投影点、沿段参数 t、距离）。 */
export function projectToSegment(
  pt: { x: number; y: number }, ax: number, ay: number, bx: number, by: number,
): { px: number; py: number; t: number; d: number } {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  let t = ((pt.x - ax) * dx + (pt.y - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t, py = ay + dy * t;
  return { px, py, t, d: Math.hypot(pt.x - px, pt.y - py) };
}

/** 局部点 → 世界点（绕对象原点旋转 + 平移），与 render 变换一致。 */
export function localToWorld(o: { x?: number; y?: number; rotation?: number }, lx: number, ly: number): Point {
  const ang = (o.rotation || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  return [(o.x || 0) + lx * c - ly * sn, (o.y || 0) + lx * sn + ly * c];
}

/** 世界点 → 局部点（localToWorld 的逆变换）。 */
export function worldToLocal(o: { x?: number; y?: number; rotation?: number }, wx: number, wy: number): Point {
  const ang = -(o.rotation || 0) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
  const dx = wx - (o.x || 0), dy = wy - (o.y || 0);
  return [dx * c - dy * sn, dx * sn + dy * c];
}
