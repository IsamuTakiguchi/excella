/**
 * Canvas へ 1 フレーム分を描く。
 * 状態は引数として受け取り、ここでは副作用を持たない（React の外で完結させる）。
 */

import { colToLetter, type Range } from '@shared/a1'
import { DEFAULT_FONT_SIZE, type CellStyle } from '@shared/model'
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
}

const COLORS = {
  gridLine: '#d9dde3',
  headerBg: '#f1f3f5',
  headerActiveBg: '#d7e3f4',
  headerText: '#444c56',
  headerBorder: '#c3c9d1',
  text: '#1f2328',
  selectionFill: 'rgba(38, 109, 211, 0.10)',
  selectionBorder: '#266dd3',
  cellBg: '#ffffff',
  marquee: '#266dd3',
}

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif'

function cellFont(style: CellStyle | undefined): string {
  const size = style?.fontSize ?? DEFAULT_FONT_SIZE
  const weight = style?.bold ? '600' : '400'
  const italic = style?.italic ? 'italic ' : ''
  return `${italic}${weight} ${size}px ${FONT_FAMILY}`
}

export function paint(p: PaintContext): void {
  const { ctx, width, height, scrollX, scrollY } = p

  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = COLORS.cellBg
  ctx.fillRect(0, 0, width, height)

  const viewW = width - HEADER_W
  const viewH = height - HEADER_H
  const colRange = visibleRange(p.cols, scrollX, viewW)
  const rowRange = visibleRange(p.rows, scrollY, viewH)

  // --- セル本体 -------------------------------------------------------
  ctx.save()
  ctx.beginPath()
  ctx.rect(HEADER_W, HEADER_H, viewW, viewH)
  ctx.clip()
  ctx.translate(HEADER_W - scrollX, HEADER_H - scrollY)

  // 背景色
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    for (let c = colRange.first; c <= colRange.last; c++) {
      const style = p.styleAt(r, c)
      if (!style?.bg) continue
      ctx.fillStyle = style.bg
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

  // テキスト
  ctx.textBaseline = 'middle'
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    const y = offsetOf(p.rows, r)
    const h = sizeOf(p.rows, r)
    for (let c = colRange.first; c <= colRange.last; c++) {
      const text = p.textAt(r, c)
      if (!text) continue
      const style = p.styleAt(r, c)
      const x = offsetOf(p.cols, c)
      const w = sizeOf(p.cols, c)

      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 1, y + 1, w - 2, h - 2)
      ctx.clip()
      ctx.font = cellFont(style)
      ctx.fillStyle = style?.color ?? COLORS.text

      const align = style?.align ?? (p.isNumeric(r, c) ? 'right' : 'left')
      let tx = x + 5
      if (align === 'right') {
        ctx.textAlign = 'right'
        tx = x + w - 5
      } else if (align === 'center') {
        ctx.textAlign = 'center'
        tx = x + w / 2
      } else {
        ctx.textAlign = 'left'
      }
      ctx.fillText(text, tx, y + h / 2 + 1)

      if (style?.underline) {
        const metrics = ctx.measureText(text)
        const uy = Math.round(y + h / 2 + (style.fontSize ?? DEFAULT_FONT_SIZE) * 0.45) + 0.5
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
  }

  // 選択枠とアクティブセル
  ctx.strokeStyle = COLORS.selectionBorder
  ctx.lineWidth = 2
  ctx.strokeRect(selX + 1, selY + 1, selW - 2, selH - 2)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  const ax = offsetOf(p.cols, p.active.col)
  const ay = offsetOf(p.rows, p.active.row)
  ctx.strokeRect(
    ax + 0.5,
    ay + 0.5,
    sizeOf(p.cols, p.active.col) - 1,
    sizeOf(p.rows, p.active.row) - 1,
  )

  // コピー中の点線枠
  if (p.marquee) {
    const m = p.marquee
    const mx = offsetOf(p.cols, m.c0)
    const my = offsetOf(p.rows, m.r0)
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = COLORS.marquee
    ctx.lineWidth = 1.5
    ctx.strokeRect(
      mx + 1,
      my + 1,
      offsetOf(p.cols, m.c1 + 1) - mx - 2,
      offsetOf(p.rows, m.r1 + 1) - my - 2,
    )
    ctx.restore()
  }

  ctx.restore()

  // --- ヘッダ ---------------------------------------------------------
  ctx.font = `500 12px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'

  // 列ヘッダ
  ctx.save()
  ctx.beginPath()
  ctx.rect(HEADER_W, 0, viewW, HEADER_H)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(HEADER_W, 0, viewW, HEADER_H)
  ctx.translate(HEADER_W - scrollX, 0)
  ctx.textAlign = 'center'
  for (let c = colRange.first; c <= colRange.last; c++) {
    const x = offsetOf(p.cols, c)
    const w = sizeOf(p.cols, c)
    const selected = c >= sel.c0 && c <= sel.c1
    if (selected) {
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(x, 0, w, HEADER_H)
    }
    ctx.fillStyle = COLORS.headerText
    ctx.fillText(colToLetter(c), x + w / 2, HEADER_H / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(Math.floor(x + w) + 0.5, 0)
    ctx.lineTo(Math.floor(x + w) + 0.5, HEADER_H)
    ctx.stroke()
  }
  ctx.restore()

  // 行ヘッダ
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, HEADER_H, HEADER_W, viewH)
  ctx.clip()
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, HEADER_H, HEADER_W, viewH)
  ctx.translate(0, HEADER_H - scrollY)
  ctx.textAlign = 'center'
  for (let r = rowRange.first; r <= rowRange.last; r++) {
    const y = offsetOf(p.rows, r)
    const h = sizeOf(p.rows, r)
    const selected = r >= sel.r0 && r <= sel.r1
    if (selected) {
      ctx.fillStyle = COLORS.headerActiveBg
      ctx.fillRect(0, y, HEADER_W, h)
    }
    ctx.fillStyle = COLORS.headerText
    ctx.fillText(String(r + 1), HEADER_W / 2, y + h / 2)
    ctx.strokeStyle = COLORS.headerBorder
    ctx.beginPath()
    ctx.moveTo(0, Math.floor(y + h) + 0.5)
    ctx.lineTo(HEADER_W, Math.floor(y + h) + 0.5)
    ctx.stroke()
  }
  ctx.restore()

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

  ctx.restore()
}
