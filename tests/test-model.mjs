// RoomSketch 2.0.1 — 数据模型 / 工程 IO / 历史 / 门窗关联测试
// 用法：node tests/test-model.mjs
// 覆盖：工程文件新格式校验、旧版 {app:'RoomSketch'} 升级、非法 schema 拒绝、
// 损坏文件拒绝、History 撤销/重做/上限、门窗贴墙与墙动跟随（移植 1.0.0 用例）。
import { createEmptyProject, validateProject, serializeProject } from '../src/model/project.ts';
import { History } from '../src/model/history.ts';
import { tryAttach, syncWallOpenings, detachWallOpenings, slideOpening, normalizeOpenings, WALL_SNAP_DIST } from '../src/model/wallLink.ts';
import { APP_VERSION, SCHEMA_VERSION } from '../src/version.ts';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const approx = (a, b) => Math.abs(a - b) < 0.01;

// ---------- 工程文件 ----------
const empty = createEmptyProject();
check('新工程 appVersion=2.0.1', empty.appVersion === '2.0.1' && empty.format === 'roomsketch', empty.appVersion);
check('新工程 schemaVersion=1', empty.schemaVersion === 1);
check('版本常量与源码一致', APP_VERSION === '2.0.1' && SCHEMA_VERSION === 1);

const good = validateProject(JSON.parse(serializeProject(empty)));
check('序列化后可重新校验', good.ok === true && good.doc?.appVersion === '2.0.1');

const old = validateProject({ app: 'RoomSketch', version: 2, objects: [{ id: 'o1', type: 'rect', x: 0, y: 0, w: 100, h: 100 }], counter: 5 });
check('旧版 {app:RoomSketch} 可打开并升级', old.ok === true && old.upgradedFromOld === true && old.doc?.appVersion === '2.0.1' && old.doc?.objects.length === 1);

check('不支持的 schemaVersion 被拒绝', validateProject({ format: 'roomsketch', schemaVersion: 99, objects: [] }).ok === false);
check('非 RoomSketch 文件被拒绝', validateProject({ format: 'other', objects: [] }).ok === false);
check('对象数据损坏被拒绝', validateProject({ format: 'roomsketch', schemaVersion: 1, objects: [{ noType: 1 }] }).ok === false);
check('非对象输入被拒绝', validateProject('nope').ok === false);
const missing = validateProject({ format: 'roomsketch', objects: [] });
check('缺失字段补安全默认值', missing.ok === true && missing.doc?.view.w === 12000 && missing.doc?.scale === 50);

// ---------- 历史 ----------
const h = new History();
const s1 = { objects: [], pdfImported: false, pdfPageSize: null, counter: 1 };
const s2 = { objects: [{ id: 'o1', type: 'rect', x: 0, y: 0, w: 100, h: 100 }], pdfImported: false, pdfPageSize: null, counter: 2 };
h.snapshot(s1);
const u1 = h.undo(s2);
check('撤销回到 s1', u1 !== null && u1.objects.length === 0 && h.canRedo);
const r1 = h.redo(u1);
check('重做回到 s2', r1 !== null && r1.objects.length === 1 && !h.canRedo);
h.snapshot(s1); h.snapshot(s2);
h.dropLastSnapshot();
check('dropLastSnapshot 丢弃误拍快照', h.undoDepth === 2, `depth=${h.undoDepth}`);
const h2 = new History();
for (let i = 0; i < 90; i++) h2.snapshot({ objects: [], pdfImported: false, pdfPageSize: null, counter: i });
check('历史上限 80 步', h2.undoDepth === 80);

// ---------- 门窗关联（移植 1.0.0 test-wall-link 用例 1-5、8） ----------
const wall = { id: 'w1', type: 'wall', x: 0, y: 0, points: [[0, 0], [4000, 0]], wallWidth: 120, strokeColor: '#29394c' };
const door = { id: 'd1', type: 'door', x: 1000, y: 0, w: 900, rotation: 0, dir: 1, stroke: 10, strokeColor: '#344b64' };
const objects = [wall, door];
check('门吸附到墙', tryAttach(objects, door) === true, `wallId=${door.wallId} seg=${door.wallSeg} t=${door.wallT}`);
check('吸附锚点 t=0.25', approx(door.wallT, 0.25) && door.wallSeg === 0 && door.wallId === 'w1');
check('吸附后位置在墙线上', approx(door.x, 1000) && approx(door.y, 0) && approx(door.rotation, 0));

wall.x = 500; syncWallOpenings(objects, wall);
check('墙右移 500，门跟随到 1500', approx(door.x, 1500) && approx(door.y, 0), `x=${door.x}`);
wall.y = 200; syncWallOpenings(objects, wall);
check('墙下移 200，门跟随到 y=200', approx(door.y, 200));

wall.points[1] = [5000, 0]; syncWallOpenings(objects, wall);
check('墙段拉长到 5000，门仍在 25% 处', approx(door.x, 500 + 0.25 * 5000), `x=${door.x}`);

// 删墙 → 门转待关联（保留在原位）
const idx = objects.indexOf(wall);
objects.splice(idx, 1);
const detached = detachWallOpenings(objects, 'w1');
check('删墙后门脱离并保留在原位', detached === 1 && door.wallId == null && approx(door.x, 1750), `wallId=${door.wallId} x=${door.x}`);

// 旧工程兼容：无 wallId 的窗可重新吸附
const wall2 = { id: 'w2', type: 'wall', x: 0, y: 1000, points: [[0, 0], [4000, 0]], wallWidth: 120, strokeColor: '#29394c' };
const win = { id: 'win1', type: 'window', x: 2000, y: 1000, w: 1200, rotation: 0, stroke: 12, strokeColor: '#3178aa' };
objects.push(wall2, win);
check('旧门窗无 wallId', win.wallId == null);
check('重新吸附成功', tryAttach(objects, win) === true && win.wallId === 'w2' && approx(win.wallT, 0.5));
const door2 = { id: 'd2', type: 'door', x: 1000, y: 1000, w: 900, rotation: 0, dir: 1, stroke: 10, strokeColor: '#344b64' };
objects.push(door2);
tryAttach(objects, door2);
door2.x = 1100; slideOpening(objects, door2);
check('门沿墙滑动到 t=0.275', approx(door2.wallT, 0.275) && approx(door2.x, 1100) && door2.wallId === 'w2', `t=${door2.wallT}`);

// normalizeOpenings：关联到不存在的墙 → 脱离
const ghost = { id: 'd3', type: 'door', x: 0, y: 0, w: 900, rotation: 0, dir: 1, wallId: 'nope', wallSeg: 0, wallT: 0.5 };
objects.push(ghost);
normalizeOpenings(objects);
check('关联到不存在的墙被脱离', ghost.wallId == null);
check('贴墙距离常量 600', WALL_SNAP_DIST === 600);

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
