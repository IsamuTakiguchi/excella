/**
 * ExcelJS を使った .xlsx ⇄ WorkbookModel の変換。main プロセスでのみ動く。
 *
 * 対応：シート・値・数式・太字/斜体/下線・フォント色/サイズ・塗り・配置・表示形式・
 *       列幅・行高・結合セル・ウィンドウ枠の固定。
 * 非対応（読み込み時に捨てる）：マクロ、グラフ、ピボット、条件付き書式、
 *       データ検証、画像、コメント、定義名。
 */

import ExcelJS from 'exceljs'
import { addrToA1, a1ToAddr } from '../../shared/a1'
import {
  createSheet,
  DEFAULT_COL_COUNT,
  DEFAULT_ROW_COUNT,
  isEmptyStyle,
  type CellStyle,
  type HorizontalAlign,
  type SheetModel,
  type WorkbookModel,
} from '../../shared/model'
import { dateToSerial } from '../../shared/numberFormat'

/** 文字幅 → px（Excel の既定フォントでの近似） */
const charsToPx = (chars: number): number => Math.round(chars * 7 + 5)
const pxToChars = (px: number): number => Math.max(1, (px - 5) / 7)
/** pt → px */
const ptToPx = (pt: number): number => Math.round((pt * 96) / 72)
const pxToPt = (px: number): number => (px * 72) / 96

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb) return undefined
  const hex = argb.length === 8 ? argb.slice(2) : argb
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return undefined
  return `#${hex.toUpperCase()}`
}

function hexToArgb(hex: string | undefined): string | undefined {
  if (!hex) return undefined
  const h = hex.replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return undefined
  return `FF${h.toUpperCase()}`
}

function readStyle(cell: ExcelJS.Cell): CellStyle {
  const style: CellStyle = {}
  const font = cell.font
  if (font) {
    if (font.bold) style.bold = true
    if (font.italic) style.italic = true
    if (font.underline) style.underline = true
    if (font.size && font.size !== 11) style.fontSize = font.size
    const color = argbToHex(
      typeof font.color === 'object' && font.color ? font.color.argb : undefined,
    )
    if (color && color !== '#000000') style.color = color
  }
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const bg = argbToHex(fill.fgColor?.argb)
    if (bg) style.bg = bg
  }
  const align = cell.alignment?.horizontal
  if (align === 'left' || align === 'center' || align === 'right') {
    style.align = align as HorizontalAlign
  }
  if (cell.numFmt && cell.numFmt !== 'General') style.numFmt = cell.numFmt
  return style
}

function readCellValue(cell: ExcelJS.Cell): { f?: string; v?: string | number | boolean } | null {
  const value = cell.value
  if (value === null || value === undefined) return null

  if (typeof value === 'object') {
    if ('formula' in value && value.formula) {
      return { f: `=${value.formula}` }
    }
    if ('sharedFormula' in value && value.sharedFormula) {
      // 共有数式は ExcelJS が解決しないので、計算結果だけを値として取り込む
      const result = (value as ExcelJS.CellSharedFormulaValue).result
      if (result === null || result === undefined) return null
      if (result instanceof Date) return { v: dateToSerial(result) }
      if (typeof result === 'object') return null
      return { v: result as string | number | boolean }
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return { v: value.richText.map((rt) => rt.text).join('') }
    }
    if ('text' in value && typeof value.text === 'string') {
      return { v: value.text }
    }
    if ('error' in value) return { v: String(value.error) }
    if (value instanceof Date) return { v: dateToSerial(value) }
    return null
  }

  if (typeof value === 'string' && value.startsWith('=')) return { f: value }
  return { v: value as string | number | boolean }
}

