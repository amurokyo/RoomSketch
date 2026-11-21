// RoomSketch 2.0.2 — 六项升级回归测试
// 覆盖：图层过滤/顺序/锁定、房间分区统计、家具布设与对齐、
// 扫描图连通域净化、PDF 逐页清理/文字簇/小路径抢救。
import { normalizeLayers, normalizeLayerOrder, layerForObject, orderedVisibleObjects } from '../src/model/layers.ts';
import { collectRoomStats, formatArea } from '../src/model/rooms.ts';
import { furniturePlacement, alignFurniture, furnitureOverlap } from '../src/model/furniturePlacement.ts';
import { cleanRasterPixels } from '../src/model/rasterCleanup.ts';
import { detectPdfMarkup, DEFAULT_PDF_CLEANUP } from '../src/model/pdfCleanup.ts';
import { validateProject } from '../src/model/project.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ---------- 图层 ----------
{
  const wall = { id: 'w', type: 'wall', x: 0, y: 0, points: [[0, 0], [100, 0]], wallWidth: 10 };
  const pdf = { id: 'p', type: 'pdf', x: 0, y: 0, points: [[0, 0], [10, 10]], pdfOrigin: true };
  const bg = { id: 'b', type: 'imagebg', x: 0, y: 0, w: 50, h: 50, src: 'x' };
  const room = { id: 'r', type: 'polyroom', x: 0, y: 0, points: [[0, 0], [10, 0], [10, 10]] };
  const doc = {
    objects: [wall, pdf, bg, room],
    layers: { ...normalizeLayers(null), background: { visible: false, locked: false } },
    layerOrder: ['background', 'pdf', 'rooms', 'walls', 'furniture', 'openings', 'annotations'],
  };
  check('默认图层顺序补齐', JSON.stringify(normalizeLayerOrder(['walls', 'pdf'])) === JSON.stringify(['walls', 'pdf', 'background', 'rooms', 'furniture', 'openings', 'annotations']), JSON.stringify(normalizeLayerOrder(['walls', 'pdf'])));
  check('图层归属正确', layerForObject(bg) === 'background' && layerForObject(pdf) === 'pdf' && layerForObject(room) === 'rooms' && layerForObject(wall) === 'walls');
  const visible = orderedVisibleObjects(doc);
  check('隐藏图层被过滤且保持图层叠放顺序', visible.length === 3 && visible[0].id === 'p' && visible[1].id === 'r' && visible[2].id === 'w', JSON.stringify(visible.map(o => o.id)));
  doc.layers.pdf.locked = true;
  check('锁定不影响可见性', orderedVisibleObjects(doc).length === 3);
  const validated = validateProject({ format: 'roomsketch', objects: [wall], layers: { walls: { visible: false, locked: true } }, layerOrder: ['walls'] });
  check('工程校验补齐图层字段', validated.ok && validated.doc.layers.walls.visible === false && validated.doc.layers.walls.locked === true && validated.doc.layerOrder.length === 7, JSON.stringify(validated.doc.layerOrder));
}

// ---------- 房间统计 ----------
{
  const room = (id, x, label, zone, include = true) => ({
    id, type: 'polyroom', x, y: 0,
    points: [[x, 0], [x + 1000, 0], [x + 1000, 1000], [x, 1000]],
    label, zone, includeInTotal: include, fill: '#ff0000',
  });
  const stats = collectRoomStats([room('a', 0, 'A 室', '办公区'), room('b', 1000, 'B 室', '休息区', false), room('c', 2000, 'C 室', '办公区')]);
  check('房间数量只计有效多边形', stats.rooms.length === 3 && stats.count === 2);
  check('未计入统计的房间不进总面积', approx(stats.totalMm2, 2e6), String(stats.totalMm2));
  check('分区小计正确', stats.zones.length === 1 && stats.zones[0].zone === '办公区' && stats.zones[0].count === 2, JSON.stringify(stats.zones));
  check('面积格式化', formatArea(2e6) === '2.00 m²', formatArea(2e6));
}

// ---------- 家具布设 ----------
{
  const place = furniturePlacement({ x: 1000, y: 1000 }, { x: 1010, y: 1010 }, 2000, 1000, 20);
  check('轻点按标准尺寸居中放置', !place.dragged && approx(place.x, 0) && approx(place.y, 500) && approx(place.w, 2000) && approx(place.h, 1000), JSON.stringify(place));
  const drag = furniturePlacement({ x: 1000, y: 1000 }, { x: 3000, y: 2000 }, 2000, 1000, 20);
  check('拖动按实际区域放置', drag.dragged && approx(drag.x, 1000) && approx(drag.y, 1000) && approx(drag.w, 2000) && approx(drag.h, 1000), JSON.stringify(drag));
  const current = { id: 'f1', type: 'furniture', x: 0, y: 0, w: 1000, h: 500 };
  const other = { id: 'f2', type: 'furniture', x: 2000, y: 0, w: 1000, h: 500 };
  const aligned = alignFurniture(current, 2020, 0, [current, other], 30);
  check('家具移动吸附另一件左边线', approx(aligned.x, 2000) && approx(aligned.y, 0), JSON.stringify(aligned));
  const current2 = { id: 'f3', type: 'furniture', x: 5000, y: 0, w: 1000, h: 500 };
  check('重叠检测', furnitureOverlap(current2, [current, other]) === false);
  check('重叠检测命中', furnitureOverlap({ ...current2, x: 2100 }, [current, other]) === true);
}

