/**
 * Canvas へ 1 フレーム分を描く。
 * 状態は引数として受け取り、ここでは副作用を持たない（React の外で完結させる）。
 *
 * ウィンドウ枠を固定している場合は、本体を最大 4 つのペイン
 * （左上＝行列とも固定 / 右上＝行だけ固定 / 左下＝列だけ固定 / 右下＝通常）に
 * 分けて描く。各ペインは clip と translate だけが違い、描画処理は共通。
 */

import { colToLetter, rangeContains, type Range } from '@shared/a1'
import { DEFAULT_FONT_STACK, fontFamilyOf } from '@shared/fonts'
import {
  BORDER_DEFAULT_COLOR,
  BORDER_WIDTH_PX,
  fontPx,
  type CellBorders,
  type CellStyle,
} from '@shared/model'
import { offsetOf, sizeOf, visibleRange, type Sizes } from './geometry'
import { LINE_HEIGHT_RATIO, overflowCols, wrapText } from './textLayout'

export type PaintContext = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  scrollX: number
  scrollY: number
  cols: Sizes
  rows: Sizes
  colCount: number
  rowCount: number
  selection: Range
  active: { row: number; col: number }
  /** 表示文字列を返す（可視セルだけ呼ばれる） */
  textAt: (row: number, col: number) => string
  /** 値が数値かどうか（既定の右寄せ判定に使う） */
  isNumeric: (row: number, col: number) => boolean
  styleAt: (row: number, col: number) => CellStyle | undefined
  /** 表示形式の [Red] などで決まる文字色。書式の文字色より優先する */
  textColorAt?: (row: number, col: number) => string | undefined
  /** 切り取り・コピー中の点線枠 */
  marquee?: Range | null
  /** 結合セル。左上のセルの内容を矩形いっぱいに描く */
  merges?: Range[]
  /** ウィンドウ枠の固定（先頭から何行・何列を固定するか） */
  frozen?: { rows: number; cols: number }
  /** フィルハンドルのドラッグ中に示す、伸ばそうとしている範囲 */
  fillPreview?: Range | null
  /** 編集中の数式が参照しているセル。参照ごとに色を変えて囲む */
  formulaRefs?: Array<{ range: Range; color: string }>
  /** 数式の参照選択（ポイントモード）で今選んでいる参照 */
  pointing?: { range: Range; color: string } | null
  /** 表示倍率をかけたヘッダの寸法（行高・列幅は cols / rows 側で倍率済み） */
  headerW: number
  headerH: number
  /** 表示倍率。文字の大きさに使う */
  zoom: number
  /** 目盛線を描くか（省略時は描く） */
  gridlines?: boolean
}

/**
 * 数式の参照を囲む色。Excel と同じく、出てきた順に色を変えて
 * どの参照がどのセルなのかを見分けられるようにする。
 */
export const REF_COLORS = ['#2b7cd3', '#c0392b', '#7030a0', '#0b8043', '#b8860b']

/** フィルハンドル（選択範囲の右下の四角）の一辺の長さ（px） */
export const FILL_HANDLE_SIZE = 7

const COLORS = {
  gridLine: '#dadada',
  headerBg: '#f3f3f3',
  headerActiveBg: '#cfe9da',
  headerText: '#444444',
  headerActiveText: '#0b5a2f',
  headerBorder: '#c6c6c6',
  frozenBorder: '#8f8f8f',
  text: '#000000',
  selectionFill: 'rgba(16, 124, 65, 0.12)',
  selectionBorder: '#107c41',
  cellBg: '#ffffff',
  marquee: '#107c41',
}

const headerFont = (zoom: number, bold: boolean): string =>
  `${bold ? 700 : 500} ${Math.round(12 * zoom)}px ${DEFAULT_FONT_STACK}`

/** セルの文字の左右の余白（px、倍率 1） */
const CELL_PAD = 5
/** 画面外の列から、はみ出して見えてくる文字を探す範囲 */
const OVERFLOW_LOOKAROUND = 20

/**
 * セルのフォント指定。自動調整の計測でも同じものを使う。
 * 列幅はモデルの値（倍率なし）で持つので、計測は常に倍率 1 で行う。
 */
export function cellFontOf(style: CellStyle | undefined): string {
  return cellFont(style, 1)
}

function cellFont(style: CellStyle | undefined, zoom: number): string {
  const size = fontPx(style?.fontSize) * zoom
  const weight = style?.bold ? '600' : '400'
  const italic = style?.italic ? 'italic ' : ''
  return `${italic}${weight} ${size}px ${fontFamilyOf(style?.fontName)}`
}

