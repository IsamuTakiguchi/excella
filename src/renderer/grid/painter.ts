/**
 * Canvas へ 1 フレーム分を描く。
 * 状態は引数として受け取り、ここでは副作用を持たない（React の外で完結させる）。
 *
 * ウィンドウ枠を固定している場合は、本体を最大 4 つのペイン
 * （左上＝行列とも固定 / 右上＝行だけ固定 / 左下＝列だけ固定 / 右下＝通常）に
 * 分けて描く。各ペインは clip と translate だけが違い、描画処理は共通。
 */

import { colToLetter, rangeContains, type Range } from '@shared/a1'
import {
  BORDER_DEFAULT_COLOR,
  BORDER_WIDTH_PX,
  DEFAULT_FONT_SIZE,
  type CellBorders,
  type CellStyle,
} from '@shared/model'
import { HEADER_H, HEADER_W, offsetOf, sizeOf, visibleRange, type Sizes } from './geometry'

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
  /** 切り取り・コピー中の点線枠 */
  marquee?: Range | null
  /** 結合セル。左上のセルの内容を矩形いっぱいに描く */
  merges?: Range[]
  /** ウィンドウ枠の固定（先頭から何行・何列を固定するか） */
  frozen?: { rows: number; cols: number }
  /** フィルハンドルのドラッグ中に示す、伸ばそうとしている範囲 */
  fillPreview?: Range | null
}

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

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif'
const HEADER_FONT = `500 12px ${FONT_FAMILY}`
const HEADER_FONT_BOLD = `700 12px ${FONT_FAMILY}`

/** セルのフォント指定。自動調整の計測でも同じものを使う */
export function cellFontOf(style: CellStyle | undefined): string {
  return cellFont(style)
}

