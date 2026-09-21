import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // sandbox: true の preload は ESM を読めないので必ず CommonJS で出す
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
        output: {
          // 数式エンジンは 2 MB 超あり、アプリ本体のコードと一緒にすると
          // 単一チャンクが巨大になる。ローカル読み込みなので実害は無いが、
          // 分けておくと差分更新とビルド警告の見通しが良くなる。
          manualChunks: {
            hyperformula: ['hyperformula'],
          },
        },
      },
    },
  },
})
