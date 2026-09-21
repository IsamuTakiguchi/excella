/**
 * HyperFormula のラッパ。
 *
 * - 計算（値・数式・参照の追従）は HyperFormula が担当する
 * - 書式・寸法・シート構成は WorkbookModel 側が担当する
 *
 * モデルのシート ID（文字列）と HyperFormula のシート ID（数値）を対応づけ、
 * renderer からは常にモデル側の ID で呼べるようにする。
 */

import {
  DetailedCellError,
  HyperFormula,
  type CellValue,
  type RawCellContent,
  type Sheets,
} from 'hyperformula'
import { addrToA1, type Addr, type Range } from '@shared/a1'
import type { SheetModel, WorkbookModel } from '@shared/model'

export type DisplayValue = string | number | boolean | null

const CONFIG = {
  licenseKey: 'gpl-v3',
  // 空セルと空文字列を Excel と同じように扱う
  evaluateNullToZero: true,
  precisionRounding: 10,
} as const

/** シートの疎な cells を HyperFormula 用の 2 次元配列にする */
function sheetToArray(sheet: SheetModel): RawCellContent[][] {
  let maxRow = -1
  let maxCol = -1
  const parsed: Array<{ row: number; col: number; raw: RawCellContent }> = []

  for (const [key, data] of Object.entries(sheet.cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(key)
    if (!m) continue
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    col -= 1
    const row = Number(m[2]) - 1
    const raw: RawCellContent = data.f !== undefined ? data.f : (data.v ?? null)
    parsed.push({ row, col, raw })
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
  }

  const grid: RawCellContent[][] = []
  for (let r = 0; r <= maxRow; r++) {
    grid.push(new Array<RawCellContent>(maxCol + 1).fill(null))
  }
  for (const { row, col, raw } of parsed) grid[row][col] = raw
  return grid
}

export class Engine {
  private hf: HyperFormula
  /** モデルのシート ID → HyperFormula のシート ID */
  private ids = new Map<string, number>()

  constructor(model: WorkbookModel) {
    this.hf = HyperFormula.buildEmpty(CONFIG)
    this.rebuild(model)
  }

  /** モデル全体から作り直す（ファイル読み込み・undo 後に使う） */
  rebuild(model: WorkbookModel): void {
    this.hf.destroy()
    const sheets: Sheets = {}
    for (const sheet of model.sheets) sheets[sheet.name] = sheetToArray(sheet)
    this.hf = HyperFormula.buildFromSheets(sheets, CONFIG)
    this.ids.clear()
    for (const sheet of model.sheets) {
      const hfId = this.hf.getSheetId(sheet.name)
      if (hfId !== undefined) this.ids.set(sheet.id, hfId)
    }
  }

  destroy(): void {
    this.hf.destroy()
  }

  private hfId(sheetId: string): number {
    const id = this.ids.get(sheetId)
    if (id === undefined) throw new Error(`未知のシートです: ${sheetId}`)
    return id
  }

  /** 計算結果。エラーは '#DIV/0!' のような文字列にして返す */
  getValue(sheetId: string, addr: Addr): DisplayValue {
    const value = this.hf.getCellValue({ sheet: this.hfId(sheetId), row: addr.row, col: addr.col })
    return normalize(value)
  }

  /** 入力そのもの（数式なら '=SUM(A1:A2)'） */
  getSerialized(sheetId: string, addr: Addr): string {
    const raw = this.hf.getCellSerialized({
      sheet: this.hfId(sheetId),
      row: addr.row,
      col: addr.col,
    })
    if (raw === null || raw === undefined) return ''
    return String(raw)
  }

  setContent(sheetId: string, addr: Addr, raw: RawCellContent): void {
    this.hf.setCellContents({ sheet: this.hfId(sheetId), row: addr.row, col: addr.col }, [[raw]])
  }

  /** 左上を起点に 2 次元配列をまとめて書き込む */
  setBlock(sheetId: string, topLeft: Addr, block: RawCellContent[][]): void {
    this.hf.setCellContents(
      { sheet: this.hfId(sheetId), row: topLeft.row, col: topLeft.col },
      block,
    )
  }

  addRows(sheetId: string, index: number, amount: number): void {
    this.hf.addRows(this.hfId(sheetId), [index, amount])
  }

  removeRows(sheetId: string, index: number, amount: number): void {
    this.hf.removeRows(this.hfId(sheetId), [index, amount])
  }

  addColumns(sheetId: string, index: number, amount: number): void {
    this.hf.addColumns(this.hfId(sheetId), [index, amount])
  }

  removeColumns(sheetId: string, index: number, amount: number): void {
    this.hf.removeColumns(this.hfId(sheetId), [index, amount])
  }

  addSheet(sheetId: string, name: string): void {
    const actual = this.hf.addSheet(name)
    const hfId = this.hf.getSheetId(actual)
    if (hfId !== undefined) this.ids.set(sheetId, hfId)
  }

  removeSheet(sheetId: string): void {
    this.hf.removeSheet(this.hfId(sheetId))
    this.ids.delete(sheetId)
  }

  renameSheet(sheetId: string, name: string): void {
    this.hf.renameSheet(this.hfId(sheetId), name)
  }

  /** シートの内容を丸ごと入れ替える（並べ替えなどで使う） */
  setSheetContent(sheetId: string, values: RawCellContent[][]): void {
    this.hf.setSheetContent(this.hfId(sheetId), values)
  }

  /** 範囲の入力内容（数式そのまま）を 2 次元で取り出す */
  getRangeSerialized(sheetId: string, range: Range): RawCellContent[][] {
    const sheet = this.hfId(sheetId)
    return this.hf.getRangeSerialized({
      start: { sheet, row: range.r0, col: range.c0 },
      end: { sheet, row: range.r1, col: range.c1 },
    })
  }

  /** 範囲の計算結果を 2 次元で取り出す */
  getRangeValues(sheetId: string, range: Range): DisplayValue[][] {
    const sheet = this.hfId(sheetId)
    const values = this.hf.getRangeValues({
      start: { sheet, row: range.r0, col: range.c0 },
      end: { sheet, row: range.r1, col: range.c1 },
    })
    return values.map((row) => row.map(normalize))
  }

  /** シート全体の入力内容（保存時にモデルへ書き戻すのに使う） */
  getSheetSerialized(sheetId: string): RawCellContent[][] {
    return this.hf.getSheetSerialized(this.hfId(sheetId))
  }

  /** 数式セルの計算結果を A1 キーの Map にして返す（xlsx の result 埋め込み用） */
  getResultMap(sheet: SheetModel): Map<string, string | number | boolean> {
    const out = new Map<string, string | number | boolean>()
    for (const [key, data] of Object.entries(sheet.cells)) {
      if (data.f === undefined) continue
      const m = /^([A-Z]+)(\d+)$/.exec(key)
      if (!m) continue
      let col = 0
      for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
      const value = this.getValue(sheet.id, { row: Number(m[2]) - 1, col: col - 1 })
      if (value !== null) out.set(key, value)
    }
    return out
  }

  /** シート全体の表示値を A1 キーの Map にする（CSV 書き出し用） */
  getDisplayMap(
    sheetId: string,
    format: (value: DisplayValue, key: string) => string,
  ): Map<string, string> {
    const out = new Map<string, string>()
    const grid = this.hf.getSheetValues(this.hfId(sheetId))
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const value = normalize(grid[r][c])
        if (value === null || value === '') continue
        const key = addrToA1({ row: r, col: c })
        out.set(key, format(value, key))
      }
    }
    return out
  }

  /** 複数の操作をまとめて 1 回の再計算にする */
  batch(fn: () => void): void {
    this.hf.batch(fn)
  }
}

function normalize(value: CellValue): DisplayValue {
  if (value instanceof DetailedCellError) return value.value
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return String(value)
  return value
}