/**
 * 折り返しのある文字の行数を数える（行の高さの自動調整用、倍率 1）。
 * 折り返さないセルは改行の数だけを数える
 */
export function cellLineCount(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: CellStyle | undefined,
  width: number,
): number {
  if (!text) return 0
  if (!style?.wrap) return 1
  ctx.save()
  ctx.font = cellFontOf(style)
  const lines = wrapText(text, Math.max(1, width - CELL_PAD * 2), (s) => ctx.measureText(s).width)
  ctx.restore()
  return lines.length
}

/** 範囲の矩形（セル本体の座標系） */
function rectOf(p: PaintContext, range: Range): { x: number; y: number; w: number; h: number } {
  const x = offsetOf(p.cols, range.c0)
  const y = offsetOf(p.rows, range.r0)
  return {
    x,
    y,
    w: offsetOf(p.cols, range.c1 + 1) - x,
    h: offsetOf(p.rows, range.r1 + 1) - y,
  }
}

/** そのセルを含む結合範囲。無ければ null */
function mergeAt(merges: Range[] | undefined, row: number, col: number): Range | null {
  if (!merges) return null
  for (const m of merges) {
    if (rangeContains(m, { row, col })) return m
  }
  return null
}

type Span = { first: number; last: number }

/** 画面上の 1 区画。scrollX/scrollY はその区画が表示し始める位置 */
type Pane = {
  x: number
  y: number
  w: number
  h: number
  scrollX: number
  scrollY: number
  cols: Span
  rows: Span
}

