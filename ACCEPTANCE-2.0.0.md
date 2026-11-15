# RoomSketch 2.0.0 — 发布验收报告

验收日期：2026-11-15 · 验收范围：阶段五/六/七（发布除外：不打 tag、不建 Release、不推送）
原型目录：`~/workspace/roomsketch-prototype/` · 本地 git：`9f2e882`（阶段六）→ 本报告随阶段七提交

## 结论

**验收通过，发布包就绪。** 全部 244 项 Node 测试 + 26 项 file:// 冒烟 + 18 项 3D/导出实浏 + 9 项断网实浏全过，0 失败；单文件离线、版本一致、旧工程兼容、备份恢复、降级路径均已验证。发布（tag / Release / 推送）仍需用户另行明确授权。

## 交付物

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `RoomSketch-2.0.0.html`（= `dist/index.html`，字节相同） | 2,535,640 字节 | `2b97f8af0a835846a7e6343a4a4da9919514d7fe95ad2c18601948b7a5fde49e` |
| `RoomSketch-2.0.0-Offline.zip`（html + README + CHANGELOG + LICENSE + THIRD-PARTY-LICENSES.md + SHA256SUMS.txt） | 735K | `34dcd1121271f68f3ab18e2bb44640fd95c7430fcbaf2aba60195897e9549782` |
| `SHA256SUMS.txt`（包内 5 文件校验） | — | 解压后 `sha256sum -c` 全部 OK |
| `README.md` / `CHANGELOG.md` / `LICENSE`（MIT，主线复制）/ `THIRD-PARTY-LICENSES.md` | — | 见 SHA256SUMS.txt |

## 验证结果

### Node 测试（`npm test`，10 个文件，244 项，0 失败）

| 测试文件 | 内容 | 结果 |
| --- | --- | --- |
| `test-geometry.mjs` | 几何（旋转包围盒、投影、面积/质心） | 全过 |
| `test-model.mjs` | 工程校验、旧版升级、非法 schema 拒绝、历史、门窗贴墙 | 全过 |
| `test-pdf-vector.mjs` | PDF 矢量提取（constructPath、贝塞尔、Form XObject） | 全过 |
| `test-three.mjs` | 三维切分/校验/包围盒/孔洞/相机 up（Z 朝上） | 全过 |
| `test-export.mjs` | PDF 写入器（RG 回归、xref 逐项、ImageMask/JPEG）、旋转导出 | 全过 |
| `test-save-compat.mjs` | 保存↔打开往返、旧格式兼容、损坏拒绝、备份恢复、存储被禁降级 | 48 项全过 |
| `check-dist.mjs` | 单文件 < 5 MiB、零外部引用、版本一致（无 `1.0.0` 残留） | 全过 |
| `check-pdf.mjs` | 测试 PDF 2 页、Form XObject、文本可读 | 全过 |
| `check-jsdom.mjs` | jsdom 端到端（挂载、自检、SVG 序列化、3D 降级、导出、零网络） | 全过 |

注：阶段四遗留的 `src/wallGeometry.js` 与 `tests/check-three.mjs` 已删除——其覆盖被 `threeScene.ts` + `test-three.mjs` 取代，应用不引用该模块；删除后测试由 258 项变为 244 项（-14），无其他变化。

### 真实浏览器验证（headless Chromium 159，SwiftShader WebGL）

| 脚本 | 内容 | 结果 |
| --- | --- | --- |
| `/tmp/rs-browser/check-file.mjs` | file:// 冒烟：挂载、自检、PDF 主线程回退、零网络 | 26 项全过 |
| `/tmp/rs-browser/check-stage5.mjs` | 3D 实渲（门洞镂空+窗玻璃+床体，截图肉眼确认）、轨道拖拽/缩放、Esc 关闭、SVG/PNG/PDF 下载内容校验（PDF 含 ImageMask 与 RG）、空画布 3D 提示与导出禁用、0 http(s) 请求 | 18 项全过 |
| `/tmp/rs-browser/check-offline.mjs` | 浏览器级断网（context offline）：加载挂载、建墙贴门、3D 渲染、SVG 序列化、0 http(s) 请求 | 9 项全过 |

截图证据（`/tmp/rs-browser/`，临时目录）：`stage5-3d.png`（3D 等轴测，门洞+窗玻璃+床体+地板）、`stage5-3d-orbit.png`、`stage5-export.png`（PNG 导出）、`offline-3d.png`（断网 3D）、`stage5-results.json`、`offline-results.json`、`smoke-results.json`。

### 版本一致性

