import { createApp } from 'vue';
import App from './App.vue';
import workerCode from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';
import { setPdfWorkerCode } from './model/pdfVector.ts';
import { state, addObject, selectObject, deleteSelected, openProjectText, restoreBackup } from './store.ts';
import { normalizeOpenings } from './model/wallLink.ts';
import { collect3D } from './model/threeScene.ts';
import { buildPdfBytes } from './model/exportPdf.ts';
import { serializeCanvasSvg } from './model/exportSvgPng.ts';

// PDF.js Worker 代码由构建时内联进单文件（?raw）；
// pdfVector 模块通过 setPdfWorkerCode 注入，Node 测试时由测试文件自行注入。
setPdfWorkerCode(workerCode);

createApp(App).mount('#app');

// 只读调试钩子（与 1.0.0 的 window.__rs 一致，供自动化测试用）。
(window as unknown as { __rs: unknown }).__rs = {
  get objects() { return state.doc.objects; },
  get view() { return state.doc.view; },
  get state() { return state; },
  addObject, selectObject, deleteSelected, normalizeOpenings,
  openProjectText, restoreBackup,
  collect3D, buildPdfBytes, serializeCanvasSvg,
};
