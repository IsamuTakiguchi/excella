import type { ExcellaApi } from '@shared/ipc'

/**
 * preload が読み込めなかった場合でも UI が白画面にならないようにするフォールバック。
 * ファイル入出力だけが使えない状態で、編集と計算は動く。
 */
const unavailable: ExcellaApi = {
  openWorkbook: async () => null,
  saveWorkbook: async () => null,
  exportCsv: async () => null,
  setDirty: () => {},
  onMenu: () => () => {},
  onOpenFile: () => () => {},
}

const injected =
  typeof window === 'undefined'
    ? undefined
    : (window as unknown as { excella?: ExcellaApi }).excella

export const bridge: ExcellaApi = injected ?? unavailable

/** ファイル入出力が使えるか（使えないときは UI にその旨を出す） */
export const hasFileAccess = injected !== undefined