export function paint(p: PaintContext): void {
  const { ctx, width, height } = p

  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = COLORS.cellBg
  ctx.fillRect(0, 0, width, height)

  const viewW = width - p.headerW
  const viewH = height - p.headerH

  const frozenCols = Math.min(p.frozen?.cols ?? 0, p.colCount)
  const frozenRows = Math.min(p.frozen?.rows ?? 0, p.rowCount)
  const frozenW = offsetOf(p.cols, frozenCols)
  const frozenH = offsetOf(p.rows, frozenRows)

  // スクロールするペインは、固定領域より手前へは戻さない
  const scrollX = Math.max(p.scrollX, frozenW)
  const scrollY = Math.max(p.scrollY, frozenH)

  const movingCols = visibleRange(p.cols, scrollX, viewW - frozenW)
  const movingRows = visibleRange(p.rows, scrollY, viewH - frozenH)
  const fixedCols: Span = { first: 0, last: frozenCols - 1 }
  const fixedRows: Span = { first: 0, last: frozenRows - 1 }

  const panes: Pane[] = [
    {
      x: p.headerW + frozenW,
      y: p.headerH + frozenH,
      w: viewW - frozenW,
      h: viewH - frozenH,
      scrollX,
      scrollY,
      cols: movingCols,
      rows: movingRows,
    },
  ]
  if (frozenCols > 0) {
    panes.push({
      x: p.headerW,
      y: p.headerH + frozenH,
      w: frozenW,
      h: viewH - frozenH,
      scrollX: 0,
      scrollY,
      cols: fixedCols,
      rows: movingRows,
    })
  }
  if (frozenRows > 0) {
    panes.push({
      x: p.headerW + frozenW,
      y: p.headerH,
      w: viewW - frozenW,
      h: frozenH,
      scrollX,
      scrollY: 0,
      cols: movingCols,
      rows: fixedRows,
    })
  }
  if (frozenCols > 0 && frozenRows > 0) {
    panes.push({
      x: p.headerW,
      y: p.headerH,
      w: frozenW,
      h: frozenH,
      scrollX: 0,
      scrollY: 0,
      cols: fixedCols,
      rows: fixedRows,
    })
  }

  for (const pane of panes) paintPane(p, pane)

  // --- ヘッダ ---------------------------------------------------------
  ctx.font = headerFont(p.zoom, false)
  ctx.textBaseline = 'middle'

  paintColHeader(p, p.headerW + frozenW, viewW - frozenW, scrollX, movingCols)
  if (frozenCols > 0) paintColHeader(p, p.headerW, frozenW, 0, fixedCols)
  paintRowHeader(p, p.headerH + frozenH, viewH - frozenH, scrollY, movingRows)
  if (frozenRows > 0) paintRowHeader(p, p.headerH, frozenH, 0, fixedRows)

  // 左上の角
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, p.headerW, p.headerH)
  ctx.strokeStyle = COLORS.headerBorder
  ctx.beginPath()
  ctx.moveTo(p.headerW + 0.5, 0)
  ctx.lineTo(p.headerW + 0.5, height)
  ctx.moveTo(0, p.headerH + 0.5)
  ctx.lineTo(width, p.headerH + 0.5)
  ctx.stroke()

  // 固定の境界線
  if (frozenCols > 0 || frozenRows > 0) {
    ctx.strokeStyle = COLORS.frozenBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    if (frozenCols > 0) {
      const x = Math.floor(p.headerW + frozenW) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    if (frozenRows > 0) {
      const y = Math.floor(p.headerH + frozenH) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

/** 1 区画ぶんのセルを描く */
function paintPane(p: PaintContext, pane: Pane): void {
  const { ctx } = p
  if (pane.w <= 0 || pane.h <= 0) return
  if (pane.cols.last < pane.cols.first || pane.rows.last < pane.rows.first) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(pane.x, pane.y, pane.w, pane.h)
  ctx.clip()
  ctx.translate(pane.x - pane.scrollX, pane.y - pane.scrollY)

  const colRange = pane.cols
  const rowRange = pane.rows

  // 背景色。結合セルは左上の書式を矩形いっぱいに広げる
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    for (let c = colRange.first; c <= colRange.last; c++) {
      const merge = mergeAt(p.merges, r, c)
      if (merge && (merge.r0 !== r || merge.c0 !== c)) continue
      const style = p.styleAt(r, c)
      if (!style?.bg) continue
      ctx.fillStyle = style.bg
      const rect = merge ? rectOf(p, merge) : null
      if (rect) ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      else
        ctx.fillRect(offsetOf(p.cols, c), offsetOf(p.rows, r), sizeOf(p.cols, c), sizeOf(p.rows, r))
    }
  }

  // 選択範囲の塗り
  const sel = p.selection
  const selX = offsetOf(p.cols, sel.c0)
  const selY = offsetOf(p.rows, sel.r0)
  const selW = offsetOf(p.cols, sel.c1 + 1) - selX
  const selH = offsetOf(p.rows, sel.r1 + 1) - selY
  if (sel.r0 !== sel.r1 || sel.c0 !== sel.c1) {
    ctx.fillStyle = COLORS.selectionFill
    ctx.fillRect(selX, selY, selW, selH)
  }

  // 目盛線（セルの境目の薄い線）。Excel の「表示 > 目盛線」で消せる。罫線は消えない
  if (p.gridlines !== false) {
    ctx.strokeStyle = COLORS.gridLine
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = colRange.first; c <= colRange.last + 1 && c <= p.colCount; c++) {
      const x = Math.floor(offsetOf(p.cols, c)) + 0.5
      ctx.moveTo(x, offsetOf(p.rows, rowRange.first))
      ctx.lineTo(x, offsetOf(p.rows, Math.min(rowRange.last + 1, p.rowCount)))
    }
    for (let r = rowRange.first; r <= rowRange.last + 1 && r <= p.rowCount; r++) {
      const y = Math.floor(offsetOf(p.rows, r)) + 0.5
      ctx.moveTo(offsetOf(p.cols, colRange.first), y)
      ctx.lineTo(offsetOf(p.cols, Math.min(colRange.last + 1, p.colCount)), y)
    }
    ctx.stroke()
  }

  // 結合範囲の内側の罫線を消す
  if (p.merges) {
    for (const merge of p.merges) {
      if (merge.r1 < rowRange.first || merge.r0 > rowRange.last) continue
      if (merge.c1 < colRange.first || merge.c0 > colRange.last) continue
      const rect = rectOf(p, merge)
      const style = p.styleAt(merge.r0, merge.c0)
      ctx.fillStyle = style?.bg ?? COLORS.cellBg
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 1, rect.h - 1)
      ctx.strokeStyle = COLORS.gridLine
      ctx.lineWidth = 1
      ctx.strokeRect(
        Math.floor(rect.x) + 0.5,
        Math.floor(rect.y) + 0.5,
        Math.floor(rect.w),
        Math.floor(rect.h),
      )
    }
  }

  // 罫線。グリッド線より後に描いて上書きする
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    for (let c = colRange.first; c <= colRange.last; c++) {
      const borders = p.styleAt(r, c)?.borders
      if (!borders) continue
      const merge = mergeAt(p.merges, r, c)
      if (merge && (merge.r0 !== r || merge.c0 !== c)) continue
      const rect = merge
        ? rectOf(p, merge)
        : {
            x: offsetOf(p.cols, c),
            y: offsetOf(p.rows, r),
            w: sizeOf(p.cols, c),
            h: sizeOf(p.rows, r),
          }
      drawBorders(ctx, borders, rect)
    }
  }

  // テキスト。画面外の列の文字がはみ出して見えてくることがあるので、少し外側から描く
  ctx.textBaseline = 'middle'
  const textFirst = Math.max(0, colRange.first - OVERFLOW_LOOKAROUND)
  const textLast = Math.min(p.colCount - 1, colRange.last + OVERFLOW_LOOKAROUND)
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    for (let c = textFirst; c <= textLast; c++) {
      const outside = c < colRange.first || c > colRange.last
      const merge = mergeAt(p.merges, r, c)
      if (merge && (outside || merge.r0 !== r || merge.c0 !== c)) continue
      // 結合の従セルには何も描かない。画面外のセルは、はみ出すときだけ描く
      drawCellText(p, r, c, merge, outside)
    }
  }

  // 固定の境界をまたぐ結合は、左上がこのペインの外にあっても描く必要がある
  // （描かないとペインの隙間で文字が丸ごと消える）
  if (p.merges) {
    for (const merge of p.merges) {
      if (merge.r1 < rowRange.first || merge.r0 > rowRange.last) continue
      if (merge.c1 < colRange.first || merge.c0 > colRange.last) continue
      const inside =
        merge.r0 >= rowRange.first &&
        merge.r0 <= rowRange.last &&
        merge.c0 >= colRange.first &&
        merge.c0 <= colRange.last
      if (inside) continue // 上のループで描画済み
      drawCellText(p, merge.r0, merge.c0, merge, false)
    }
  }

  // 選択枠とアクティブセル
  ctx.strokeStyle = COLORS.selectionBorder
  ctx.lineWidth = 2
  ctx.strokeRect(selX + 1, selY + 1, selW - 2, selH - 2)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  const activeMerge = mergeAt(p.merges, p.active.row, p.active.col)
  const activeRect = activeMerge
    ? rectOf(p, activeMerge)
    : {
        x: offsetOf(p.cols, p.active.col),
        y: offsetOf(p.rows, p.active.row),
        w: sizeOf(p.cols, p.active.col),
        h: sizeOf(p.rows, p.active.row),
      }
  ctx.strokeRect(activeRect.x + 0.5, activeRect.y + 0.5, activeRect.w - 1, activeRect.h - 1)

  // フィルハンドル（右下の小さな四角）
  ctx.fillStyle = COLORS.selectionBorder
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  const hx = selX + selW - FILL_HANDLE_SIZE / 2 - 1
  const hy = selY + selH - FILL_HANDLE_SIZE / 2 - 1
  ctx.fillRect(hx, hy, FILL_HANDLE_SIZE, FILL_HANDLE_SIZE)
  ctx.strokeRect(hx - 0.5, hy - 0.5, FILL_HANDLE_SIZE + 1, FILL_HANDLE_SIZE + 1)

  // フィルのドラッグ中に伸ばす範囲を示す
  if (p.fillPreview) {
    const rect = rectOf(p, p.fillPreview)
    ctx.save()
    ctx.setLineDash([3, 2])
    ctx.strokeStyle = COLORS.selectionBorder
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1)
    ctx.restore()
  }

  // 編集中の数式が参照しているセル
  if (p.formulaRefs) {
    for (const ref of p.formulaRefs) {
      const rect = rectOf(p, ref.range)
      ctx.strokeStyle = ref.color
      ctx.lineWidth = 1.5
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
    }
  }

  // 参照選択中のセル（点線で、動かしている最中だと分かるように）
  if (p.pointing) {
    const rect = rectOf(p, p.pointing.range)
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = p.pointing.color
    ctx.lineWidth = 2
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
    ctx.restore()
  }

  // コピー中の点線枠
  if (p.marquee) {
    const rect = rectOf(p, p.marquee)
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = COLORS.marquee
    ctx.lineWidth = 1.5
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
    ctx.restore()
  }

  ctx.restore()
}

