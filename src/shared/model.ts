/**
 * ワークブックの永続モデル。main / preload / renderer で共有する。
 * 計算そのものは HyperFormula が担当し、このモデルは
 * 「内容（値・数式）＋見た目（書式・寸法）」の保存/復元用の表現。
 */

/** セルの内容。数式は f（先頭の '=' を含む）、リテラルは v に入れる。 */
export type CellData = {
  f?: string
  v?: string | number | boolean
}

export type HorizontalAlign = 'left' | 'center' | 'right'

export type CellStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** 文字色 '#RRGGBB' */
  color?: string
  /** 背景色 '#RRGGBB' */
  bg?: string
  align?: HorizontalAlign
  /** 表示形式コード（numberFormat.ts が解釈するサブセット） */
  numFmt?: string
  /** pt 単位 */
  fontSize?: number
}

export type SheetModel = {
  id: string
  name: string
  /** キーは 'A1' 形式。値が空のセルは持たない（疎） */
  cells: Record<string, CellData>
  /** キーは 'A1' 形式 */
  styles: Record<string, CellStyle>
  /** キーは 0 始まりの列番号、値は px */
  colWidths: Record<number, number>
  /** キーは 0 始まりの行番号、値は px */
  rowHeights: Record<number, number>
  /** 結合セル。'A1:B2' 形式。xlsx との往復のために保持する */
  merges: string[]
  rowCount: number
  colCount: number
  frozen?: { rows: number; cols: number }
}

export type WorkbookModel = {
  version: 1
  sheets: SheetModel[]
  activeSheetId: string
}

export const DEFAULT_COL_WIDTH = 88
export const DEFAULT_ROW_HEIGHT = 22
export const DEFAULT_ROW_COUNT = 200
export const DEFAULT_COL_COUNT = 40
export const DEFAULT_FONT_SIZE = 13

let sheetSeq = 0

export function newSheetId(): string {
  sheetSeq += 1
  return `s${Date.now().toString(36)}${sheetSeq.toString(36)}`
}

export function createSheet(name: string): SheetModel {
  return {
    id: newSheetId(),
    name,
    cells: {},
    styles: {},
    colWidths: {},
    rowHeights: {},
    merges: [],
    rowCount: DEFAULT_ROW_COUNT,
    colCount: DEFAULT_COL_COUNT,
  }
}

export function createWorkbook(): WorkbookModel {
  const sheet = createSheet('Sheet1')
  return { version: 1, sheets: [sheet], activeSheetId: sheet.id }
}

/** 空オブジェクトになった書式を落とす（保存サイズと差分を小さく保つ） */
export function isEmptyStyle(style: CellStyle | undefined): boolean {
  if (!style) return true
  return Object.values(style).every((v) => v === undefined)
}

/** セルが空（内容なし）か */
export function isEmptyCell(cell: CellData | undefined): boolean {
  if (!cell) return true
  return cell.f === undefined && (cell.v === undefined || cell.v === '')
}
