// RoomSketch 2.0.0 — SVG / PNG 导出（阶段五）
// SVG：克隆页面上已渲染的 #canvas（与屏幕所见同一份矢量），去掉交互层
// （#selection-ui 选中框/手柄、#draft 绘制草稿），按导出范围设 viewBox。
// 形状全部用 presentation 属性绘制（ObjectShape），不依赖页面 CSS，
// 因此独立 SVG 文件与 <img> 光栅化都能正确显示；仅注入一行字体样式。
// PNG：把 SVG 序列化 → blob: URL → Image → canvas → toBlob（全程离线）。
import { exportRectFor, type Bounds } from './geometry.ts';

export interface SvgExportOptions {
  hideGrid: boolean;
  /** 出图比例（1:N），用于 mm 尺寸换算 */
  printScale: number;
  /** 可选：覆盖 SVG 根元素的 width/height 属性（PNG 导出用像素值） */
  widthAttr?: string;
  heightAttr?: string;
}

const SVG_FONT_STYLE = 'text{font-family:system-ui,"Microsoft YaHei","PingFang SC",sans-serif}';

/**
 * 序列化画布 SVG。返回 null 表示找不到画布（调用方应提示失败，不静默导出空文件）。
 * 注意：克隆的是实时 DOM，导出前请确保 Vue 已完成当前帧渲染。
 */
export function serializeCanvasSvg(rect: Bounds, opts: SvgExportOptions): string | null {
  if (typeof document === 'undefined') return null;
  const svg = document.getElementById('canvas') as SVGSVGElement | null;
  if (!svg) return null;
  const all = svg.cloneNode(true) as SVGSVGElement;
  all.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  all.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  all.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  all.setAttribute('width', opts.widthAttr ?? `${Math.ceil(rect.w / opts.printScale)}mm`);
  all.setAttribute('height', opts.heightAttr ?? `${Math.ceil(rect.h / opts.printScale)}mm`);
  all.removeAttribute('class');
  all.querySelector('#selection-ui')?.remove();
  all.querySelector('#draft')?.remove();
  if (opts.hideGrid) all.querySelector('#gridBg')?.remove();
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = SVG_FONT_STYLE;
  all.insertBefore(style, all.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(all);
}

/** SVG 文本 → PNG Blob（像素宽高由调用方按导出范围算好传入）。 */
export function svgToPngBlob(svgXml: string, widthPx: number, heightPx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = widthPx;
        c.height = heightPx;
        const ctx = c.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('浏览器不支持 canvas 2d')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => {
          URL.revokeObjectURL(url);
          if (b) resolve(b);
          else reject(new Error('PNG 编码失败'));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 光栅化失败，可改用 SVG 导出')); };
    img.src = url;
  });
}

export { exportRectFor };
export type { Bounds };