/** セルの四辺の罫線を描く */
function drawBorders(
  ctx: CanvasRenderingContext2D,
  borders: CellBorders,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const sides = [
    { side: borders.top, x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y },
    {
      side: borders.bottom,
      x0: rect.x,
      y0: rect.y + rect.h,
      x1: rect.x + rect.w,
      y1: rect.y + rect.h,
    },
    { side: borders.left, x0: rect.x, y0: rect.y, x1: rect.x, y1: rect.y + rect.h },
    {
      side: borders.right,
      x0: rect.x + rect.w,
      y0: rect.y,
      x1: rect.x + rect.w,
      y1: rect.y + rect.h,
    },
  ]
  for (const { side, x0, y0, x1, y1 } of sides) {
    if (!side) continue
    const width = BORDER_WIDTH_PX[side.weight]
    ctx.strokeStyle = side.color ?? BORDER_DEFAULT_COLOR
    ctx.lineWidth = width
    // 奇数幅の線はピクセルの中心に置くとぼやけないので 0.5 ずらす
    const shift = width % 2 === 1 ? 0.5 : 0
    ctx.beginPath()
    ctx.moveTo(Math.floor(x0) + (x0 === x1 ? shift : 0), Math.floor(y0) + (y0 === y1 ? shift : 0))
    ctx.lineTo(Math.floor(x1) + (x0 === x1 ? shift : 0), Math.floor(y1) + (y0 === y1 ? shift : 0))
    ctx.stroke()
  }
}

