/**
 * CSV の読み書き（RFC 4180 準拠のサブセット）。
 * 引用符つきフィールド、`""` によるエスケープ、フィールド内の改行に対応する。
 */

import { addrToA1 } from './a1'
import {
  createSheet,
  DEFAULT_COL_COUNT,
  DEFAULT_ROW_COUNT,
  type SheetModel,
  type WorkbookModel,
} from './model'

export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // BOM を落とす
  if (text.charCodeAt(0) === 0xfeff) i = 1

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delimiter) {
      pushField()
      i++
      continue
    }
    if (ch === '\r') {
      // CRLF / CR どちらも行区切りとして扱う
      pushRow()
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === '\n') {
      pushRow()
      i++
      continue
    }
    field += ch
    i++
  }

  // 末尾。空文字列全体のときは空配列を返す
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

export function stringifyCsv(rows: string[][], delimiter = ','): string {
  const needsQuote = new RegExp(`["\\n\\r${delimiter === '\t' ? '\\t' : delimiter}]`)
  return rows
    .map((row) =>
      row
        .map((cell) => (needsQuote.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(delimiter),
    )
    .join('\r\n')
}

/** CSV の 1 フィールドを数値として解釈できるならその数値を返す */
export function coerceScalar(text: string): string | number | boolean {
  const t = text.trim()
  if (t === '') return ''
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  if (t === 'TRUE' || t === 'true') return true
  if (t === 'FALSE' || t === 'false') return false
  return text
}

/** CSV テキストから 1 シートだけのワークブックを作る */
export function csvToWorkbook(text: string, sheetName: string): WorkbookModel {
  const rows = parseCsv(text)
  const sheet = createSheet(sheetName)
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const raw = rows[r][c]
      if (raw === '') continue
      const key = addrToA1({ row: r, col: c })
      if (raw.startsWith('=')) sheet.cells[key] = { f: raw }
      else sheet.cells[key] = { v: coerceScalar(raw) }
    }
  }
  sheet.rowCount = Math.max(DEFAULT_ROW_COUNT, rows.length + 20)
  sheet.colCount = Math.max(DEFAULT_COL_COUNT, ...rows.map((r) => r.length + 5), 1)
  return { version: 1, sheets: [sheet], activeSheetId: sheet.id }
}

/**
 * シートを CSV 用の 2 次元配列にする。
 * `displayValues` が与えられていればそれを（＝数式の計算結果を）出力する。
 */
export function sheetToRows(sheet: SheetModel, displayValues?: Map<string, string>): string[][] {
  let maxRow = -1
  let maxCol = -1
  for (const key of Object.keys(sheet.cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(key)
    if (!m) continue
    const row = Number(m[2]) - 1
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    col -= 1
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
  }
  const rows: string[][] = []
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const key = addrToA1({ row: r, col: c })
      const display = displayValues?.get(key)
      if (display !== undefined) {
        row.push(display)
        continue
      }
      const cell = sheet.cells[key]
      if (!cell) row.push('')
      else if (cell.f !== undefined) row.push(cell.f)
      else row.push(cell.v === undefined ? '' : String(cell.v))
    }
    rows.push(row)
  }
  return rows
}
