import type { ExcellaApi } from '@shared/ipc'
import { createWebBridge } from './webBridge'

/**
 * ファイル入出力の入口。
 *
 * - Electron では preload が `window.excella` に main プロセスへの橋を生やす。
 * - ブラウザ／PWA ではそれが無いので、ブラウザの API で同じ操作を提供する。
 *
 * どちらも同じ `ExcellaApi` なので、UI 側は実行環境を意識しない。
 */
/** window の無い環境（Node のテスト）向けの何もしない実装 */
const noop: ExcellaApi = {
  openWorkbook: async () => null,
  saveWorkbook: async () => null,
  exportCsv: async () => null,
  setDirty: () => {},
  onMenu: () => () => {},
  onOpenFile: () => () => {},
}

const hasWindow = typeof window !== 'undefined'
const injected = hasWindow ? (window as unknown as { excella?: ExcellaApi }).excella : undefined

export const bridge: ExcellaApi = injected ?? (hasWindow ? createWebBridge() : noop)

/** Electron の main プロセスとつながっているか */
export const isElectron = injected !== undefined

/**
 * Electron なのに preload が読めていない（画面が白くなる代わりに UI に警告を出す）。
 * ブラウザで動いているときは正常なので警告しない。
 */
export const preloadMissing =
  !isElectron && typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent)
