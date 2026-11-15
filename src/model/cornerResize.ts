// RoomSketch 2.0.0 — 旋转对象角点缩放纯函数
// 1.0.0 已知限制：旋转后的矩形/家具不提供角点手柄；且角点代码曾用未定义的 o.h 导致 NaN。
// 2.0.0：手柄画在旋转后的真实角点上，拖动时把指针换算到对象局部坐标系，
// 在局部空间里按“固定对角不动”重算 w/h 与原点；门/窗/尺寸标注只改沿墙方向的长度。
import type { RsObject } from './types.ts';
import { worldToLocal, localToWorld } from './geometry.ts';

export type CornerId = 'nw' | 'ne' | 'se' | 'sw';

export interface ResizeResult { x: number; y: number; w?: number; h?: number; length?: number }

/**
 * 角点拖动后的新几何。corner 为被拖角在局部坐标中的位置标识；
 * pointerWorld 为指针世界坐标。返回应写入对象的新 x/y/w/h/length。
 * 局部原点 = 旧局部 (nx, ny) 处，nx = min(指针局部 x, 固定角 x)，以此类推。
 */
export function cornerResize(o: RsObject, corner: CornerId, pointerWorld: { x: number; y: number }): ResizeResult {
  const [lx, ly] = worldToLocal(o, pointerWorld.x, pointerWorld.y);
  const w = (o as { w?: number }).w || 0;
  const h = (o as { h?: number }).h || 0;
  if (o.type === 'door' || o.type === 'window') {
    // 门/窗只有沿墙方向的长度 w；y 方向由 w 决定（门弧半径 = w），不参与缩放。
    const fixedX = corner === 'nw' || corner === 'sw' ? w : 0;
    const nw = Math.max(100, Math.abs(lx - fixedX));
    const nx = corner === 'nw' || corner === 'sw' ? lx : 0;
    const [ox, oy] = localToWorld(o, nx, 0);
    return { x: ox, y: oy, w: nw };
  }
  if (o.type === 'dimension') {
    const len = (o as { length?: number }).length || w || 0;
    const fixedX = corner === 'nw' || corner === 'sw' ? len : 0;
    const nl = Math.max(100, Math.abs(lx - fixedX));
    const nx = corner === 'nw' || corner === 'sw' ? lx : 0;
    const [ox, oy] = localToWorld(o, nx, 0);
    return { x: ox, y: oy, length: nl };
  }
  // rect / furniture / imagebg：局部矩形 (0,0)-(w,h)
  const fixedX = corner === 'nw' || corner === 'sw' ? w : 0;
  const fixedY = corner === 'nw' || corner === 'ne' ? h : 0;
  const nx = Math.min(lx, fixedX), ny = Math.min(ly, fixedY);
  const nw = Math.max(30, Math.abs(lx - fixedX));
  const nh = Math.max(30, Math.abs(ly - fixedY));
  const [ox, oy] = localToWorld(o, nx, ny);
  return { x: ox, y: oy, w: nw, h: nh };
}

/** 被拖角在局部坐标中的位置（用于判断固定角）。 */
export function cornerLocal(o: RsObject, corner: CornerId): [number, number] {
  const w = (o as { w?: number }).w || 0;
  const h = (o as { h?: number }).h || 0;
  if (o.type === 'door' || o.type === 'window') {
    const dir = (o as { dir?: number }).dir || 1;
    return [corner === 'nw' || corner === 'sw' ? 0 : w, corner === 'nw' || corner === 'ne' ? 0 : dir * w];
  }
  if (o.type === 'dimension') {
    const len = (o as { length?: number }).length || w || 0;
    return [corner === 'nw' || corner === 'sw' ? 0 : len, corner === 'nw' || corner === 'ne' ? 0 : 0];
  }
  return [corner === 'nw' || corner === 'sw' ? 0 : w, corner === 'nw' || corner === 'ne' ? 0 : h];
}