export async function workbookFromXlsx(filePath: string): Promise<WorkbookModel> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const sheets: SheetModel[] = []
  wb.eachSheet((ws) => {
    const sheet = createSheet(ws.name)
    let maxRow = 0
    let maxCol = 0

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (row.height) sheet.rowHeights[rowNumber - 1] = ptToPx(row.height)
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = addrToA1({ row: rowNumber - 1, col: colNumber - 1 })
        const data = readCellValue(cell)
        if (data) sheet.cells[key] = data
        const style = readStyle(cell)
        if (!isEmptyStyle(style)) sheet.styles[key] = style
        if (rowNumber > maxRow) maxRow = rowNumber
        if (colNumber > maxCol) maxCol = colNumber
      })
    })

    ws.columns?.forEach((col, index) => {
      if (col.width) sheet.colWidths[index] = charsToPx(col.width)
    })

    const merges = (ws as unknown as { model?: { merges?: string[] } }).model?.merges
    if (Array.isArray(merges)) sheet.merges = merges.slice()

    const pane = ws.views?.[0]
    if (pane && pane.state === 'frozen') {
      sheet.frozen = { rows: pane.ySplit ?? 0, cols: pane.xSplit ?? 0 }
    }

    sheet.rowCount = Math.max(DEFAULT_ROW_COUNT, maxRow + 20)
    sheet.colCount = Math.max(DEFAULT_COL_COUNT, maxCol + 5)
    sheets.push(sheet)
  })

  if (sheets.length === 0) sheets.push(createSheet('Sheet1'))
  return { version: 1, sheets, activeSheetId: sheets[0].id }
}

/**
 * モデルを xlsx として書き出す。
 * `displayValues` にシート ID → (A1 → 計算結果) を渡すと、数式の計算済み結果を
 * result として埋め込むので、Excel で開いた直後から値が表示される。
 */
export async function xlsxFromWorkbook(
  filePath: string,
  model: WorkbookModel,
  results?: Map<string, Map<string, string | number | boolean>>,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Excella'
  wb.created = new Date()

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    const sheetResults = results?.get(sheet.id)

    for (const [key, data] of Object.entries(sheet.cells)) {
      const addr = a1ToAddr(key)
      if (!addr) continue
      const cell = ws.getCell(addr.row + 1, addr.col + 1)
      if (data.f !== undefined) {
        const result = sheetResults?.get(key)
        cell.value = {
          formula: data.f.replace(/^=/, ''),
          result: result === undefined ? undefined : result,
        } as ExcelJS.CellFormulaValue
      } else if (data.v !== undefined && data.v !== '') {
        cell.value = data.v
      }
    }

    for (const [key, style] of Object.entries(sheet.styles)) {
      const addr = a1ToAddr(key)
      if (!addr) continue
      const cell = ws.getCell(addr.row + 1, addr.col + 1)
      const font: Partial<ExcelJS.Font> = {}
      if (style.bold) font.bold = true
      if (style.italic) font.italic = true
      if (style.underline) font.underline = true
      if (style.fontSize) font.size = style.fontSize
      const color = hexToArgb(style.color)
      if (color) font.color = { argb: color }
      if (Object.keys(font).length > 0) cell.font = font
      const bg = hexToArgb(style.bg)
      if (bg) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      }
      if (style.align) cell.alignment = { horizontal: style.align }
      if (style.numFmt) cell.numFmt = style.numFmt
    }

    for (const [index, px] of Object.entries(sheet.colWidths)) {
      ws.getColumn(Number(index) + 1).width = pxToChars(px)
    }
    for (const [index, px] of Object.entries(sheet.rowHeights)) {
      ws.getRow(Number(index) + 1).height = pxToPt(px)
    }
    for (const merge of sheet.merges) {
      try {
        ws.mergeCells(merge)
      } catch {
        // 重なった結合などは無視する
      }
    }
    if (sheet.frozen && (sheet.frozen.rows > 0 || sheet.frozen.cols > 0)) {
      ws.views = [
        {
          state: 'frozen',
          xSplit: sheet.frozen.cols,
          ySplit: sheet.frozen.rows,
        },
      ]
    }
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('Sheet1')
  await wb.xlsx.writeFile(filePath)
}
