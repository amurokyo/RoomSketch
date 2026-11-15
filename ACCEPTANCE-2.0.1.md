# RoomSketch 2.0.1 — 发布验收报告

验收日期：2026-11-15 · 验收范围：划线预览冻结修复（2.0.0 → 2.0.1 补丁）
原型目录：`~/workspace/roomsketch-prototype/` · 本地 git：`5dcf132`（修复）→ 本报告随 2.0.1 提交

## 结论

**验收通过，发布包就绪。** 根因已定位并修复（`ObjectShape.vue` 解构 props 导致画面冻结在首帧）；`npm test` 全过；headless Chromium `file://` 实浏 6 项全过（墙 / 矩形 / 多边形房间 / 辅助线 / 尺寸标注预览均随鼠标更新，撤销后画面更新，深色模式可见）；0 网络请求。`schemaVersion` 仍为 1，2.0.0 与 1.0.0 工程均可打开。

## 交付物

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `RoomSketch-2.0.1.html`（= `dist/index.html`，字节相同） | 2,535,875 字节 | `0bfdc8d67fb16c527a08fa3d2c58478b54881369eb82ac0fe2f26466867b19e4` |
| `RoomSketch-2.0.1-Offline.zip`（html + README + CHANGELOG + LICENSE + THIRD-PARTY-LICENSES.md + SHA256SUMS.txt） | 753,004 字节 | `d0f31edd20cabcbf720a4a2ce6b3a7a1b155940c0f77184223214f2009125e9f` |
| `SHA256SUMS.txt`（包内 5 文件校验） | — | 解压后 `sha256sum -c` 全部 OK |

## 修复内容

- `src/components/ObjectShape.vue`：`const o = props.o` → `const o = computed(() => props.o)`，计算属性读 `o.value`，模板自动解包。绘制预览每帧换新对象、撤销 / 重做与打开工程换对象时，画面跟随最新 prop。
- 版本统一为 2.0.1：`VERSION`、`package.json`、`src/version.ts`（`APP_VERSION`）、`index.html` 标题、顶栏品牌、工程保存文件名与升级提示、README、CHANGELOG（新增 2.0.1 节）、测试断言。测试中保留两处 2.0.0 工程 JSON 作为向后兼容用例（2.0.1 打开 2.0.0 工程）。

## 验证结果

### Node 测试（`npm test`，10 个文件，0 失败）

全部通过。`check-dist` 含版本一致性（构建产物含 `RoomSketch 2.0.1`、无 `1.0.0` 残留、VERSION 与单一版本常量均为 2.0.1）。

### 真实浏览器验证（headless Chromium 159，`file://`）

脚本：`~/workspace/rs-browser/repro-draft.mjs`，6/6 通过：

| 检查 | 结果 |
| --- | --- |
| 墙体预览随鼠标更新（polyline 点位变化，正交锁定正常） | 通过 |
| 矩形预览随鼠标更新（4900×3200 → 5700×4000） | 通过 |
| 多边形房间预览随鼠标更新 | 通过 |
| 辅助线预览随鼠标更新 | 通过 |
| 尺寸标注预览随鼠标更新 | 通过 |
| 撤销后墙体从画面消失（对象数 4 → 3） | 通过 |

深色模式复核（`~/workspace/rs-browser/check-dark-draft.mjs`）：深色主题下墙体预览线蓝色可见（`#2874dc`，opacity 1），截图 `dark-mode-draft.png`。

### 已知限制（与 2.0.0 相同）

- 体积约 2.5MB（Vue 3 + pdfjs-dist + three 内联）；3D 需 WebGL；PDF 不提取纯填充图形；房间面积文字可能被后加家具盖住。
