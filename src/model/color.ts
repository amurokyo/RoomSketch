// RoomSketch 2.0.2 — 颜色工具
/** '#27384a'（或 3 位简写）→ [0..1, 0..1, 0..1]，保留 3 位小数（PDF 颜色算子用）。 */
export function hexRgb01(hex: string): [number, number, number] {
  let n = hex.replace('#', '');
  if (n.length === 3) n = n.split('').map(c => c + c).join('');
  const v = (i: number) => Math.round((parseInt(n.slice(i, i + 2), 16) / 255) * 1000) / 1000;
  return [v(0), v(2), v(4)];
}
