import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { a1ToRange, findMerge, type Addr, type Range } from '@shared/a1'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '@shared/model'
import { useStore } from '../store/workbookStore'
import {
  borderHit,
  buildSizes,
  HEADER_H,
  HEADER_W,
  indexAt,
  offsetOf,
  sizeOf,
  totalSize,
} from './geometry'
import { paint } from './painter'
import { CellEditor } from './CellEditor'

type DragState =
  | { kind: 'select' }
  | { kind: 'select-col' }
  | { kind: 'select-row' }
  | {
      kind: 'resize-col'
      index: number
      startX: number
      startSize: number
      before: ResizeSnapshot
    }
  | {
      kind: 'resize-row'
      index: number
      startY: number
      startSize: number
      before: ResizeSnapshot
    }
  | null

/** ドラッグ開始時点の列幅・行高。確定時に undo 1 回分としてまとめて積む */
type ResizeSnapshot = {
  colWidths: Record<number, number>
  rowHeights: Record<number, number>
}

export function SheetCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState>(null)

  const [viewport, setViewport] = useState({ width: 800, height: 600 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<'default' | 'col-resize' | 'row-resize'>('default')

  const revision = useStore((s) => s.revision)
  const selection = useStore((s) => s.selection)
  const editing = useStore((s) => s.editing)
  const clipboard = useStore((s) => s.clipboard)
  const model = useStore((s) => s.model)

  const sheet = useMemo(
    () => model.sheets.find((s) => s.id === model.activeSheetId) ?? model.sheets[0],
    [model],
  )

  const cols = useMemo(
    () => buildSizes(sheet.colCount, sheet.colWidths, DEFAULT_COL_WIDTH),
    [sheet.colCount, sheet.colWidths],
  )
  const rows = useMemo(
    () => buildSizes(sheet.rowCount, sheet.rowHeights, DEFAULT_ROW_HEIGHT),
    [sheet.rowCount, sheet.rowHeights],
  )
  const merges = useMemo(
    () => sheet.merges.map(a1ToRange).filter((r): r is Range => r !== null),
    [sheet.merges],
  )

  // --- 表示サイズの追従 -------------------------------------------------
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setViewport({ width: el.clientWidth, height: el.clientHeight })
    })
    observer.observe(el)
    setViewport({ width: el.clientWidth, height: el.clientHeight })
    return () => observer.disconnect()
  }, [])

  // --- 描画 -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const width = viewport.width
    const height = viewport.height
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const state = useStore.getState()
    const range = state.selectionRange()

    paint({
      ctx,
      width,
      height,
      scrollX: scroll.x,
      scrollY: scroll.y,
      cols,
      rows,
      colCount: sheet.colCount,
      rowCount: sheet.rowCount,
      selection: range,
      active: selection.anchor,
      textAt: (row, col) => {
        if (editing && editing.addr.row === row && editing.addr.col === col) return ''
        return state.displayText({ row, col })
      },
      isNumeric: (row, col) => typeof state.displayValue({ row, col }) === 'number',
      styleAt: (row, col) => state.styleAt({ row, col }),
      marquee: clipboard && clipboard.origin.sheetId === sheet.id ? clipboard.origin.range : null,
      merges,
      frozen: sheet.frozen,
    })
  }, [revision, selection, editing, clipboard, scroll, viewport, cols, rows, sheet, merges])

  // --- アクティブセルを可視域に入れる -----------------------------------
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const { row, col } = selection.focus
    const x0 = offsetOf(cols, col)
    const x1 = x0 + sizeOf(cols, col)
    const y0 = offsetOf(rows, row)
    const y1 = y0 + sizeOf(rows, row)
    // 固定領域はスクロールしても常に見えているので、可視域の計算から除く。
    // これを忘れると、固定境界の直後のセルが固定ペインの下に隠れてしまう。
    const fCols = Math.min(sheet.frozen?.cols ?? 0, sheet.colCount)
    const fRows = Math.min(sheet.frozen?.rows ?? 0, sheet.rowCount)
    const frozenWidth = offsetOf(cols, fCols)
    const frozenHeight = offsetOf(rows, fRows)
    const viewW = el.clientWidth - HEADER_W - frozenWidth
    const viewH = el.clientHeight - HEADER_H - frozenHeight
    let nextX = el.scrollLeft
    let nextY = el.scrollTop
    // 固定領域の中にあるセルはそもそも常に見えている
    if (col >= fCols) {
      if (x0 < Math.max(nextX, frozenWidth)) nextX = x0
      else if (x1 > nextX + viewW) nextX = x1 - viewW
    }
    if (row >= fRows) {
      if (y0 < Math.max(nextY, frozenHeight)) nextY = y0
      else if (y1 > nextY + viewH) nextY = y1 - viewH
    }
    if (nextX !== el.scrollLeft || nextY !== el.scrollTop) {
      el.scrollTo({ left: Math.max(0, nextX), top: Math.max(0, nextY) })
    }
  }, [selection.focus, cols, rows, sheet.frozen, sheet.colCount, sheet.rowCount])

  // --- 座標変換 ---------------------------------------------------------

  /**
   * 画面座標をグリッド座標に直す。ウィンドウ枠を固定している場合、
   * 固定領域の中ではスクロール量を足さない（そこは動かないため）。
   */
  const toGrid = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current
      if (!el) return { localX: 0, localY: 0, x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const localX = clientX - rect.left
      const localY = clientY - rect.top
      const frozenW = offsetOf(cols, Math.min(sheet.frozen?.cols ?? 0, sheet.colCount))
      const frozenH = offsetOf(rows, Math.min(sheet.frozen?.rows ?? 0, sheet.rowCount))
      const insideFrozenCols = localX - HEADER_W < frozenW
      const insideFrozenRows = localY - HEADER_H < frozenH
      const scrollX = insideFrozenCols ? 0 : Math.max(el.scrollLeft, frozenW)
      const scrollY = insideFrozenRows ? 0 : Math.max(el.scrollTop, frozenH)
      return {
        localX,
        localY,
        x: localX - HEADER_W + scrollX,
        y: localY - HEADER_H + scrollY,
      }
    },
    [cols, rows, sheet.frozen, sheet.colCount, sheet.rowCount],
  )

  const zoneOf = useCallback(
    (clientX: number, clientY: number) => {
      const { localX, localY, x, y } = toGrid(clientX, clientY)
      if (localX < HEADER_W && localY < HEADER_H) return { zone: 'corner' as const, x, y }
      if (localY < HEADER_H) return { zone: 'col-header' as const, x, y }
      if (localX < HEADER_W) return { zone: 'row-header' as const, x, y }
      return { zone: 'body' as const, x, y }
    },
    [toGrid],
  )

  const toAddr = useCallback(
    (clientX: number, clientY: number): Addr => {
      const { x, y } = toGrid(clientX, clientY)
      const addr = { row: indexAt(rows, y), col: indexAt(cols, x) }
      // 結合セルの内側をクリックしたら、その左上（マスタ）を指す
      const merge = findMerge(sheet.merges, addr)
      return merge ? { row: merge.r0, col: merge.c0 } : addr
    },
    [cols, rows, sheet.merges, toGrid],
  )

  // --- マウス操作 -------------------------------------------------------
  const snapshotSizes = (): ResizeSnapshot => ({
    colWidths: { ...sheet.colWidths },
    rowHeights: { ...sheet.rowHeights },
  })

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const store = useStore.getState()
    if (store.editing) store.commitEdit()
    scrollRef.current?.focus()

    const { zone, x, y } = zoneOf(e.clientX, e.clientY)
    const addr = toAddr(e.clientX, e.clientY)

    if (zone === 'corner') {
      store.selectAll()
      return
    }
    if (zone === 'col-header') {
      const hit = borderHit(cols, x)
      if (hit !== null) {
        dragRef.current = {
          kind: 'resize-col',
          index: hit,
          startX: e.clientX,
          startSize: sizeOf(cols, hit),
          before: snapshotSizes(),
        }
        return
      }
      store.selectColumn(addr.col, e.shiftKey)
      dragRef.current = { kind: 'select-col' }
      return
    }
    if (zone === 'row-header') {
      const hit = borderHit(rows, y)
      if (hit !== null) {
        dragRef.current = {
          kind: 'resize-row',
          index: hit,
          startY: e.clientY,
          startSize: sizeOf(rows, hit),
          before: snapshotSizes(),
        }
        return
      }
      store.selectRow(addr.row, e.shiftKey)
      dragRef.current = { kind: 'select-row' }
      return
    }

    if (e.shiftKey) store.setSelection(store.selection.anchor, addr)
    else store.setSelection(addr)
    dragRef.current = { kind: 'select' }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current
    const store = useStore.getState()

    if (!drag) {
      const { zone, x, y } = zoneOf(e.clientX, e.clientY)
      if (zone === 'col-header' && borderHit(cols, x) !== null) setCursor('col-resize')
      else if (zone === 'row-header' && borderHit(rows, y) !== null) setCursor('row-resize')
      else setCursor('default')
      return
    }

    if (drag.kind === 'resize-col') {
      const px = drag.startSize + (e.clientX - drag.startX)
      store.setColWidth(drag.index, px, false)
      return
    }
    if (drag.kind === 'resize-row') {
      const px = drag.startSize + (e.clientY - drag.startY)
      store.setRowHeight(drag.index, px, false)
      return
    }

    const addr = toAddr(e.clientX, e.clientY)
    if (drag.kind === 'select') store.setSelection(store.selection.anchor, addr)
    else if (drag.kind === 'select-col') store.selectColumn(addr.col, true)
    else if (drag.kind === 'select-row') store.selectRow(addr.row, true)
  }

  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && (drag.kind === 'resize-col' || drag.kind === 'resize-row')) {
      useStore.getState().commitResize(drag.before)
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const { zone, x, y } = zoneOf(e.clientX, e.clientY)
    const store = useStore.getState()
    if (zone === 'col-header') {
      const hit = borderHit(cols, x)
      if (hit !== null) store.setColWidth(hit, DEFAULT_COL_WIDTH)
      return
    }
    if (zone === 'row-header') {
      const hit = borderHit(rows, y)
      if (hit !== null) store.setRowHeight(hit, DEFAULT_ROW_HEIGHT)
      return
    }
    if (zone === 'body') store.beginEdit(toAddr(e.clientX, e.clientY))
  }

  // --- キーボード -------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    const store = useStore.getState()
    if (store.editing) return // 編集中のキーは CellEditor が処理する
    const mod = e.ctrlKey || e.metaKey

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
        const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (mod) store.moveToEdge(dRow, dCol, e.shiftKey)
        else store.moveSelection(dRow, dCol, e.shiftKey)
        e.preventDefault()
        return
      }
      case 'Tab':
        store.moveSelection(0, e.shiftKey ? -1 : 1, false)
        e.preventDefault()
        return
      case 'Enter':
        if (mod) return
        store.beginEdit(store.selection.anchor)
        e.preventDefault()
        return
      case 'F2':
        store.beginEdit(store.selection.anchor)
        e.preventDefault()
        return
      case 'Escape':
        store.setStatus('')
        return
      case 'Delete':
      case 'Backspace':
        store.clearSelection()
        e.preventDefault()
        return
      case 'Home':
        store.setSelection({ row: mod ? 0 : store.selection.anchor.row, col: 0 })
        e.preventDefault()
        return
      case 'PageDown':
      case 'PageUp': {
        const step = Math.max(1, Math.floor((viewport.height - HEADER_H) / DEFAULT_ROW_HEIGHT) - 1)
        store.moveSelection(e.key === 'PageDown' ? step : -step, 0, e.shiftKey)
        e.preventDefault()
        return
      }
      default:
        break
    }

    if (mod) {
      const key = e.key.toLowerCase()
      if (key === 'a') {
        store.selectAll()
        e.preventDefault()
        return
      }
      if (key === 'b') {
        store.applyStyle({ bold: true }, true)
        e.preventDefault()
        return
      }
      if (key === 'i') {
        store.applyStyle({ italic: true }, true)
        e.preventDefault()
        return
      }
      if (key === 'u') {
        store.applyStyle({ underline: true }, true)
        e.preventDefault()
        return
      }
      return // コピー・貼り付けなどは App 側のハンドラに任せる
    }

    // 直接入力で上書き編集を始める
    if (e.key.length === 1 && !e.altKey) {
      store.beginEdit(store.selection.anchor, e.key)
      e.preventDefault()
    }
  }

  // 固定領域は常に表示されるので、その分だけスクロール範囲を広げないと
  // 最終行・最終列がスクロールしても見えない
  const frozenW = offsetOf(cols, Math.min(sheet.frozen?.cols ?? 0, sheet.colCount))
  const frozenH = offsetOf(rows, Math.min(sheet.frozen?.rows ?? 0, sheet.rowCount))
  const totalW = totalSize(cols) + HEADER_W + frozenW
  const totalH = totalSize(rows) + HEADER_H + frozenH

  return (
    <div
      ref={scrollRef}
      className="grid-scroll"
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget
        setScroll({ x: el.scrollLeft, y: el.scrollTop })
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      style={{ cursor }}
    >
      <div className="grid-spacer" style={{ width: totalW, height: totalH }} />
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        style={{ width: viewport.width, height: viewport.height }}
      />
      <div className="grid-overlay">
        {editing ? (
          <CellEditor
            editing={editing}
            left={HEADER_W + offsetOf(cols, editing.addr.col) - scroll.x}
            top={HEADER_H + offsetOf(rows, editing.addr.row) - scroll.y}
            width={sizeOf(cols, editing.addr.col)}
            height={sizeOf(rows, editing.addr.row)}
          />
        ) : null}
      </div>
    </div>
  )
}
