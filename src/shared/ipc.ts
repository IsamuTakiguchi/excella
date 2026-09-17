import type { WorkbookModel } from './model'

/** ネイティブメニューから renderer へ送るアクション */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-csv'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'select-all'
  | 'toggle-merge'
  | 'toggle-freeze'

export type OpenResult = {
  path: string
  /** 表示用のファイル名 */
  name: string
  model: WorkbookModel
}

export type SaveResult = {
  path: string
  name: string
}

/**
 * renderer で計算済みの数式結果。xlsx に result として埋め込むと
 * Excel で開いた直後から値が見える。[sheetId, [[A1, 値], ...]] の形。
 */
export type SerializedResults = Array<[string, Array<[string, string | number | boolean]>]>

/** preload が contextBridge で公開する API */
export type ExcellaApi = {
  /** ダイアログでファイルを選ばせて読み込む。キャンセルなら null */
  openWorkbook(): Promise<OpenResult | null>
  /** path が null なら「名前を付けて保存」。キャンセルなら null */
  saveWorkbook(
    path: string | null,
    model: WorkbookModel,
    results?: SerializedResults,
  ): Promise<SaveResult | null>
  /** アクティブシートを CSV として書き出す。キャンセルなら null */
  exportCsv(
    model: WorkbookModel,
    sheetId: string,
    displayValues?: Array<[string, string]>,
  ): Promise<SaveResult | null>
  /** 未保存かどうかを main に伝える（閉じる前の確認に使う） */
  setDirty(dirty: boolean): void
  /** ネイティブメニューのアクションを購読する。戻り値で解除 */
  onMenu(handler: (action: MenuAction) => void): () => void
  /**
   * 関連付けやコマンドライン引数から開かれたファイルを受け取る。
   * ダイアログ経由ではなく main 側から一方的に届く点が openWorkbook と異なる。
   */
  onOpenFile(handler: (result: OpenResult) => void): () => void
}

export const IPC = {
  openWorkbook: 'workbook:open',
  saveWorkbook: 'workbook:save',
  exportCsv: 'workbook:export-csv',
  setDirty: 'app:set-dirty',
  menu: 'app:menu',
  openedExternally: 'workbook:opened',
} as const
