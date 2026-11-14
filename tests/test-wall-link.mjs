// RoomSketch 1.0.0 — 门窗与墙体关联测试（jsdom）
// 用法：先装 jsdom（npm install --no-save jsdom），再 node tests/test-wall-link.mjs
// 覆盖：贴墙吸附（wallId/seg/t）、墙移动与改形时门窗跟随、删墙转待关联、
// 旧工程门窗无 wallId 可重新吸附、3D 墙段按开口切分（门洞过梁、窗台/玻璃/过梁）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('SKIP: 需要先安装 jsdom（npm install --no-save jsdom）'); process.exit(0); }

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf-8');
const dom = new JSDOM(html, { url: 'file:///roomsketch/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const { document, window } = dom.window;
await new Promise(r => setTimeout(r, 200));
const rs = window.__rs;
let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const approx = (a, b) => Math.abs(a - b) < 0.01;
const find = id => rs.objects.find(o => o.id === id);

// 1. 墙 + 门，贴墙吸附
rs.addObject({ type: 'wall', x: 0, y: 0, points: [[0, 0], [4000, 0]], wallWidth: 120, strokeColor: '#29394c' });
const wall = rs.objects[rs.objects.length - 1];
rs.addObject({ type: 'door', x: 1000, y: 0, w: 900, rotation: 0, dir: 1, stroke: 10, strokeColor: '#344b64' });
const door = rs.objects[rs.objects.length - 1];
check('门吸附到墙', rs.tryAttach(door) === true, `wallId=${door.wallId} seg=${door.wallSeg} t=${door.wallT}`);
check('吸附锚点 t=0.25', approx(door.wallT, 0.25) && door.wallSeg === 0 && door.wallId === wall.id);
check('吸附后位置在墙线上', approx(door.x, 1000) && approx(door.y, 0) && approx(door.rotation, 0));

// 2. 墙整体移动 → 门跟随
wall.x = 500; rs.syncWallOpenings(wall);
check('墙右移 500，门跟随到 1500', approx(door.x, 1500) && approx(door.y, 0), `x=${door.x}`);
wall.y = 200; rs.syncWallOpenings(wall);
check('墙下移 200，门跟随到 y=200', approx(door.y, 200));

// 3. 墙顶点改形 → 门按同一 t 跟随
wall.points[1] = [5000, 0]; rs.syncWallOpenings(wall);
check('墙段拉长到 5000，门仍在 25% 处', approx(door.x, 500 + 0.25 * 5000), `x=${door.x}`);

// 4. 删墙 → 门转待关联（保留在原位）
rs.selectObject(wall.id); rs.deleteSelected();
check('墙已删除', !find(wall.id));
check('门保留在原位且已脱离', find(door.id) && door.wallId == null && approx(door.x, 1750), `wallId=${door.wallId} x=${door.x}`);

// 5. 旧工程兼容：无 wallId 的门可重新吸附
rs.addObject({ type: 'wall', x: 0, y: 1000, points: [[0, 0], [4000, 0]], wallWidth: 120, strokeColor: '#29394c' });
const wall2 = rs.objects[rs.objects.length - 1];
rs.addObject({ type: 'window', x: 2000, y: 1000, w: 1200, rotation: 0, stroke: 12, strokeColor: '#3178aa' });
const win = rs.objects[rs.objects.length - 1];
check('旧门窗无 wallId', win.wallId == null);
check('重新吸附成功', rs.tryAttach(win) === true && win.wallId === wall2.id && approx(win.wallT, 0.5));
rs.addObject({ type: 'door', x: 1000, y: 1000, w: 900, rotation: 0, dir: 1, stroke: 10, strokeColor: '#344b64' });
const door2 = rs.objects[rs.objects.length - 1];
rs.tryAttach(door2);

// 6. 3D：墙段按开口切分（wall2：门 t=0.25 w=900，窗 t=0.5 w=1200）
// 段长 4000：门 [0.25,0.475]，窗 [0.5,0.8]
// 应产出：间隙[0,.25] + 门过梁 + 间隙[.475,.5] + 窗台 + 玻璃 + 窗过梁 + 间隙[.8,1] = 7 个墙体
const data = rs.r3dCollect();
const glass = data.walls.filter(w => w.glass);
const lintelDoor = data.walls.filter(w => !w.glass && w.z0 === 2100);
const lintelWin = data.walls.filter(w => !w.glass && w.z0 === 2200);
const sill = data.walls.filter(w => !w.glass && w.z0 === 0 && w.hgt === 900);
check('3D 墙段切出 7 段', data.walls.length === 7, `walls=${data.walls.length}`);
check('3D 窗玻璃 1 块（z0=900，高 1300）', glass.length === 1 && glass[0].z0 === 900 && glass[0].hgt === 1300);
check('3D 门洞过梁 1 段（z0=2100）', lintelDoor.length === 1 && lintelDoor[0].hgt === 700);
check('3D 窗洞过梁 1 段（z0=2200）', lintelWin.length === 1 && lintelWin[0].hgt === 600);
check('3D 窗台 1 段（高 900）', sill.length === 1);

// 7. 未关联的窗在 3D 中仍单独成玻璃块；未关联的门不参与
rs.addObject({ type: 'window', x: 3000, y: 3000, w: 1000, rotation: 0, stroke: 12, strokeColor: '#3178aa' });
const data2 = rs.r3dCollect();
check('未关联窗仍有独立玻璃块', data2.walls.filter(w => w.glass).length === 2, `glass=${data2.walls.filter(w => w.glass).length}`);

// 8. 方向键滑动：关联门沿墙滑动不脱离
door2.x = 1100; rs.slideOpening(door2);
check('门沿墙滑动到 t=0.275', approx(door2.wallT, 0.275) && approx(door2.x, 1100) && door2.wallId === wall2.id, `t=${door2.wallT}`);

if (failures) { console.error(`${failures} 项失败`); process.exit(1); }
console.log('全部通过');
