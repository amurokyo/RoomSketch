// RoomSketch 2.0.2 — PDF 导入（PDF.js，文档 §6.4/§6.5）
// 替代 1.0.0 的自定义单页解析器：
// - 多页：页面预览与选择，逐页提取；
// - Form XObject：PDF.js 会把 Form 内容以内联算子的形式放进 operator list
//  （paintFormXObjectBegin/End 标记之间），矢量自然包含在内，不再静默丢弃；
// - 矢量提取模块与页面渲染解耦：本模块只消费 operator list；
// - 扫描页（无矢量、有图像）渲染成图当底图，不虚报矢量提取能力；
// - Worker 策略与原型一致：优先 Blob Worker，失败回退主线程
//  （pdf.js 4.x 里 workerSrc='' 不是有效回退，会抛错）。
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Worker 代码由调用方注入（浏览器构建时用 Vite `?raw` 内联 worker 源码；
// Node 测试时由测试文件从 node_modules 读入）。这样本模块不依赖
// Vite 专属的 `?raw` 后缀，可在纯 Node 下直接导入测试。
let workerCode: string | null = null;
export function setPdfWorkerCode(code: string): void { workerCode = code; }

const PT_TO_MM = 0.352778;

export interface PdfVectorObject {
  type: 'pdf';
  x: number;
  y: number;
  points: [number, number][];
  stroke: number;
  strokeColor: string;
  pdfStrokeColor: string;
  closed: boolean;
  pdfOrigin: boolean;
}

export interface PdfPageInfo {
  num: number;
  w: number; // mm
  h: number; // mm
  vectorCount: number;
  hasImage: boolean;
  hasForm: boolean;
  rotation: number;
}

export interface PdfDocument {
  numPages: number;
  pages: PdfPageInfo[];
  warnings: string[];
  /** 实际生效的 Worker 模式（Node 下恒为 fake；浏览器里 blob 失败回退 fake） */
  mode: 'blob' | 'fake';
  /** 惰性提取：调用 extractPageVectors(num) 得到该页矢量对象 */
  extractPageVectors: (num: number) => Promise<PdfVectorObject[]>;
  /** 扫描页渲染成 JPEG dataURL（底图用） */
  renderPageImage: (num: number, scale?: number) => Promise<{ dataUrl: string; w: number; h: number; pxW: number; pxH: number }>;
  destroy: () => Promise<void>;
}

let workerReady = false;

// pdf.js 自己的 Node 判定（process.versions.node）。jsdom 里没有 process，
// 不能只用 typeof Worker 判断（见 ensureWorker 注释）。
const IS_NODE = typeof process === 'object' && !!(process as unknown as { versions?: { node?: string } }).versions?.node;

