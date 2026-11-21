export interface RasterCleanupOptions {
  threshold: number;
  minComponent: number;
  maxGlyphSize: number;
  removeThin: boolean;
}

export interface RasterCleanupResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  removedNoise: number;
  removedGlyphs: number;
  removedThin: number;
  kept: number;
  inverted: boolean;
}

/** 扫描页 / 图片底图的 8 邻域连通域净化；最大连通结构始终保留。 */
export function cleanRasterPixels(
  source: Uint8ClampedArray, width: number, height: number,
  options: Partial<RasterCleanupOptions> = {},
): RasterCleanupResult {
  const opts: RasterCleanupOptions = {
    threshold: Math.max(40, Math.min(240, options.threshold ?? 175)),
    minComponent: Math.max(2, options.minComponent ?? 18),
    maxGlyphSize: Math.max(8, options.maxGlyphSize ?? Math.round(Math.max(width, height) * 0.045)),
    removeThin: options.removeThin ?? false,
  };
  const count = width * height;
  let borderLum = 0, borderN = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
    const i = (y * width + x) * 4;
    borderLum += 0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2];
    borderN++;
  }
  const inverted = borderN > 0 && borderLum / borderN < 110;
  const foreground = new Uint8Array(count);
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (source[i + 3] < 40) continue;
    let lum = 0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2];
    if (inverted) lum = 255 - lum;
    foreground[p] = lum < opts.threshold ? 1 : 0;
  }
  const visited = new Uint8Array(count), queue = new Int32Array(count);
  const components: { pixels: number[]; minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1], dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  for (let start = 0; start < count; start++) {
    if (!foreground[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; visited[start] = 1;
    const pixels: number[] = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      pixels.push(p);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k], ny = y + dy[k];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (foreground[np] && !visited[np]) { visited[np] = 1; queue[tail++] = np; }
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }
  const remove = new Uint8Array(components.length);
  let largest = -1, largestN = 0;
  components.forEach((c, i) => { if (c.pixels.length > largestN) { largestN = c.pixels.length; largest = i; } });
  let removedNoise = 0, removedGlyphs = 0, removedThin = 0;
  components.forEach((c, i) => {
    if (i === largest) return;
    const side = Math.max(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
    const thick = c.pixels.length / Math.max(1, side);
    if (c.pixels.length < opts.minComponent) { remove[i] = 1; removedNoise++; }
    else if (side <= opts.maxGlyphSize) { remove[i] = 1; removedGlyphs++; }
    else if (opts.removeThin && thick <= Math.max(0.7, width / 2400)) { remove[i] = 1; removedThin++; }
  });
  const data = new Uint8ClampedArray(count * 4);
  for (let p = 0; p < count; p++) { data[p * 4] = 255; data[p * 4 + 1] = 255; data[p * 4 + 2] = 255; data[p * 4 + 3] = 255; }
  let kept = 0;
  components.forEach((c, i) => {
    if (remove[i]) return;
    kept++;
    for (const p of c.pixels) { data[p * 4] = 45; data[p * 4 + 1] = 55; data[p * 4 + 2] = 72; }
  });
  return { data, width, height, removedNoise, removedGlyphs, removedThin, kept, inverted };
}

export async function cleanRasterDataUrl(
  src: string, options: Partial<RasterCleanupOptions> = {},
): Promise<RasterCleanupResult & { dataUrl: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('底图解码失败'));
    el.src = src;
  });
  const scale = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
  ctx.drawImage(img, 0, 0, width, height);
  const source = ctx.getImageData(0, 0, width, height);
  const result = cleanRasterPixels(source.data, width, height, options);
  ctx.putImageData(new ImageData(result.data as unknown as ImageDataArray, width, height), 0, 0);
  return { ...result, dataUrl: canvas.toDataURL('image/png') };
}