- 唯一版本号 2.0.0：`package.json`、`VERSION`、`src/version.ts`（APP_VERSION 单一常量）、README、CHANGELOG、构建产物、工程 JSON `appVersion`、`RoomSketch-2.0.0.html` 文件名。
- 构建产物含 `2.0.0` 3 处、含 `1.0.0` 0 处（`check-dist.mjs` 断言）；`schemaVersion` 保持 1。
- 依赖锁定（`--save-exact`）：vue 3.5.22、pdfjs-dist 4.10.38、three 0.182.0；构建期 vite 6.4.1、@vitejs/plugin-vue 6.0.11、vite-plugin-singlefile 2.3.0、typescript 5.9.3、pdf-lib 1.17.1、jsdom 31.0.1。

### 离线与依赖扫描

- 产物无外部 `<script>` / `<link>` / `<img>` / `@import` / `url(http)` / `fetch` 目标；出现的 `http(s)://` 字符串仅为 XML 命名空间标识符、许可证文本与库内报错文案链接，均不发起网络请求。
- 全程实测 0 个 http(s) 请求（file:// 冒烟、阶段五实浏、断网实浏三组独立验证）。
- 体积：2,535,640 字节（< 5 MiB 上限）；1.0.0 的 129KB → 2.5MB 是 Vue + PDF.js + Three.js 内联的代价，离线能力不变。

### 兼容性

- 旧版 `{app: "RoomSketch", version: 2}` 工程可打开（标记升级），1.0.0 新格式工程可打开，保存时统一升级为 2.0.0 格式；`schemaVersion: 99` / 非 JSON / 非 RoomSketch / 对象损坏均被拒且当前工程不动（端到端验证）。
- 1.0.0 自动备份（同 localStorage key `roomsketch-autobackup-v2`）可在 2.0.0 启动时确认恢复；损坏备份（objects 非数组 / 缺 type / 未来 schema / 非 JSON / 空数组）不出现恢复条、不报错；恢复经全量校验，损坏备份不碰当前工程并清除。
- 存储被禁时降级：备份失败状态 + 提示一次，保存/打开/导出仍可用。

### 1.0.0 已知坑核对（全部不重犯）

旋转包围盒 ✓、PDF 多页 ✓、3D 先算对象再建遮罩 ✓、保存/备份状态分离 ✓（端到端降级已验）、matchMedia 守卫 ✓、角点缩放 NaN ✓、旋转后手柄 ✓、顶点手柄忽略 rotation ✓、PDF 贝塞尔 v/y 展平 ✓、比例校准不缩放 wallHeight/furnH（保持 1.0.0 语义）✓。

## 验收中发现并已修的问题

1. **3D 相机 up 未设**：Z 朝上场景默认 `up=(0,1,0)` 导致画面倾斜裁切；`fitCameraToBox` 改设 `camera.up=(0,0,1)`，补 Node 测试，截图肉眼确认取景正确。
2. **备份验形缺失**：`readBackup` 只验 `objects?.length`，字符串 `"x"` 与 `schemaVersion: 99` 的备份可通过；现逐项验形。`restoreBackup` 曾信任备份内容，现经 `validateProject` 全量校验。
3. **ResizeObserver 无守卫**：`CanvasView` / `ThreeView` 在 jsdom/极旧环境挂载钩子抛错；现 `typeof` 守卫 + 初始尺寸兜底。
4. **死代码**：`src/wallGeometry.js` + `tests/check-three.mjs`（阶段四原型遗留，应用不引用）已删除。

## 未修 / 已知限制（不阻塞发布）

- 2.0.0 不再是零依赖单文件：体积 129KB → 约 2.5MB（Vue + PDF.js + Three.js 内联）。
- 3D 渲染需 WebGL；不支持 WebGL 的环境只显示降级统计，不可交互旋转。
- PDF 导入不提取纯填充图形（无描边路径不生成线条对象）。
- 房间面积文字可能被后添加的家具不透明填充盖住（对象顺序绘制，与 1.0.0 相同）。
- 实浏验证在 Linux headless Chromium 159 上完成，非 Windows 桌面版 Chrome/Edge GUI（与阶段四模拟结论一致）。

## 未完成（发布除外）

- **发布本身**：不打 tag、不建 Release、不推送——须用户另行明确授权。注意：v1.0.0 tag + Release 已存在（用户 2026-11-14 创建，打在原始提交 `74f0e14` 上，标 Latest，带 2 个附件），1.0.0 Release 保持原样；2.0.0 发布时按用户 2026-11-15 10:02 决定，以新版本号 2.0.0 发布。
- 主线 `~/workspace/roomsketch` 未动（main `9efdcb9`）；主线 `CHANGELOG.md`「已知限制」里门窗无关联的过时行是 1.0.0 主线的遗留，不在本轮修改范围。
