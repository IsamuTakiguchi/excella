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
/** 上下の配置。省略時は Excel と同じく下揃え */
export type VerticalAlign = 'top' | 'middle' | 'bottom'

/** 罫線の太さ。xlsx の thin / medium / thick に対応する */
export type BorderWeight = 'thin' | 'medium' | 'thick'

export type BorderSide = {
  weight: BorderWeight
  /** '#RRGGBB'。省略時は既定の黒 */
  color?: string
}

/** セルの四辺の罫線。辺が無ければ罫線なし */
export type CellBorders = {
  top?: BorderSide
  right?: BorderSide
  bottom?: BorderSide
  left?: BorderSide
}

export const BORDER_DEFAULT_COLOR = '#000000'

export const BORDER_WIDTH_PX: Record<BorderWeight, number> = {
  thin: 1,
  medium: 2,
  thick: 3,
}

export type CellStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** 取り消し線 */
  strike?: boolean
  /** フォント名（'游ゴシック' など）。省略時は既定のフォント */
  fontName?: string
  /** 文字色 '#RRGGBB' */
  color?: string
  /** 背景色 '#RRGGBB' */
  bg?: string
  align?: HorizontalAlign
  /** 上下の配置。省略時は下揃え */
  valign?: VerticalAlign
  /** 折り返して全体を表示する */
  wrap?: boolean
  /** 表示形式コード（numberFormat.ts が解釈するサブセット） */
  numFmt?: string
  /** フォントサイズ（pt）。省略時は DEFAULT_FONT_PT */
  fontSize?: number
  /** 四辺の罫線 */
  borders?: CellBorders
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
  /** シート見出しの色（'#RRGGBB'）。Excel の「タブの色」 */
  tabColor?: string
  /** 非表示のシート。少なくとも 1 枚は表示されている必要がある */
  hidden?: boolean
  /** 非表示の行（0 始まり） */
  hiddenRows?: number[]
  /** 非表示の列（0 始まり） */
  hiddenCols?: number[]
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
/** 既定のフォントサイズ（pt）。Excel と同じ 11pt */
export const DEFAULT_FONT_PT = 11
/** 既定のフォントサイズを画面で何 px に描くか。行高 22px に合う大きさ */
export const DEFAULT_FONT_PX = 13
/** pt → 画面上の px。既定の 11pt がちょうど DEFAULT_FONT_PX になる比率で描く */
export function fontPx(pt: number | undefined): number {
  return ((pt ?? DEFAULT_FONT_PT) * DEFAULT_FONT_PX) / DEFAULT_FONT_PT
}

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
  return Object.entries(style).every(([key, value]) => {
    if (value === undefined) return true
    // borders は中身が空になっていることがある
    if (key === 'borders') return isEmptyBorders(value as CellBorders)
    return false
  })
}

/** 四辺とも罫線が無いか */
export function isEmptyBorders(borders: CellBorders | undefined): boolean {
  if (!borders) return true
  return !borders.top && !borders.right && !borders.bottom && !borders.left
}

/** セルが空（内容なし）か */
export function isEmptyCell(cell: CellData | undefined): boolean {
  if (!cell) return true
  return cell.f === undefined && (cell.v === undefined || cell.v === '')
}