function cellRect(p: PaintContext, r: number, c: number) {
  return {
    x: offsetOf(p.cols, c),
    y: offsetOf(p.rows, r),
    w: sizeOf(p.cols, c),
    h: sizeOf(p.rows, r),
  }
}

/**
 * はみ出した文字の下にある目盛線を消す（Excel と同じく、文字が続いて見えるように）。
 * 罫線が引かれている境目は消さない。
 */
function eraseGridlines(p: PaintContext, r: number, fromCol: number, toCol: number): void {
  if (p.gridlines === false) return
  const { ctx } = p
  const y = offsetOf(p.rows, r)
  const h = sizeOf(p.rows, r)
  for (let k = fromCol + 1; k <= toCol; k++) {
    const leftStyle = p.styleAt(r, k - 1)
    const rightStyle = p.styleAt(r, k)
    if (leftStyle?.borders?.right || rightStyle?.borders?.left) continue
    ctx.fillStyle = rightStyle?.bg ?? leftStyle?.bg ?? COLORS.cellBg
    ctx.fillRect(Math.floor(offsetOf(p.cols, k)), y + 1, 1, h - 1)
  }
}

/**
 * 1 セル（または結合範囲）のテキストを描く。呼び出し側で clip / translate 済みであること。
 * onlyIfOverflowing は画面外のセル用で、隣へはみ出さない文字は描かない。
 */
function drawCellText(
  p: PaintContext,
  r: number,
  c: number,
  merge: Range | null,
  onlyIfOverflowing: boolean,
): void {
  const text = p.textAt(r, c)
  if (!text) return
  const { ctx } = p
  const style = p.styleAt(r, c)
  if (onlyIfOverflowing && style?.wrap) return
  const rect = merge ? rectOf(p, merge) : cellRect(p, r, c)
  if (rect.w <= 0 || rect.h <= 0) return // 非表示の行・列

  ctx.save()
  ctx.font = cellFont(style, p.zoom)
  const size = fontPx(style?.fontSize) * p.zoom
  const lineH = size * LINE_HEIGHT_RATIO
  const numeric = p.isNumeric(r, c)
  const align = style?.align ?? (numeric ? 'right' : 'left')
  const pad = CELL_PAD * Math.min(1, p.zoom)
  const inner = Math.max(1, rect.w - pad * 2)
  let clipX = rect.x + 1
  let clipW = rect.w - 2

  let lines: string[]
  if (style?.wrap) {
    lines = wrapText(text, inner, (s) => ctx.measureText(s).width)
  } else {
    // 折り返さないセルの改行は空白として 1 行に並べる（Excel と同じ）
    let single = text.includes('\n') ? text.replace(/\n/g, ' ') : text
    const width = ctx.measureText(single).width
    let overflowing = false
    if (width > inner) {
      if (numeric) {
        // 数値は途中で切ると読み違えるので、Excel と同じく # で埋める
        single = '#'.repeat(Math.max(1, Math.floor(inner / ctx.measureText('#').width)))
      } else if (!merge) {
        const ext = overflowCols({
          col: c,
          colCount: p.colCount,
          align,
          excess: width - inner,
          widthOf: (col) => sizeOf(p.cols, col),
          isFree: (col) => !p.textAt(r, col) && !mergeAt(p.merges, r, col),
        })
        if (ext.left > 0 || ext.right > 0) {
          overflowing = true
          const x0 = offsetOf(p.cols, c - ext.left)
          const x1 = offsetOf(p.cols, c + ext.right + 1)
          clipX = x0 + 1
          clipW = x1 - x0 - 2
          eraseGridlines(p, r, c - ext.left, c + ext.right)
        }
      }
    }
    if (onlyIfOverflowing && !overflowing) {
      ctx.restore()
      return
    }
    lines = [single]
  }

  ctx.beginPath()
  ctx.rect(clipX, rect.y + 1, clipW, rect.h - 2)
  ctx.clip()
  const color = p.textColorAt?.(r, c) ?? style?.color ?? COLORS.text
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, Math.round(size / 14))

  let tx = rect.x + pad
  if (align === 'right') {
    ctx.textAlign = 'right'
    tx = rect.x + rect.w - pad
  } else if (align === 'center') {
    ctx.textAlign = 'center'
    tx = rect.x + rect.w / 2
  } else {
    ctx.textAlign = 'left'
  }

  // 上下の配置。省略時は Excel と同じく下揃え
  const total = lines.length * lineH
  const top =
    style?.valign === 'top'
      ? rect.y + 2
      : style?.valign === 'middle'
        ? rect.y + (rect.h - total) / 2
        : rect.y + rect.h - 2 - total

  lines.forEach((line, i) => {
    const ty = top + lineH * (i + 0.5) + 1
    ctx.fillText(line, tx, ty)
    if (!style?.underline && !style?.strike) return
    const w = ctx.measureText(line).width
    const lx = align === 'right' ? tx - w : align === 'center' ? tx - w / 2 : tx
    ctx.beginPath()
    if (style.underline) {
      const uy = Math.round(ty + size * 0.45) + 0.5
      ctx.moveTo(lx, uy)
      ctx.lineTo(lx + w, uy)
    }
    if (style.strike) {
      const sy = Math.round(ty - size * 0.05) + 0.5
      ctx.moveTo(lx, sy)
      ctx.lineTo(lx + w, sy)
    }
    ctx.stroke()
  })
  ctx.restore()
}

