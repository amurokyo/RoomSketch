// RoomSketch 2.0.0 — 矢量 PDF 导出（手写 PDF 写入器，移植 1.0.0，离线无依赖）
// 结构：collectPdfContent（纯函数：对象 → PDF 操作流 + 文字遮罩规格 + 图片，
// Node 可测）→ assemblePdf（组装 PDF 字节，文字遮罩可注入桩函数）→
// buildPdfBytes（浏览器入口，默认用 canvas 生成文字遮罩）。
// 相对 1.0.0 的修正：
//  1. path() 漏了 RG 算子——原代码把描边颜色数值直接写入内容流却没有
//     RG 操作符（多余操作数留在栈上、描边恒为黑色）；此处补上 RG。
//  2. strToBytes 保持 latin1（charCode & 255）：PDF 头部的二进制注释字节
//     不能用 TextEncoder（UTF-8 会把单字节扩成多字节）。
import type { ImageBgObject, RsObject, ViewBox } from './types.ts';
import { exportRectFor, objBounds, polyArea, polyCentroid } from './geometry.ts';
import { hexRgb01 } from './color.ts';

export interface PdfExportOptions {
  paper: 'A4' | 'A3';
  orient: 'landscape' | 'portrait';
  scale: number;
  scope: 'view' | 'all';
  hideGrid: boolean;
}

export interface PdfMaskSpec {
  text: string; wx: number; wy: number;
  anchor: 'middle' | 'start'; paperMM: number; color: string;
}

export interface PdfContent {
  ops: string[];
  masks: PdfMaskSpec[];
  images: ImageBgObject[];
  scale: number;
  rect: { x: number; y: number; w: number; h: number };
  paperW: number; paperH: number;
  /** 纸张放不下时是否自动放宽了比例 */
  relaxed: boolean;
}

export interface MaskData {
  w: number; h: number; rowBytes: number;
  data: Uint8Array; K: number; baseline: number;
}

export type MaskFn = (text: string, paperMM: number) => Promise<MaskData>;

const PAPERS: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297] };
const PT = 72 / 25.4; // mm → pt
const SCALE_STEPS = [20, 25, 50, 75, 100, 150, 200, 250, 500];

export function strToBytes(s: string): Uint8Array {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255;
  return a;
}

async function deflateBytes(u8: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter();
  void w.write(u8);
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** 文字 → 1bit 遮罩位图（canvas 光栅化；无 document 的环境抛错，由调用方注入桩）。 */
export async function makeTextMask(text: string, paperMM: number): Promise<MaskData> {
  if (typeof document === 'undefined') throw new Error('文字遮罩需要浏览器 canvas');
  const K = 8;
  const fs = Math.max(6, paperMM * K);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas 2d');
  ctx.font = `500 ${fs}px "Microsoft YaHei","PingFang SC",Arial,sans-serif`;
  const m = ctx.measureText(text);
  const w = Math.max(4, Math.ceil(m.width) + 6), h = Math.ceil(fs * 1.3) + 6;
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('浏览器不支持 canvas 2d');
  g.font = `500 ${fs}px "Microsoft YaHei","PingFang SC",Arial,sans-serif`;
  g.fillStyle = '#000';
  g.textBaseline = 'alphabetic';
  const baseline = h - Math.ceil(fs * 0.25);
  g.fillText(text, 3, baseline);
  const img = g.getImageData(0, 0, w, h).data;
  const rowBytes = Math.ceil(w / 8);
  const bits = new Uint8Array(rowBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (img[(y * w + x) * 4 + 3] > 128) bits[y * rowBytes + (x >> 3)] |= (0x80 >> (x & 7));
    }
  }
  const z = await deflateBytes(bits);
  return { w, h, rowBytes, data: z, K, baseline };
}

/**
 * 纯函数：按出图比例把对象转成 PDF 内容流操作。
 * 旋转对象用 translate+rotate 同一变换（与 2D 渲染一致）；门弧线 24 段；
 * 文字不直接写 Tj（避免内嵌字体），而是生成遮罩规格由 assemblePdf 光栅化。
 * 返回 scale（纸张放不下时自动放宽一档）与 rect（导出范围）。
 */