async function ensureWorker(mode: 'blob' | 'fake'): Promise<void> {
  if (workerReady) return;
  // 只有真正的 Node.js 环境才跳过 workerSrc 设置：pdf.js 在 Node 下自己把
  // #isWorkerDisabled 置 true，走内置 fake worker。但 jsdom 里既没有 Worker
  // 也没有 process——pdf.js 会把它当浏览器，若 workerSrc 未设置，
  // _initialize 会在 try 块之外抛 'No "GlobalWorkerOptions.workerSrc" specified.'。
  // 所以这里按 pdf.js 自己的 isNodeJS 判定（process.versions.node），
  // jsdom 必须走浏览器分支：设 workerSrc 为 Blob URL，pdf.js 尝试 new Worker
  // 失败后会自动回退到 import(workerSrc) 的 fake worker。
  if (IS_NODE) { workerReady = true; return; }
  if (!workerCode) throw new Error('PDF.js Worker 代码未注入（setPdfWorkerCode）');
  const blob = new Blob([workerCode as unknown as BlobPart], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = url;
  if (mode === 'fake') {
    const workerMod: unknown = await import(/* @vite-ignore */ url);
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = workerMod;
  }
  workerReady = true;
}

/** 三次贝塞尔展平（12 段）。v/y 简写按 PDF 规范处理——1.0.0 此处是错的：
 *  v：P1 = 当前点；y：P2 = 终点。c：三控制点齐全。 */
export function flattenCubic(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
  out: [number, number][],
): void {
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

interface GraphicsState {
  ctm: [number, number, number, number, number, number];
  strokeWidth: number;
  strokeRgb: [number, number, number];
}

const mult = (a: number[], b: number[]): [number, number, number, number, number, number] => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

function matrixScale(ctm: number[]): number {
  const det = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
  if (det > 1e-10) return Math.sqrt(det);
  const sx = Math.hypot(ctm[0], ctm[1]), sy = Math.hypot(ctm[2], ctm[3]);
  return Math.max(1e-6, (sx + sy) / 2);
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PdfDocument> {
  // 调试用查询参数：?pdf=main 强制主线程，?pdf=blob 只试 Blob Worker（Node 下无 location，默认自动选择）
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pdf') : null;
  const modes: ('blob' | 'fake')[] = forced === 'main' ? ['fake'] : forced === 'blob' ? ['blob'] : ['blob', 'fake'];
  let lastError: unknown = null;
  let doc: pdfjs.PDFDocumentProxy | null = null;
  let usedMode: 'blob' | 'fake' = 'fake';
  for (const mode of modes) {
    try {
      await ensureWorker(mode);
      const task = (pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<pdfjs.PDFDocumentProxy> } })
        .getDocument({ data: data.slice(0) });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF 加载超时 30s')), 30000));
      doc = await Promise.race([task.promise, timeout]);
      // 实际生效模式：Node 恒为 fake；没有 Worker 全局的环境（jsdom）里，
      // pdf.js 收到 blob workerSrc 也会在 new Worker 抛错后内部回退到 fake，
      // 所以 requested mode 为 blob 时仍应记为 fake。
      usedMode = (IS_NODE || typeof Worker === 'undefined') ? 'fake' : mode;
      break;
    } catch (e) {
      lastError = e;
      workerReady = false;
    }
  }
  if (!doc) throw new Error('PDF 加载失败：' + String(lastError));

  const OPS = (pdfjs as unknown as { OPS: Record<string, number> }).OPS;
  const warnings: string[] = [];
  const pages: PdfPageInfo[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.view; // [x0, y0, x1, y1]，单位 pt
    const w = (view[2] - view[0]) * PT_TO_MM, h = (view[3] - view[1]) * PT_TO_MM;
    // 快速扫描：矢量算子与图像算子计数（不展开全部路径）
    const opList = await page.getOperatorList();
    let vectorCount = 0, hasImage = false, hasForm = false;
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn === OPS.stroke || fn === OPS.fillStroke || fn === OPS.fill || fn === OPS.eoFill) vectorCount++;
      if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) hasImage = true;
      if (fn === OPS.paintFormXObject || fn === OPS.paintFormXObjectBegin) hasForm = true;
    }
    pages.push({ num: n, w, h, vectorCount, hasImage, hasForm, rotation: page.rotate });
  }
  if (doc.numPages > 1) warnings.push(`多页 PDF（共 ${doc.numPages} 页），可逐页选择导入`);

  async function extractPageVectors(num: number): Promise<PdfVectorObject[]> {
    const page = await doc!.getPage(num);
    const view = page.view;
    const [x0, , x1, y1] = view;
    const opList = await page.getOperatorList();
    const results: PdfVectorObject[] = [];
    let ctm: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    let gs: GraphicsState[] = [];
    let path: [number, number][][] = [];
    let sub: [number, number][] | null = null;
    let strokeWidth = 1;
    let strokeRgb: [number, number, number] = [0, 0, 0];
    const trans = (x: number, y: number): [number, number] => [
      ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5],
    ];
    const addPoint = (x: number, y: number): void => {
      if (!sub) { sub = []; path.push(sub); }
      sub.push(trans(x, y));
    };
    const closeSubpath = (): void => {
      if (sub && sub.length > 1) {
        const f = sub[0], l = sub[sub.length - 1];
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 1e-7) sub.push([...f]);
      }
    };
    const flush = (paint: 'stroke' | 'fillStroke' | 'fill' | 'none', closed: boolean): void => {
      if (paint === 'stroke' || paint === 'fillStroke') {
        for (const pp of path) {
          if (pp.length < 2) continue;
          const pts = pp.filter((v, i) => i === 0 || Math.hypot(v[0] - pp[i - 1][0], v[1] - pp[i - 1][1]) > 1e-5);
          if (pts.length < 2) continue;
          const closedPath = closed || Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-5;
          const pdfColor = '#' + strokeRgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
          const mmPts = pts.map(([x, y]) => [(x - x0) * PT_TO_MM, (y1 - y) * PT_TO_MM] as [number, number]);
          results.push({
            type: 'pdf', x: 0, y: 0, points: mmPts,
            stroke: Math.max(0.15, Math.min(3, strokeWidth * matrixScale(ctm) * PT_TO_MM)),
            strokeColor: pdfColor, pdfStrokeColor: pdfColor, closed: closedPath, pdfOrigin: true,
          });
        }
      }
      path = []; sub = null;
    };

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i] as unknown[];
      if (fn === OPS.save) { gs.push({ ctm: [...ctm], strokeWidth, strokeRgb: [...strokeRgb] }); continue; }
      if (fn === OPS.restore) { const g = gs.pop(); if (g) { ctm = g.ctm; strokeWidth = g.strokeWidth; strokeRgb = g.strokeRgb; } continue; }
      if (fn === OPS.transform) { ctm = mult(ctm, args as number[]); continue; }
      if (fn === OPS.setLineWidth) { strokeWidth = Math.abs(args[0] as number); continue; }
      // 注意：pdf.js 4.x 的颜色算子参数是 0–255（不是 PDF 原生的 0–1），需归一化。
      const normColor = (v: number): number => (v > 1 ? v / 255 : v);
      if (fn === OPS.setStrokeRGBColor) { strokeRgb = [normColor(args[0] as number), normColor(args[1] as number), normColor(args[2] as number)]; continue; }
      if (fn === OPS.setStrokeGray) { const g = Math.max(0, Math.min(1, normColor(args[0] as number))); strokeRgb = [g, g, g]; continue; }
      if (fn === OPS.setStrokeCMYKColor) {
        const [c, m, y, k] = (args as number[]).map(normColor);
        strokeRgb = [
          1 - Math.min(1, c * (1 - k) + k), 1 - Math.min(1, m * (1 - k) + k), 1 - Math.min(1, y * (1 - k) + k),
        ];
        continue;
      }
      // pdf.js 4.x 把路径构造算子打包成 constructPath：
      // args = [opCodes[], coords[], bbox]，opCodes 用 OPS.moveTo/lineTo/curveTo/
      // curveTo2(v)/curveTo3(y)/closePath/rectangle 编码，coords 为扁平坐标。
      if (fn === OPS.constructPath) {
        const [opCodes, coords] = args as [number[], number[]];
        let ci = 0;
        for (const code of opCodes) {
          if (code === OPS.moveTo) { sub = null; addPoint(coords[ci], coords[ci + 1]); ci += 2; }
          else if (code === OPS.lineTo) { addPoint(coords[ci], coords[ci + 1]); ci += 2; }
          else if (code === OPS.curveTo) {
            if (sub?.length) {
              const p0 = sub[sub.length - 1];
              flattenCubic(p0, trans(coords[ci], coords[ci + 1]), trans(coords[ci + 2], coords[ci + 3]), trans(coords[ci + 4], coords[ci + 5]), sub);
            }
            ci += 6;
          } else if (code === OPS.curveTo2) { // v：第一控制点 = 当前点
            if (sub?.length) {
              const p0 = sub[sub.length - 1];
              flattenCubic(p0, p0, trans(coords[ci], coords[ci + 1]), trans(coords[ci + 2], coords[ci + 3]), sub);
            }
            ci += 4;
          } else if (code === OPS.curveTo3) { // y：第二控制点 = 终点
            if (sub?.length) {
              const p0 = sub[sub.length - 1];
              const p3 = trans(coords[ci + 2], coords[ci + 3]);
              flattenCubic(p0, trans(coords[ci], coords[ci + 1]), p3, p3, sub);
            }
            ci += 4;
          } else if (code === OPS.closePath) { closeSubpath(); }
          else if (code === OPS.rectangle) {
            const [x, y, w, h] = coords.slice(ci, ci + 4);
            sub = null; addPoint(x, y); addPoint(x + w, y); addPoint(x + w, y + h); addPoint(x, y + h); closeSubpath();
            ci += 4;
          }
        }
        continue;
      }
      if (fn === OPS.moveTo) { sub = null; addPoint(args[0] as number, args[1] as number); continue; }
      if (fn === OPS.lineTo) { addPoint(args[0] as number, args[1] as number); continue; }
      if (fn === OPS.closePath) { closeSubpath(); continue; }
      if (fn === OPS.rectangle) {
        const [x, y, w, h] = args as number[];
        sub = null; addPoint(x, y); addPoint(x + w, y); addPoint(x + w, y + h); addPoint(x, y + h); closeSubpath();
        continue;
      }
      if (fn === OPS.curveTo) {
        if (sub?.length) {
          const p0 = sub[sub.length - 1];
          flattenCubic(p0, trans(args[0] as number, args[1] as number), trans(args[2] as number, args[3] as number), trans(args[4] as number, args[5] as number), sub);
        }
        continue;
      }
      if (fn === OPS.curveTo2) { // v：第一控制点 = 当前点
        if (sub?.length) {
          const p0 = sub[sub.length - 1];
          flattenCubic(p0, p0, trans(args[0] as number, args[1] as number), trans(args[2] as number, args[3] as number), sub);
        }
        continue;
      }
      if (fn === OPS.curveTo3) { // y：第二控制点 = 终点
        if (sub?.length) {
          const p0 = sub[sub.length - 1];
          const p3 = trans(args[2] as number, args[3] as number);
          flattenCubic(p0, trans(args[0] as number, args[1] as number), p3, p3, sub);
        }
        continue;
      }
      if (fn === OPS.stroke) { flush('stroke', false); continue; }
      if (fn === OPS.closeStroke) { closeSubpath(); flush('stroke', true); continue; }
      if (fn === OPS.fillStroke || fn === OPS.eoFillStroke) { flush('fillStroke', false); continue; }
      if (fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) { closeSubpath(); flush('fillStroke', true); continue; }
      if (fn === OPS.fill || fn === OPS.eoFill) { flush('fill', true); continue; } // 纯填充不提取线条（避免字体轮廓杂乱）
      if (fn === OPS.endPath) { flush('none', false); continue; }
      // 其余算子（文本、图像、Form 标记等）不直接产生矢量路径；Form 内容已内联在算子流中。
    }
    flush('none', false);
    return results;
  }

  async function renderPageImage(num: number, scale = 2): Promise<{ dataUrl: string; w: number; h: number; pxW: number; pxH: number }> {
    const page = await doc!.getPage(num);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const info = pages[num - 1];
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), w: info.w, h: info.h, pxW: canvas.width, pxH: canvas.height };
  }

  return {
    numPages: doc.numPages,
    pages,
    warnings,
    mode: usedMode,
    extractPageVectors,
    renderPageImage,
    destroy: async () => { await doc!.destroy(); },
  };
}
