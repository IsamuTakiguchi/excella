import type { ExcellaApi, OpenResult, SaveResult } from '@shared/ipc'
import { csvToWorkbook, sheetToRows, stringifyCsv } from '@shared/csv'
import type { WorkbookModel } from '@shared/model'

/**
 * ブラウザ／PWA で動くときのファイル入出力。
 *
 * デスクトップ版は main プロセスがダイアログと fs を担当するが、ブラウザには
 * fs が無いので、
 *   - 開く：File System Access API（Chrome / Edge / Android Chrome）があればそれ、
 *           無ければ `<input type="file">`
 *   - 保存：開いたときのハンドルがあれば上書き、無ければ保存ダイアログ、
 *           それも無ければ（iOS Safari など）ダウンロード
 * という段階的な手段を使う。どの経路でも renderer が扱うのはバイト列だけ。
 *
 * xlsx の変換（ExcelJS）は 1 MB 近くあるので、初めて使うときに遅延読み込みする。
 */

/** Excel が CSV を UTF-8 と判定するために先頭へ付ける BOM */
const UTF8_BOM = String.fromCharCode(0xfeff)

const OPEN_ACCEPT = '.xlsx,.csv,.tsv'

type PickerType = { description?: string; accept: Record<string, string[]> }
type OpenPickerOptions = { multiple?: boolean; types?: PickerType[] }
type SavePickerOptions = { suggestedName?: string; types?: PickerType[] }
type LaunchParams = { files: FileSystemFileHandle[] }

/** lib.dom に無い（まだ標準化途中の）API の型 */
type WindowWithFs = Window & {
  showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>
  launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void }
}

const w = (): WindowWithFs => window as WindowWithFs

/** `path` → 上書き保存に使うハンドル。ブラウザにはパスが無いので名前で代用する */
const handles = new Map<string, FileSystemFileHandle>()
let handleSeq = 0

/** 同名のファイルを続けて開いても衝突しないように、ハンドルの鍵は連番付きにする */
function registerHandle(handle: FileSystemFileHandle, name: string): string {
  const path = `${++handleSeq}:${name}`
  handles.set(path, handle)
  return path
}

function displayName(path: string | null): string | null {
  if (!path) return null
  return path.replace(/^\d+:/, '')
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** `<input type="file">` で 1 つ選ばせる。キャンセルなら null */
function pickWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    const done = (file: File | null) => {
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => done(input.files?.[0] ?? null))
    // 新しめのブラウザはキャンセルも知らせてくれる（古いものは単に何も起きない）
    input.addEventListener('cancel', () => done(null))
    input.click()
  })
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 即時に revoke するとダウンロードが始まらないブラウザがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

async function writeHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

/**
 * バイト列を保存する。戻り値は次回の上書きに使う path（ダウンロードなら名前だけ）。
 * キャンセルなら null
 */
async function saveBytes(
  existingPath: string | null,
  suggestedName: string,
  blob: Blob,
  type: PickerType,
): Promise<SaveResult | null> {
  const existing = existingPath ? handles.get(existingPath) : undefined
  if (existing && existingPath) {
    await writeHandle(existing, blob)
    return { path: existingPath, name: existing.name }
  }
  const picker = w().showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker({ suggestedName, types: [type] })
      await writeHandle(handle, blob)
      return { path: registerHandle(handle, handle.name), name: handle.name }
    } catch (error) {
      if (isAbort(error)) return null
      throw error
    }
  }
  download(suggestedName, blob)
  return { path: suggestedName, name: suggestedName }
}

async function readFile(file: File, path: string): Promise<OpenResult> {
  const name = file.name
  const ext = name.toLowerCase().match(/\.(xlsx|csv|tsv)$/)?.[1] ?? 'xlsx'
  if (ext === 'csv' || ext === 'tsv') {
    const text = await file.text()
    return { path, name, model: csvToWorkbook(text, name.replace(/\.[^.]+$/, '')) }
  }
  const { workbookFromXlsxBuffer } = await import('@shared/xlsx')
  return { path, name, model: await workbookFromXlsxBuffer(await file.arrayBuffer()) }
}

function toResultMap(
  serialized: Parameters<ExcellaApi['saveWorkbook']>[2],
): Map<string, Map<string, string | number | boolean>> | undefined {
  if (!serialized) return undefined
  return new Map(serialized.map(([sheetId, entries]) => [sheetId, new Map(entries)]))
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLSX_TYPE: PickerType = { description: 'Excel ブック', accept: { [XLSX_MIME]: ['.xlsx'] } }
const CSV_TYPE: PickerType = { description: 'CSV', accept: { 'text/csv': ['.csv'] } }

let dirty = false

export function createWebBridge(): ExcellaApi {
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return
    // ブラウザ側の「離れますか？」ダイアログを出す
    e.preventDefault()
  })

  return {
    async openWorkbook() {
      const picker = w().showOpenFilePicker
      if (picker) {
        try {
          const [handle] = await picker({
            multiple: false,
            types: [
              {
                description: '表計算ファイル',
                accept: {
                  ...XLSX_TYPE.accept,
                  'text/csv': ['.csv'],
                  'text/tab-separated-values': ['.tsv'],
                },
              },
            ],
          })
          if (!handle) return null
          const file = await handle.getFile()
          return readFile(file, registerHandle(handle, file.name))
        } catch (error) {
          if (isAbort(error)) return null
          throw error
        }
      }
      const file = await pickWithInput(OPEN_ACCEPT)
      if (!file) return null
      return readFile(file, file.name)
    },

    async saveWorkbook(path, model, results) {
      const { xlsxBufferFromWorkbook } = await import('@shared/xlsx')
      const bytes = await xlsxBufferFromWorkbook(model, toResultMap(results))
      const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME })
      const current = displayName(path)
      const suggested = current && /\.xlsx$/i.test(current) ? current : 'book.xlsx'
      const saved = await saveBytes(path, suggested, blob, XLSX_TYPE)
      if (saved) dirty = false
      return saved
    },

    async exportCsv(model: WorkbookModel, sheetId, displayValues) {
      const sheet = model.sheets.find((s) => s.id === sheetId) ?? model.sheets[0]
      if (!sheet) return null
      const rows = sheetToRows(sheet, displayValues ? new Map(displayValues) : undefined)
      const blob = new Blob([`${UTF8_BOM}${stringifyCsv(rows)}`], { type: 'text/csv' })
      return saveBytes(null, `${sheet.name}.csv`, blob, CSV_TYPE)
    },

    setDirty(value) {
      dirty = value
    },

    // ネイティブメニューは無い。画面上のメニューは menuBus を通る
    onMenu: () => () => {},

    onOpenFile(handler) {
      // PWA の「ファイルを開くアプリ」として起動された場合（manifest の file_handlers）
      w().launchQueue?.setConsumer((params) => {
        void (async () => {
          const handle = params.files[0]
          if (!handle) return
          const file = await handle.getFile()
          handler(await readFile(file, registerHandle(handle, file.name)))
        })()
      })
      // ページにファイルをドロップしても開ける
      const onDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
      }
      const onDrop = (e: DragEvent) => {
        const file = e.dataTransfer?.files[0]
        if (!file) return
        e.preventDefault()
        void readFile(file, file.name).then(handler)
      }
      window.addEventListener('dragover', onDragOver)
      window.addEventListener('drop', onDrop)
      return () => {
        window.removeEventListener('dragover', onDragOver)
        window.removeEventListener('drop', onDrop)
      }
    },
  }
}
