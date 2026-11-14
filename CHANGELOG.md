# CHANGELOG

## 1.0.0 — 2026-11-15

首个正式公开发行版本。此前所有版本均为内部开发和测试版本，不构成正式发行版本。

### 修复

- **版本统一**：页面标题、品牌、页脚、README、`VERSION` 统一为 `1.0.0`（此前页面显示为 2.0）。应用版本由 `index.html` 中的 `APP_VERSION` 单一来源管理。
- **工程文件格式**：改为 `{format: "roomsketch", schemaVersion: 1, appVersion: "1.0.0", metadata: {createdAt, updatedAt}, ...}`，应用版本与格式版本分离；旧版 `{app: "RoomSketch", version: 2}` 工程仍可打开，保存时自动升级；不支持的 `schemaVersion` 会明确报错，不再静默忽略。
- **旋转对象边界**：`objBounds()` 改为旋转包围盒（局部包围盒按 `rotation` 绕对象原点旋转后取轴对齐包围盒），与 `render()` 的 `translate + rotate` 使用同一变换；选框、适合窗口、通用框选、SVG/PNG 导出范围、PDF 框选全部共用该接口。旧的 `selectionBounds()` 二次旋转逻辑已删除。
- **3D 预览卡死**：先计算可渲染对象再创建遮罩层；画布只有标注、尺寸等不可 3D 化对象时不再留下一个关不掉的空白遮罩。3D 顶栏会列出未在 3D 中显示的对象类型及数量（如门、矩形、PDF 线条）。
- **PDF 导入提示**：多页 PDF 会明确提示“共 N 页，本次仅导入第 1 页”；含 Form XObject 的文件会提示其中矢量未提取，不再静默丢弃。
- **PDF 清理确认**：一键清除标注/文字前弹出确认框，列出待删总数及各类别数量，确认后才执行（仍可 Ctrl+Z 撤销）。
- **保存状态区分**：状态栏新增保存状态指示 —— `● 未保存更改 · 仅浏览器备份` / `○ 无未保存更改` / `已导出工程文件` / `⚠ 自动备份失败`。自动备份失败不再静默吞错，会提示立即导出工程文件；恢复条明确说明“缓存备份不是正式工程文件”。
- **备份可靠性**：启动时首次渲染不再算作“未保存更改”，无更改时不再写备份 —— 以前打开应用 900ms 后会自动把空画布写进备份，覆盖掉待恢复的旧备份；关闭未动过的画布也不再覆盖备份。无 `matchMedia` 的环境下启动不再中断。
- **测试**：新增 `tests/`（`node tests/test-bounds.mjs`、`node tests/check-offline.mjs` 无需依赖；`node tests/smoke.mjs`、`node tests/test-project-io.mjs` 需 jsdom），覆盖旋转包围盒、离线/版本一致性、页面加载冒烟、工程文件新旧格式兼容与非法文件拒绝。

### 已知限制（1.0.0 暂不解决，见后续版本）

- PDF 导入仅读取第 1 页；Form XObject、XRef 流等复杂结构不支持。
- 门/窗与墙体尚未建立关联（不存 `wallId`）；3D 预览中门不显示，窗为独立玻璃体块而非墙体开口。
- 旋转后的矩形/家具对象显示正确的旋转包围盒，但暂不提供角点缩放手柄（避免按错方向缩放）。
- 3D 预览为 Canvas 2D 轴测渲染，非 Three.js / WebGL。

### 交付

- `index.html`（与 `RoomSketch-1.0.0.html` 内容相同）
- `RoomSketch-1.0.0.html`
- `RoomSketch-1.0.0-Offline.zip`（单文件应用 + README + CHANGELOG + LICENSE + THIRD-PARTY-LICENSES.txt）
- `SHA256SUMS.txt`
