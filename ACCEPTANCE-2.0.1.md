# RoomSketch 2.0.1 — 发布验收报告

验收日期：2026-11-15 · 验收范围：划线预览冻结修复（2.0.0 → 2.0.1 补丁）
原型目录：`~/workspace/roomsketch-prototype/` · 本地 git：`5dcf132`（修复）→ 本报告随 2.0.1 提交

## 结论

**验收通过，发布包就绪。** 根因已定位并修复（`ObjectShape.vue` 解构 props 导致画面冻结在首帧）；`npm test` 全过；headless Chromium `file://` 实浏 6 项全过（墙 / 矩形 / 多边形房间 / 辅助线 / 尺寸标注预览均随鼠标更新，撤销后画面更新，深色模式可见）；0 网络请求。`schemaVersion` 仍为 1，2.0.0 与 1.0.0 工程均可打开。

## 交付物

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `RoomSketch-2.0.1.html`（= `dist/index.html`，字节相同） | 2,535,901 字节 | `f2414327413cde0c238af42fdd93f2e9a5cd8bea61bc0022b91c687fa28b5ebb` |
| `RoomSketch-2.0.1-Offline.zip`（html + README + CHANGELOG + LICENSE + THIRD-PARTY-LICENSES.md + SHA256SUMS.txt） | 753,248 字节 | `9f8700f06e10e4c95e164ec1264d8d8808ae8c0d03bc31e2493a0e89879a4f34` |

注：2026-11-15 15:11 用户实测发现撤销 / 重做按钮点不动（快捷键正常），修复后重新打包，版本号仍为 2.0.1（见下）。此前已发布的 2.0.1 包（html 2,535,875 字节，sha256 `0bfdc8d6…`）已被本包取代。
| `SHA256SUMS.txt`（包内 5 文件校验） | — | 解压后 `sha256sum -c` 全部 OK |

## 修复内容

- `src/components/ObjectShape.vue`：`const o = props.o` → `const o = computed(() => props.o)`，计算属性读 `o.value`，模板自动解包。绘制预览每帧换新对象、撤销 / 重做与打开工程换对象时，画面跟随最新 prop。
- `src/model/history.ts`：撤销 / 重做按钮点不动——`History` 的两个栈是普通数组，`store` 的 `computed(() => history.undoDepth)` 永远不重算，按钮永久 disabled（快捷键直接调函数，不受影响）。两个栈改为响应式数组，清空时用 `length = 0` 而不换新数组。版本号保持 2.0.1 不变。
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

### 撤销 / 重做按钮（`~/workspace/rs-browser/repro-undoredo.mjs`，5/5 通过）

| 检查 | 结果 |
| --- | --- |
| 初始两按钮均为 disabled | 通过 |
| 画墙后撤销按钮可用、重做仍禁用 | 通过 |
| 点撤销按钮后墙消失、重做按钮可用 | 通过 |
| 点重做按钮后墙回来、撤销按钮可用 | 通过 |
| 再次点撤销按钮生效 | 通过 |

划线预览回归（`repro-draft.mjs`）：6/6 仍通过。

### 已知限制（与 2.0.0 相同）

- 体积约 2.5MB（Vue 3 + pdfjs-dist + three 内联）；3D 需 WebGL；PDF 不提取纯填充图形；房间面积文字可能被后加家具盖住。
