import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [
    vue(),
    // 推荐单文件配置：内联全部 JS/CSS，移除 Vite 模块加载器
    viteSingleFile({ useRecommendedBuildConfig: true }),
  ],
  build: {
    // 测试 PDF 也以内联 base64 data URL 形式进包（2.6KB，可忽略）
    assetsInlineLimit: 100000000,
    target: 'es2020',
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  define: {
    // define 做文本替换：值必须是合法 JS 表达式；字符串要再包一层 JSON.stringify
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEP_VERSIONS__: JSON.stringify(JSON.stringify({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })),
  },
});