export function collectPdfContent(
  objects: RsObject[], opts: PdfExportOptions, view: ViewBox,
): PdfContent {
  if (!objects.length) throw new Error('画布为空，没有可导出的内容');
  let [pw, ph] = PAPERS[opts.paper] || PAPERS.A4;
  if (opts.orient === 'portrait') [pw, ph] = [ph, pw];
  const bb = exportRectFor(objects, view, opts.scope);
  const margin = 8;
  let s = opts.scale;
  let relaxed = false;
  if (bb.w / s + margin * 2 > pw || bb.h / s + margin * 2 > ph) {
    const ok = SCALE_STEPS.find(v => bb.w / v + margin * 2 <= pw && bb.h / v + margin * 2 <= ph);
    if (ok) { s = ok; relaxed = true; }
    else throw new Error('图纸尺寸超出 A3 1:20 可容纳范围，请缩小图形或选择更大纸张');
  }
  const cw = bb.w / s, ch = bb.h / s, ox = (pw - cw) / 2, oy = (ph - ch) / 2;
  const X = (wx: number) => +(((wx - bb.x) / s + ox) * PT).toFixed(2);
  const Y = (wy: number) => +((ph - ((wy - bb.y) / s + oy)) * PT).toFixed(2);
  const ops: string[] = [], masks: PdfMaskSpec[] = [], images: ImageBgObject[] = [];
  const rot = (o: RsObject, lx: number, ly: number): [number, number] => {
    const a = (o.rotation || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    return [(o.x || 0) + lx * co - ly * si, (o.y || 0) + lx * si + ly * co];
  };
  const path = (
    pts: [number, number][], color: string, wpt: number,
    close = false, fill = false, fillColor: string | null = null,
  ) => {
    const [r, g, b] = hexRgb01(color);
    const fillOp = fill ? `${hexRgb01(fillColor || color).join(' ')} rg ` : '';
    ops.push(`q ${r} ${g} ${b} RG ${fillOp}${Math.max(0.13, wpt).toFixed(2)} w 1 J 1 j`);
    ops.push(pts.map((p, i) => `${X(p[0])} ${Y(p[1])} ${i ? 'l' : 'm'}`).join(' ') + (close ? ' h' : '') + (fill ? ' f' : ' S') + ' Q');
  };
  const emitPolyObj = (
    o: RsObject, ptsLocal: [number, number][], color: string, wpt: number,
    close = false, fill = false, fillColor: string | null = null,
  ) => path(ptsLocal.map(p => rot(o, p[0], p[1])), color, wpt, close, fill, fillColor);

  if (!opts.hideGrid) {
    const gcol = '0.86 0.88 0.90';
    const step = 500;
    const gx0 = Math.ceil(bb.x / step) * step, gy0 = Math.ceil(bb.y / step) * step;
    ops.push(`q ${gcol} RG 0.15 w`);
    for (let gx = gx0; gx <= bb.x + bb.w; gx += step) ops.push(`${X(gx)} ${Y(bb.y)} m ${X(gx)} ${Y(bb.y + bb.h)} l S`);
    for (let gy = gy0; gy <= bb.y + bb.h; gy += step) ops.push(`${X(bb.x)} ${Y(gy)} m ${X(bb.x + bb.w)} ${Y(gy)} l S`);
    ops.push('Q');
  }

  for (const o of objects) {
    const color = o.strokeColor || o.pdfStrokeColor || (o.type === 'pdf' ? '#65758a' : '#27384a');
    if (o.type === 'wall') emitPolyObj(o, o.points, color, (o.wallWidth || 120) / s * PT);
    else if (o.type === 'pdf' || o.type === 'polyline' || o.type === 'line') {
      emitPolyObj(o, o.points, color, Math.max(0.2, (o.stroke ?? 0.25) / s * PT), !!o.closed, !!o.closed && !!o.fill && o.fill !== 'none', o.fill ?? null);
    } else if (o.type === 'polyroom') {
      emitPolyObj(o, [...o.points, o.points[0]], color, 10 / s * PT, true, true, '#e9f0fc');
      const c = polyCentroid(o.points);
      masks.push({
        text: o.label || `≈ ${(polyArea(o.points) / 1e6).toFixed(1)} m²`,
        wx: (o.x || 0) + c[0], wy: (o.y || 0) + c[1], anchor: 'middle',
        paperMM: Math.min(4.2, Math.max(2.2, Math.sqrt(polyArea(o.points)) / s * 0.16)), color: '#2e5fb0',
      });
    } else if (o.type === 'rect') {
      emitPolyObj(o, [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]], color, Math.max(0.25, (o.stroke || 12) / s * PT), true, !!o.fill && o.fill !== 'none', o.fill ?? null);
    } else if (o.type === 'furniture') {
      emitPolyObj(o, [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]], color, Math.max(0.25, (o.stroke || 12) / s * PT), true, true, '#eef2f8');
      masks.push({
        text: o.label || '家具', wx: (o.x || 0) + o.w / 2, wy: (o.y || 0) + o.h / 2, anchor: 'middle',
        paperMM: Math.min(3.2, Math.max(1.6, Math.min(o.w, o.h) / s * 0.3)), color: '#42546a',
      });
    } else if (o.type === 'door') {
      const d = o.dir || 1;
      emitPolyObj(o, [[0, 0], [0, d * o.w]], color, 10 / s * PT);
      const arc: [number, number][] = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI / 2; arc.push([o.w * Math.cos(t), d * o.w * Math.sin(t)]); }
      emitPolyObj(o, arc, color, 10 / s * PT);
    } else if (o.type === 'window') {
      emitPolyObj(o, [[0, -18], [o.w, -18]], color, 12 / s * PT);
      emitPolyObj(o, [[0, 18], [o.w, 18]], color, 12 / s * PT);
      emitPolyObj(o, [[0, -28], [0, 28]], color, 6 / s * PT);
      emitPolyObj(o, [[o.w, -28], [o.w, 28]], color, 6 / s * PT);
    } else if (o.type === 'dimension') {
      const len = o.length || o.w || 0;
      emitPolyObj(o, [[0, 0], [len, 0]], color, 8 / s * PT);
      emitPolyObj(o, [[0, -30], [0, 30]], color, 8 / s * PT);
      emitPolyObj(o, [[len, -30], [len, 30]], color, 8 / s * PT);
      emitPolyObj(o, [[0, 0], [45, -18], [45, 18]], color, 0.1, true, true, color);
      emitPolyObj(o, [[len, 0], [len - 45, -18], [len - 45, 18]], color, 0.1, true, true, color);
      masks.push({
        text: o.label || `${Math.round(len)} mm`, wx: (o.x || 0) + len / 2, wy: (o.y || 0) - 58, anchor: 'middle',
        paperMM: Math.min(4, Math.max(1.8, 90 / s)), color,
      });
    } else if (o.type === 'label') {
      masks.push({
        text: o.label || '文字标注', wx: o.x || 0, wy: o.y || 0, anchor: 'start',
        paperMM: Math.min(7, Math.max(1.8, (o.fontSize || 120) / s)), color,
      });
    } else if (o.type === 'imagebg') images.push(o);
  }
  return { ops, masks, images, scale: s, rect: bb, paperW: pw, paperH: ph, relaxed };
}

