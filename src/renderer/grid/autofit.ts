/**
 * 行の高さ・列の幅の自動調整。文字幅の計測に Canvas を使うので renderer 専用。
 * 列幅・行高はモデルの値（倍率なし）で持つので、計測は常に倍率 1 で行う。
 */
import { findMerge } from '@shared/a1'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, fontPx } from '@shared/model'
import { useStore } from '../store/workbookStore'
import { autofitWidth } from './geometry'
import { cellFontOf, cellLineCount } from './painter'
import { rowHeightFor } from './textLayout'

let measureContext: CanvasRenderingContext2D | null = null

function context(): CanvasRenderingContext2D | null {
  if (!measureContext && typeof document !== 'undefined') {
    measureContext = document.createElement('canvas').getContext('2d')
  }
  return measureContext
}

/** 行の内容に合った高さ（折り返し・フォントの大きさ・改行を見る）。空なら既定の高さ */
export function fitRowHeight(row: number): number {
  const ctx = context()
  const state = useStore.getState()
  const sheet = state.activeSheet()
  if (!ctx) return DEFAULT_ROW_HEIGHT
  let need = DEFAULT_ROW_HEIGHT
  for (let col = 0; col < sheet.colCount; col++) {
    const addr = { row, col }
    // 結合セルは行をまたぐので、行の高さの計算には入れない（Excel と同じ）
    if (sheet.merges.length > 0 && findMerge(sheet.merges, addr)) continue
    const text = state.displayText(addr)
    if (!text) continue
    const style = state.styleAt(addr)
    const width = sheet.colWidths[col] ?? DEFAULT_COL_WIDTH
    const lines = style?.wrap ? cellLineCount(ctx, text, style, width) : 1
    need = Math.max(need, rowHeightFor(lines, fontPx(style?.fontSize)))
  }
  return need
}

/** 列の内容に合った幅 */
export function fitColumnWidth(col: number): number {
  const ctx = context()
  const state = useStore.getState()
  const sheet = state.activeSheet()
  if (!ctx) return DEFAULT_COL_WIDTH
  return autofitWidth(sheet.rowCount, (row) => {
    const addr = { row, col }
    const text = state.displayText(addr)
    if (!text) return 0
    const style = state.styleAt(addr)
    // 折り返すセルは幅を決める側ではない
    if (style?.wrap) return 0
    ctx.save()
    ctx.font = cellFontOf(style)
    const width = Math.max(...text.split('\n').map((line) => ctx.measureText(line).width))
    ctx.restore()
    return width
  })
}

/**
 * 範囲の行を、内容が収まる高さまで広げる（折り返しをオンにしたときなど）。
 * 直前の書式の変更と同じ undo にまとめるので履歴は積まない。縮めはしない。
 */
export function growRowsToFit(r0: number, r1: number): void {
  const state = useStore.getState()
  const sheet = state.activeSheet()
  const heights: Record<number, number> = {}
  for (let row = r0; row <= Math.min(r1, sheet.rowCount - 1); row++) {
    const need = fitRowHeight(row)
    if (need > (sheet.rowHeights[row] ?? DEFAULT_ROW_HEIGHT)) heights[row] = need
  }
  state.setRowHeights(heights, false)
}
