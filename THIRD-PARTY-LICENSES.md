# RoomSketch 2.0.0 — 第三方依赖许可证清单

2.0.0 构建时（2026-11-15）锁定的版本，许可证类型取自各包的 `package.json` 的
`license` 字段。运行时依赖（进单文件产物）与构建/测试期依赖分开列出。

## 运行时依赖（打包进 dist/index.html）

| 依赖 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| vue | 3.5.22 | MIT | 响应式 UI 框架 |
| pdfjs-dist | 4.10.38 | Apache-2.0 | PDF 解析（legacy 构建，主线程 + Worker） |
| three | 0.182.0 | MIT | 三维墙体几何（Shape + holes + ExtrudeGeometry） |

## 构建依赖（不进运行时产物）

| 依赖 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| vite | 6.4.1 | MIT | 构建工具 |
| @vitejs/plugin-vue | 6.0.11 | MIT | Vue 单文件组件编译 |
| vite-plugin-singlefile | 2.3.0 | MIT | 单文件 HTML 内联（JS/CSS/资源） |
| typescript | 5.9.3 | Apache-2.0 | 类型检查（构建期） |
| pdf-lib | 1.17.1 | MIT | 仅用于生成测试 PDF（scripts/generate-test-pdf.mjs），不进产物 |
| jsdom | 31.0.1 | MIT | 仅用于 tests/check-jsdom.mjs，不进产物 |

## 说明

- 全部依赖通过 npm 本地安装并用 `--save-exact` 锁定版本（见 `package.json` 与
  `package-lock.json`）；运行时不下载任何依赖。
- 构建产物中包含的第三方代码均随其原许可证发布；MIT 与 Apache-2.0 均允许
  再分发，产物内保留了各库的许可证声明（例如 pdf.js 源码内的 Apache-2.0
  许可证全文）。
- 本产品自有代码（`src/` 下）随本包 LICENSE（MIT）发布。
- 产物扫描：无外部 `<script>`、`<link>`、`<img>`、`@import`、`url(http)`、
  `fetch` 目标；出现的 `http(s)://` 字符串仅为 XML 命名空间标识符、许可证
  文本与库内报错文案链接，均不发起网络请求（见 `tests/check-dist.mjs`）。