function cellFont(style: CellStyle | undefined): string {
  const size = style?.fontSize ?? DEFAULT_FONT_SIZE
  const weight = style?.bold ? '600' : '400'
  const italic = style?.italic ? 'italic ' : ''
  return `${italic}${weight} ${size}px ${FONT_FAMILY}`
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

  const viewW = width - HEADER_W
  const viewH = height - HEADER_H

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
      x: HEADER_W + frozenW,
      y: HEADER_H + frozenH,
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
      x: HEADER_W,
      y: HEADER_H + frozenH,
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
      x: HEADER_W + frozenW,
      y: HEADER_H,
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
      x: HEADER_W,
      y: HEADER_H,
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
  ctx.font = HEADER_FONT
  ctx.textBaseline = 'middle'

  paintColHeader(p, HEADER_W + frozenW, viewW - frozenW, scrollX, movingCols)
  if (frozenCols > 0) paintColHeader(p, HEADER_W, frozenW, 0, fixedCols)
  paintRowHeader(p, HEADER_H + frozenH, viewH - frozenH, scrollY, movingRows)
  if (frozenRows > 0) paintRowHeader(p, HEADER_H, frozenH, 0, fixedRows)

  // 左上の角
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, HEADER_W, HEADER_H)
  ctx.strokeStyle = COLORS.headerBorder
  ctx.beginPath()
  ctx.moveTo(HEADER_W + 0.5, 0)
  ctx.lineTo(HEADER_W + 0.5, height)
  ctx.moveTo(0, HEADER_H + 0.5)
  ctx.lineTo(width, HEADER_H + 0.5)
  ctx.stroke()

  // 固定の境界線
  if (frozenCols > 0 || frozenRows > 0) {
    ctx.strokeStyle = COLORS.frozenBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    if (frozenCols > 0) {
      const x = Math.floor(HEADER_W + frozenW) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    if (frozenRows > 0) {
      const y = Math.floor(HEADER_H + frozenH) + 0.5
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

  // 罫線
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

  // テキスト
  ctx.textBaseline = 'middle'
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    for (let c = colRange.first; c <= colRange.last; c++) {
      const merge = mergeAt(p.merges, r, c)
      // 結合の従セルには何も描かない
      if (merge && (merge.r0 !== r || merge.c0 !== c)) continue
      drawCellText(p, r, c, merge)
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
      drawCellText(p, merge.r0, merge.c0, merge)
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

/** 1 セル（または結合範囲）のテキストを描く。呼び出し側で clip / translate 済みであること */
function drawCellText(p: PaintContext, r: number, c: number, merge: Range | null): void {
  const text = p.textAt(r, c)
  if (!text) return
  const { ctx } = p
  const style = p.styleAt(r, c)
  const rect = merge
    ? rectOf(p, merge)
    : {
        x: offsetOf(p.cols, c),
        y: offsetOf(p.rows, r),
        w: sizeOf(p.cols, c),
        h: sizeOf(p.rows, r),
      }

  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
  ctx.clip()
  ctx.font = cellFont(style)
  ctx.fillStyle = style?.color ?? COLORS.text

  const align = style?.align ?? (p.isNumeric(r, c) ? 'right' : 'left')
  let tx = rect.x + 5
  if (align === 'right') {
    ctx.textAlign = 'right'
    tx = rect.x + rect.w - 5
  } else if (align === 'center') {
    ctx.textAlign = 'center'
    tx = rect.x + rect.w / 2
  } else {
    ctx.textAlign = 'left'
  }
  ctx.fillText(text, tx, rect.y + rect.h / 2 + 1)

  if (style?.underline) {
    const metrics = ctx.measureText(text)
    const uy = Math.round(rect.y + rect.h / 2 + (style.fontSize ?? DEFAULT_FONT_SIZE) * 0.45) + 0.5
    const ux =
      align === 'right' ? tx - metrics.width : align === 'center' ? tx - metrics.width / 2 : tx
    ctx.strokeStyle = style.color ?? COLORS.text
    ctx.beginPath()
    ctx.moveTo(ux, uy)
    ctx.lineTo(ux + metrics.width, uy)
    ctx.stroke()
  }
  ctx.restore()
}

function paintColHeader(p: PaintContext, x0: number, w: number, scrollX: number, span: Span): void {
  const { ctx } = p
  if (w <= 0 || span.last < span.first) return
  const sel = p.selection

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, 0, w, HEADER_H)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(x0, 0, w, HEADER_H)
  ctx.translate(x0 - scrollX, 0)
  ctx.textAlign = 'center'
  for (let c = span.first; c <= span.last; c++) {
    const x = offsetOf(p.cols, c)
    const cw = sizeOf(p.cols, c)
    const selected = c >= sel.c0 && c <= sel.c1
    if (selected) {
      // Excel と同じく、選択中の列見出しは薄い緑に塗り、下辺を緑の線で強調する
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(x, 0, cw, HEADER_H)
      ctx.fillStyle = COLORS.selectionBorder
      ctx.fillRect(x, HEADER_H - 2, cw, 2)
    }
    ctx.fillStyle = selected ? COLORS.headerActiveText : COLORS.headerText
    ctx.font = selected ? HEADER_FONT_BOLD : HEADER_FONT
    ctx.fillText(colToLetter(c), x + cw / 2, HEADER_H / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(Math.floor(x + cw) + 0.5, 0)
    ctx.lineTo(Math.floor(x + cw) + 0.5, HEADER_H)
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
  ctx.rect(0, y0, HEADER_W, h)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, y0, HEADER_W, h)
  ctx.translate(0, y0 - scrollY)
  ctx.textAlign = 'center'
  for (let r = span.first; r <= span.last; r++) {
    const y = offsetOf(p.rows, r)
    const rh = sizeOf(p.rows, r)
    const selected = r >= sel.r0 && r <= sel.r1
    if (selected) {
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(0, y, HEADER_W, rh)
      ctx.fillStyle = COLORS.selectionBorder
      ctx.fillRect(HEADER_W - 2, y, 2, rh)
    }
    ctx.fillStyle = selected ? COLORS.headerActiveText : COLORS.headerText
    ctx.font = selected ? HEADER_FONT_BOLD : HEADER_FONT
    ctx.fillText(String(r + 1), HEADER_W / 2, y + rh / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(0, Math.floor(y + rh) + 0.5)
    ctx.lineTo(HEADER_W, Math.floor(y + rh) + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}
