import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * ブラウザ／PWA 向けのビルド。Electron 版と同じ renderer をそのまま Web に出す。
 *
 * GitHub Pages のようにサブパスに置く場合は WEB_BASE=/excella/ のように渡す
 * （manifest の start_url や Service Worker のスコープもこれに合わせる）。
 */
const base = process.env['WEB_BASE'] ?? '/'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default defineConfig({
  root: resolve('src/renderer'),
  base,
  publicDir: resolve('src/renderer/public'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Excella',
        short_name: 'Excella',
        description: 'Excel ライクな表計算アプリ',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f3f3',
        theme_color: '#107c41',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // インストール後は xlsx / csv を「このアプリで開く」に出せる（対応ブラウザのみ）
        file_handlers: [
          {
            action: base,
            accept: { [XLSX_MIME]: ['.xlsx'], 'text/csv': ['.csv', '.tsv'] },
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        // 数式エンジンのチャンクが 1.5 MB あるので既定の 2 MB より余裕を持たせる
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  build: {
    outDir: resolve('out/web'),
    emptyOutDir: true,
    // 数式エンジン（約 760 KB）と ExcelJS（約 940 KB、遅延読み込み）は分割済みなので
    // 既定の 500 KB 警告は意味を持たない
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          hyperformula: ['hyperformula'],
        },
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
