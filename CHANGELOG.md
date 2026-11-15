# CHANGELOG

## 2.0.0 — 2026-11-15

Vue 3 + PDF.js + Three.js 重构版。单文件、纯离线、`file://` 双击可运行；工程文件格式 `schemaVersion: 1` 不变，1.0.0 工程与旧版 `{app: "RoomSketch", version: 2}` 工程均可打开，保存时自动升级为 2.0.0 格式。

### 新增

- **三维渲染改用 Three.js / WebGL**：墙体 Shape + 窗洞 Extrude、门窗真实开口（门洞留空 + 2100mm 过梁，窗洞 900mm 窗台 + 1300mm 玻璃 + 过梁）、房间地板、家具 Box/Cylinder 体块；手动轨道（拖拽旋转 / 滚轮缩放 / 重置 / Esc 关闭），初视角 yaw 35° / pitch 32° 与 1.0.0 一致；开口校验逐条警告（关联失效 / 段号越界 / wallT 无效 / 超出墙段 / 同段重叠）。
- **三维异常隔离**：先算可渲染对象再建遮罩，空画布显示提示不留空白层；WebGL 不可用或渲染失败时降级显示几何统计与开口警告，二维编辑不受影响；顶栏列出未在 3D 中显示的对象类型及数量。
- **统一导出对话框**：PNG / SVG / PDF 同一入口（范围 view/all、隐藏网格、PNG 分辨率 1600/3200/6400、PDF 纸张 A4/A3 + 方向 + 比例）；空画布禁用开始导出；失败只在框内提示。
- **矢量 PDF 写入器**（移植 1.0.0 手写实现）：纯函数内容流 + xref 偏移表 + canvas 文字遮罩；修正 1.0.0 的描边颜色漏 `RG` 算子 bug（描边曾恒为黑色）。
- **PDF 多页导入**：多页 PDF 逐页勾选（默认全选），逐页提取矢量、按页偏移排布；pdf.js 4.x 的 constructPath 打包算子、0–255 颜色、Form XObject 内联、v/y 贝塞尔规范展平；无矢量页转图片底图；Worker 优先 Blob、失败回退主线程（`workerSrc=''` 不是有效回退）。
- **保存与兼容收尾**：备份逐项验形（损坏备份视为无备份）、恢复经 `validateProject` 全量校验（损坏备份不碰当前工程并清除）；1.0.0 自动备份（同 key）可在 2.0.0 启动时确认恢复；存储被禁时备份失败提示、保存/打开仍可用。

### 修复（相对 1.0.0）

- **3D 相机取景**：Z 朝上场景须设 `camera.up=(0,0,1)`，否则默认 up=(0,1,0) 导致画面倾斜裁切。
- **布局**：`.app` 用 `height:100vh + overflow:hidden`（`min-height:100vh` 会把画布撑到 1852px 高、fitView 失真）；移动端 ≤900px 恢复可滚动。
- **自检文案**：PDF 模式按 `loadPdfDocument` 返回的实际 mode 显示（不再按 `typeof Worker` 推断）。
- **ResizeObserver 守卫**：无该 API 的环境（jsdom/极旧浏览器）挂载钩子不再抛错，退化为初始尺寸。
- **家具图库文案**：实数为 39 件（6 类），1.0.0 README 的「40+」不准确，已更正。

### 交付

- `RoomSketch-2.0.0.html`（与 `dist/index.html` 内容相同，2,535,640 字节）
- `RoomSketch-2.0.0-Offline.zip`（单文件应用 + README + CHANGELOG + LICENSE + THIRD-PARTY-LICENSES.md + SHA256SUMS.txt）
- `SHA256SUMS.txt`
- `ACCEPTANCE-2.0.0.md`（发布验收报告）

### 已知限制

- 2.0.0 不再是零依赖单文件：Vue 3 + pdfjs-dist + three 内联进产物，体积 129KB → 约 2.5MB（离线能力不变，仍零 CDN、零运行时网络请求）。
- 3D 渲染需 WebGL；不支持 WebGL 的环境只显示降级统计，不可交互旋转。
- PDF 导入不提取纯填充图形（无描边路径不生成线条对象）。
- 房间面积文字可能被后添加的家具不透明填充盖住（对象顺序绘制，与 1.0.0 相同）。

## 1.0.0 — 2026-11-15

首个正式公开发行版本（零依赖单文件，Canvas 2D 轴测）。详见主线仓库 `CHANGELOG.md`。

- 版本统一 1.0.0；工程文件格式 `{format: "roomsketch", schemaVersion: 1, appVersion: "1.0.0"}`，旧版 `{app: "RoomSketch", version: 2}` 兼容。
- 旋转包围盒、3D 先算对象再建遮罩、PDF 多页提示、保存状态与备份分离、备份可靠性、门窗与墙体关联（wallId/wallSeg/wallT，3D 墙段按开口切分）。