// ---------- 扫描图净化 ----------
{
  const W = 20, H = 12, data = new Uint8ClampedArray(W * H * 4).fill(255);
  const put = (x, y, v = 0) => { const i = (y * W + x) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255; };
  for (let y = 4; y < 11; y++) for (let x = 1; x < 19; x++) put(x, y); // 最大主体
  for (let y = 0; y < 2; y++) for (let x = 16; x < 18; x++) put(x, y); // 小文字块（与主体留白隔开）
  const r = cleanRasterPixels(data, W, H, { threshold: 175, minComponent: 2, maxGlyphSize: 3 });
  check('最大主体保留', r.kept === 1 && r.removedGlyphs === 1, JSON.stringify({ kept: r.kept, removedGlyphs: r.removedGlyphs }));
  const center = (6 * W + 5) * 4;
  check('主体像素转深色', r.data[center] === 45 && r.data[center + 1] === 55 && r.data[center + 2] === 72);
  const corner = (0 * W + 0) * 4;
  check('背景转白色', r.data[corner] === 255 && r.data[corner + 1] === 255 && r.data[corner + 2] === 255);
  check('深色底图自动反色判定', r.inverted === false);
}

// ---------- PDF 清理 ----------
function line(id, p0, p1, color, page = undefined) {
  const o = { id, type: 'pdf', x: 0, y: 0, points: [p0, p1], stroke: 0.3, strokeColor: color, pdfStrokeColor: color, pdfOrigin: true };
  if (page !== undefined) o.pdfPage = page;
  return o;
}
{
  const objs = [
    line('frame', [0, 0], [100, 0], '#000000'),
    { id: 'frame2', type: 'pdf', x: 0, y: 0, points: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], stroke: 0.3, pdfStrokeColor: '#000000', pdfOrigin: true },
  ];
  for (let i = 0; i < 25; i++) objs.push(line(`c${i}`, [i * 2, 50], [i * 2 + 20, 50], '#ff0000'));
  for (let i = 0; i < 10; i++) objs.push(line(`t${i}`, [2 + i * 0.45, 5], [2.6 + i * 0.45, 5.4], '#333333'));
  const r = detectPdfMarkup(objs, { w: 100, h: 100 }, { ...DEFAULT_PDF_CLEANUP, mode: 'balanced' });
  check('清理命中页面边框和文字', r.count > 10 && r.details.removedFrame === 1, JSON.stringify(r.details));
  check('默认保留主体外的彩色房间结构', r.details.removedOutside === 0, JSON.stringify(r.details));
  check('文字簇被识别', r.details.removedBlack >= 10, JSON.stringify(r.details));
  check('主体存在', r.details.coreFound === true);
  const ids = new Set(r.ids);
  check('红色主体线不被误删', objs.filter(o => o.pdfStrokeColor === '#ff0000').every(o => !ids.has(o.id)));
}
{
  const objs = [line('major', [50, 50], [70, 50], '#ff0000')];
  for (let i = 0; i < 25; i++) objs.push(line(`m${i}`, [i * 2, 20], [i * 2 + 20, 20], '#ff0000'));
  for (let i = 0; i < 8; i++) objs.push(line(`touch${i}`, [70, 50], [71 + i * 0.08, 51 + i * 0.08], '#ff8800'));
  objs.push(line('neutral-touch', [70, 50], [71, 51], '#333333'));
  const r = detectPdfMarkup(objs, { w: 100, h: 100 }, { ...DEFAULT_PDF_CLEANUP, mode: 'balanced' });
  const touchIds = Array.from({ length: 8 }, (_, i) => `touch${i}`);
  check('连接主结构的彩色小路径被抢救', r.details.rescuedSmall >= 8 && touchIds.every(id => !r.ids.includes(id)), JSON.stringify(r.details));
  check('判定为文字层的中性色整色删除', r.ids.includes('neutral-touch'), JSON.stringify(r.details));
  const r2 = detectPdfMarkup(objs, { w: 100, h: 100 }, { ...DEFAULT_PDF_CLEANUP, mode: 'balanced', preserveConnected: false });
  check('关闭抢救后彩色小路径可删', touchIds.every(id => r2.ids.includes(id)));
}
{
  const objs = [
    { id: 'f1', type: 'pdf', x: 0, y: 0, points: [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]], pdfStrokeColor: '#000000', pdfOrigin: true, pdfPage: 1 },
    { id: 'f2', type: 'pdf', x: 100, y: 100, points: [[100, 100], [180, 100], [180, 180], [100, 180], [100, 100]], pdfStrokeColor: '#000000', pdfOrigin: true, pdfPage: 2 },
  ];
  const r = detectPdfMarkup(objs, { w: 80, h: 80 }, { ...DEFAULT_PDF_CLEANUP, removeFrames: true }, { '1': { w: 80, h: 80 }, '2': { w: 80, h: 80 } });
  check('逐页页面边框均可清理', r.details.removedFrame === 2 && r.count === 2, JSON.stringify(r.details));
}

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