function paintColHeader(p: PaintContext, x0: number, w: number, scrollX: number, span: Span): void {
  const { ctx } = p
  if (w <= 0 || span.last < span.first) return
  const sel = p.selection

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, 0, w, p.headerH)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(x0, 0, w, p.headerH)
  ctx.translate(x0 - scrollX, 0)
  ctx.textAlign = 'center'
  for (let c = span.first; c <= span.last; c++) {
    const x = offsetOf(p.cols, c)
    const cw = sizeOf(p.cols, c)
    if (cw === 0) continue // 非表示の列
    const selected = c >= sel.c0 && c <= sel.c1
    if (selected) {
      // Excel と同じく、選択中の列見出しは薄い緑に塗り、下辺を緑の線で強調する
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(x, 0, cw, p.headerH)
      ctx.fillStyle = COLORS.selectionBorder
      ctx.fillRect(x, p.headerH - 2, cw, 2)
    }
    ctx.fillStyle = selected ? COLORS.headerActiveText : COLORS.headerText
    ctx.font = headerFont(p.zoom, selected)
    ctx.fillText(colToLetter(c), x + cw / 2, p.headerH / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(Math.floor(x + cw) + 0.5, 0)
    ctx.lineTo(Math.floor(x + cw) + 0.5, p.headerH)
    ctx.stroke()
  }
  ctx.restore()
}

function paintRowHeader(p: PaintContext, y0: number, h: number, scrollY: number, span: Span): void {
  const { ctx } = p
  if (h <= 0 || span.last < span.first) return
  const sel = p.selection

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y0, p.headerW, h)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, y0, p.headerW, h)
  ctx.translate(0, y0 - scrollY)
  ctx.textAlign = 'center'
  for (let r = span.first; r <= span.last; r++) {
    const y = offsetOf(p.rows, r)
    const rh = sizeOf(p.rows, r)
    if (rh === 0) continue // 非表示の行
    const selected = r >= sel.r0 && r <= sel.r1
    if (selected) {
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(0, y, p.headerW, rh)
      ctx.fillStyle = COLORS.selectionBorder
      ctx.fillRect(p.headerW - 2, y, 2, rh)
    }
    ctx.fillStyle = selected ? COLORS.headerActiveText : COLORS.headerText
    ctx.font = headerFont(p.zoom, selected)
    ctx.fillText(String(r + 1), p.headerW / 2, y + rh / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(0, Math.floor(y + rh) + 0.5)
    ctx.lineTo(p.headerW, Math.floor(y + rh) + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}
