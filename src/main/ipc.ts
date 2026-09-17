import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { IPC, type OpenResult, type SaveResult } from '../shared/ipc'
import { csvToWorkbook, sheetToRows, stringifyCsv } from '../shared/csv'
import type { WorkbookModel } from '../shared/model'
import { workbookFromXlsx, xlsxFromWorkbook } from './io/xlsx'

/** Excel が CSV を UTF-8 と判定するために先頭へ付ける BOM */
const UTF8_BOM = String.fromCharCode(0xfeff)

let mainWindow: BrowserWindow | null = null
let dirty = false

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
  win.on('close', (event) => {
    if (!dirty) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['保存せずに閉じる', 'キャンセル'],
      defaultId: 1,
      cancelId: 1,
      message: '保存していない変更があります',
      detail: '閉じると変更内容は失われます。',
    })
    if (choice === 1) event.preventDefault()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

/** 数式の計算結果（renderer 側で計算済みのもの）を Map に戻す */
type SerializedResults = Array<[string, Array<[string, string | number | boolean]>]>

function toResultMap(
  serialized: SerializedResults | undefined,
): Map<string, Map<string, string | number | boolean>> | undefined {
  if (!serialized) return undefined
  return new Map(serialized.map(([sheetId, entries]) => [sheetId, new Map(entries)]))
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.openWorkbook, async (): Promise<OpenResult | null> => {
    const win = mainWindow
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'ファイルを開く',
      properties: ['openFile'],
      filters: [
        { name: '表計算ファイル', extensions: ['xlsx', 'csv', 'tsv'] },
        { name: 'Excel ブック', extensions: ['xlsx'] },
        { name: 'CSV', extensions: ['csv', 'tsv'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const ext = extname(filePath).toLowerCase()
    const name = basename(filePath)

    if (ext === '.csv' || ext === '.tsv') {
      const text = await readFile(filePath, 'utf8')
      return { path: filePath, name, model: csvToWorkbook(text, basename(filePath, ext)) }
    }
    return { path: filePath, name, model: await workbookFromXlsx(filePath) }
  })

  ipcMain.handle(
    IPC.saveWorkbook,
    async (
      _event,
      givenPath: string | null,
      model: WorkbookModel,
      results?: SerializedResults,
    ): Promise<SaveResult | null> => {
      const win = mainWindow
      if (!win) return null
      let filePath = givenPath
      if (!filePath) {
        const result = await dialog.showSaveDialog(win, {
          title: '名前を付けて保存',
          defaultPath: 'book.xlsx',
          filters: [{ name: 'Excel ブック', extensions: ['xlsx'] }],
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }
      if (extname(filePath).toLowerCase() !== '.xlsx') filePath = `${filePath}.xlsx`
      await xlsxFromWorkbook(filePath, model, toResultMap(results))
      dirty = false
      return { path: filePath, name: basename(filePath) }
    },
  )

  ipcMain.handle(
    IPC.exportCsv,
    async (
      _event,
      model: WorkbookModel,
      sheetId: string,
      displayValues?: Array<[string, string]>,
    ): Promise<SaveResult | null> => {
      const win = mainWindow
      if (!win) return null
      const sheet = model.sheets.find((s) => s.id === sheetId) ?? model.sheets[0]
      if (!sheet) return null
      const result = await dialog.showSaveDialog(win, {
        title: 'CSV として書き出し',
        defaultPath: `${sheet.name}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (result.canceled || !result.filePath) return null
      const rows = sheetToRows(sheet, displayValues ? new Map(displayValues) : undefined)
      await writeFile(result.filePath, `${UTF8_BOM}${stringifyCsv(rows)}`, 'utf8')
      return { path: result.filePath, name: basename(result.filePath) }
    },
  )

  ipcMain.on(IPC.setDirty, (_event, value: boolean) => {
    dirty = value
    mainWindow?.setDocumentEdited?.(value)
  })
}
