import type { FurnitureObject, RsObject } from './types.ts';
import { objBounds, rectsIntersect } from './geometry.ts';

export interface FurniturePlacement {
  x: number; y: number; w: number; h: number; dragged: boolean;
}

/** 单击按标准尺寸居中放置；拖动时按实际拖出区域布设。 */
export function furniturePlacement(
  start: { x: number; y: number }, end: { x: number; y: number },
  defaultW: number, defaultH: number, clickTolerance: number,
): FurniturePlacement {
  const dragged = Math.hypot(end.x - start.x, end.y - start.y) > Math.max(1, clickTolerance);
  const w = Math.max(50, dragged ? Math.abs(end.x - start.x) : defaultW);
  const h = Math.max(50, dragged ? Math.abs(end.y - start.y) : defaultH);
  return dragged
    ? { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h, dragged }
    : { x: start.x - w / 2, y: start.y - h / 2, w, h, dragged };
}

/** 家具移动时对齐其他家具的同侧边线或中心线；返回值不含吸附量时保持原坐标。 */
export function alignFurniture(
  current: FurnitureObject, x: number, y: number, objects: RsObject[], tolerance: number,
): { x: number; y: number } {
  const probe = { ...current, x, y } as FurnitureObject;
  const box = objBounds(probe);
  const candidatesX = [box.x, box.x + box.w / 2, box.x + box.w];
  const candidatesY = [box.y, box.y + box.h / 2, box.y + box.h];
  let bestX = { d: tolerance + 1, delta: 0 }, bestY = { d: tolerance + 1, delta: 0 };
  for (const other of objects) {
    if (other.id === current.id || other.type !== 'furniture') continue;
    const b = objBounds(other);
    for (const target of [b.x, b.x + b.w / 2, b.x + b.w]) {
      for (const value of candidatesX) {
        const d = Math.abs(value - target);
        if (d < bestX.d) bestX = { d, delta: target - value };
      }
    }
    for (const target of [b.y, b.y + b.h / 2, b.y + b.h]) {
      for (const value of candidatesY) {
        const d = Math.abs(value - target);
        if (d < bestY.d) bestY = { d, delta: target - value };
      }
    }
  }
  return { x: x + (bestX.d <= tolerance ? bestX.delta : 0), y: y + (bestY.d <= tolerance ? bestY.delta : 0) };
}

export function furnitureOverlap(current: FurnitureObject, objects: RsObject[]): boolean {
  const box = objBounds(current);
  return objects.some(o => o.type === 'furniture' && o.id !== current.id && rectsIntersect(box, objBounds(o)));
}