/** 从 JPEG data URL 解析字节与尺寸（无 srcW/srcH 时读 JPEG 头）。 */
function jpegFromDataUrl(src: string): { w: number; h: number; data: Uint8Array } {
  const b64 = String(src).split(',')[1] || '';
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  let w = 0, h = 0, i = 2;
  while (i < u8.length - 9) {
    if (u8[i] !== 0xFF) { i++; continue; }
    const m = u8[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      h = (u8[i + 5] << 8) | u8[i + 6]; w = (u8[i + 7] << 8) | u8[i + 8];
      break;
    }
    const len = (u8[i + 2] << 8) | u8[i + 3];
    i += 2 + len;
  }
  return { w, h, data: u8 };
}

/** 组装 PDF 字节（1 catalog / 2 pages / 3 page / 4 contents / 5 extgstate / 6+ xobjects）。 */
export async function assemblePdf(
  content: PdfContent, opts: PdfExportOptions, maskFn: MaskFn = makeTextMask,
): Promise<Uint8Array> {
  const { ops, masks, images, scale: s, rect: bb, paperW: pw, paperH: ph } = content;
  const X = (wx: number) => +(((wx - bb.x) / s + (pw - bb.w / s) / 2) * PT).toFixed(2);
  const Y = (wy: number) => +((ph - ((wy - bb.y) / s + (ph - bb.h / s) / 2)) * PT).toFixed(2);
  const pageId = 3, contentId = 4, gsId = 5;
  const nImg = images.length, nMask = masks.length;
  const imgIds = images.map((_, i) => 6 + i);
  const maskIds = masks.map((_, i) => 6 + nImg + i);
  const maskStreams: MaskData[] = [];
  for (const mk of masks) maskStreams.push(await maskFn(mk.text, mk.paperMM));
  const jpegData = images.map(o => {
    const d = jpegFromDataUrl(o.src);
    return { w: (o.srcW && o.srcH) ? o.srcW : d.w, h: (o.srcW && o.srcH) ? o.srcH : d.h, data: d.data };
  });
  const resDict = `<< /ExtGState << /G1 ${gsId} 0 R >> /XObject << ${imgIds.map((id, i) => `/Bg${i} ${id} 0 R `).join('')}${maskIds.map((id, i) => `/Im${i} ${id} 0 R `).join('')} >> >>`;
  const contentOps = ops.join('\n');
  const maskPaintOps = masks.map((mk, i) => {
    const t = maskStreams[i];
    const [r, g, b] = hexRgb01(mk.color);
    const wpt = t.w / t.K * PT, hpt = t.h / t.K * PT;
    const descPt = (t.h - t.baseline) / t.K * PT;
    let xw = mk.wx;
    if (mk.anchor === 'middle') xw = mk.wx - (t.w / t.K * s) / 2;
    const x = X(xw), yBottom = Y(mk.wy) - descPt;
    return `q ${r} ${g} ${b} rg ${wpt.toFixed(2)} 0 0 ${hpt.toFixed(2)} ${x.toFixed(2)} ${yBottom.toFixed(2)} cm /Im${i} Do Q`;
  }).join('\n');
  const bgOps = images.map((im, i) => {
    const o = im;
    return `q /G1 gs ${((o.w) / s * PT).toFixed(2)} 0 0 ${((o.h) / s * PT).toFixed(2)} ${X(o.x || 0).toFixed(2)} ${Y((o.y || 0) + o.h).toFixed(2)} cm /Bg${i} Do Q`;
  }).join('\n');
  const stream = contentOps + '\n' + bgOps + '\n' + maskPaintOps + '\n';

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const push = (b: Uint8Array) => { chunks.push(b); offset += b.length; };
  const pushStr = (str: string) => push(strToBytes(str));
  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const objStart = () => { offsets.push(offset); };
  const objBodies: string[] = [];
  objBodies[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objBodies[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objBodies[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(pw * PT).toFixed(2)} ${(ph * PT).toFixed(2)}] /Resources ${resDict} /Contents ${contentId} 0 R >>`;
  objBodies[4] = `<< /Length ${strToBytes(stream).length} >>\nstream\n${stream}endstream`;
  objBodies[5] = '<< /Type /ExtGState /CA 1 /ca 1 >>';
  images.forEach((_, i) => {
    const jd = jpegData[i];
    objBodies[imgIds[i]] = `<< /Type /XObject /Subtype /Image /Width ${jd.w} /Height ${jd.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jd.data.length} >>\nstream\n`;
  });
  maskStreams.forEach((t, i) => {
    objBodies[maskIds[i]] = `<< /Type /XObject /Subtype /Image /ImageMask true /Width ${t.w} /Height ${t.h} /BitsPerComponent 1 /Decode [0 1] /Filter /FlateDecode /Length ${t.data.length} >>\nstream\n`;
  });
  for (let id = 1; id < objBodies.length; id++) {
    objStart();
    pushStr(`${id} 0 obj\n${objBodies[id]}`);
    if (imgIds.includes(id)) { push(jpegData[imgIds.indexOf(id)].data); pushStr('\nendstream'); }
    else if (maskIds.includes(id)) { push(maskStreams[maskIds.indexOf(id)].data); pushStr('\nendstream'); }
    pushStr('\nendobj\n');
  }
  const xrefOff = offset;
  let xref = 'xref\n0 ' + objBodies.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objBodies.length; i++) xref += String(offsets[i - 1]).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size ${objBodies.length} /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`;
  pushStr(xref);
  const total = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) { total.set(c, pos); pos += c.length; }
  return total;
}

/** 浏览器入口：对象 + 选项 + 视图 → PDF 字节与实际比例。 */
export async function buildPdfBytes(
  objects: RsObject[], opts: PdfExportOptions, view: ViewBox,
): Promise<{ bytes: Uint8Array; scale: number; paper: string; orient: string; relaxed: boolean }> {
  const content = collectPdfContent(objects, opts, view);
  const bytes = await assemblePdf(content, opts);
  return { bytes, scale: content.scale, paper: opts.paper, orient: opts.orient, relaxed: content.relaxed };
}
