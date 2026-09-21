import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { a1ToRange, findMerge, type Addr, type Range } from '@shared/a1'
import { isFormula, parseRefs } from '@shared/formulaRefs'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '@shared/model'
import { useStore } from '../store/workbookStore'
import {
  autofitWidth,
  borderHit,
  buildSizes,
  HEADER_H,
  HEADER_W,
  indexAt,
  offsetOf,
  sizeOf,
  totalSize,
} from './geometry'
import { cellFontOf, FILL_HANDLE_SIZE, paint, REF_COLORS } from './painter'
import { CellInput } from './CellInput'
import { focusGrid, gridInput, isGridInput, isTouchDevice } from './focus'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../ui/ContextMenu'

type DragState =
  | { kind: 'select' }
  | { kind: 'fill'; source: Range }
  /** 数式の参照選択（ポイントモード）中のドラッグ */
  | { kind: 'point' }
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

/**
 * フィルのドラッグ位置から、伸ばす範囲を決める。
 * Excel と同じく、縦と横のうち動かした量が大きい方だけに伸ばす。
 */
function fillTargetOf(source: Range, addr: Addr): Range {
  const dDown = addr.row - source.r1
  const dUp = source.r0 - addr.row
  const dRight = addr.col - source.c1
  const dLeft = source.c0 - addr.col
  const vertical = Math.max(dDown, dUp, 0)
  const horizontal = Math.max(dRight, dLeft, 0)
  if (vertical === 0 && horizontal === 0) return source
  if (vertical >= horizontal) {
    return dDown >= dUp ? { ...source, r1: addr.row } : { ...source, r0: addr.row }
  }
  return dRight >= dLeft ? { ...source, c1: addr.col } : { ...source, c0: addr.col }
}

export function SheetCanvas(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState>(null)

  const [viewport, setViewport] = useState({ width: 800, height: 600 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<'default' | 'col-resize' | 'row-resize' | 'crosshair'>(
    'default',
  )
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [fillPreview, setFillPreview] = useState<Range | null>(null)

  const revision = useStore((s) => s.revision)
  const selection = useStore((s) => s.selection)
  const editing = useStore((s) => s.editing)
  const pointing = useStore((s) => s.pointing)
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

  /**
   * 編集中の数式が参照しているセル。Excel と同じく参照ごとに色を変えて囲む。
   * 参照選択中の参照は差し込み位置（prefix の長さ）で見分けられるので、
   * 同じ色の点線で「いま動かしている参照」だと分かるようにする。
   */
  const { formulaRefs, pointingRef } = useMemo(() => {
    const refs: Array<{ range: Range; color: string }> = []
    let pointed: { range: Range; color: string } | null = null
    if (editing && isFormula(editing.text)) {
      parseRefs(editing.text).forEach((span, index) => {
        const range = a1ToRange(span.text)
        if (!range) return
        const color = REF_COLORS[index % REF_COLORS.length]
        refs.push({ range, color })
        if (pointing && span.start === pointing.prefix.length) pointed = { range, color }
      })
    }
    return { formulaRefs: refs, pointingRef: pointed }
  }, [editing, pointing])

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
      fillPreview,
      formulaRefs,
      pointing: pointingRef,
    })
  }, [
    revision,
    selection,
    editing,
    clipboard,
    scroll,
    viewport,
    cols,
    rows,
    sheet,
    merges,
    fillPreview,
    formulaRefs,
    pointingRef,
  ])

  // --- アクティブセルを可視域に入れる -----------------------------------
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 参照選択中は、参照しているセルの方を画面内に入れる
    const { row, col } = pointing ? pointing.focus : selection.focus
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
  }, [selection.focus, pointing, cols, rows, sheet.frozen, sheet.colCount, sheet.rowCount])

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

  /** 列の内容に合わせた幅を計算する（ヘッダ境界のダブルクリック用） */
  const autofitColumn = useCallback(
    (col: number): number => {
      const ctx = canvasRef.current?.getContext('2d')
      const state = useStore.getState()
      if (!ctx) return DEFAULT_COL_WIDTH
      return autofitWidth(sheet.rowCount, (row) => {
        const text = state.displayText({ row, col })
        if (!text) return 0
        ctx.save()
        ctx.font = cellFontOf(state.styleAt({ row, col }))
        const width = ctx.measureText(text).width
        ctx.restore()
        return width
      })
    },
    [sheet.rowCount],
  )

  // --- マウス操作 -------------------------------------------------------
  const snapshotSizes = (): ResizeSnapshot => ({
    colWidths: { ...sheet.colWidths },
    rowHeights: { ...sheet.rowHeights },
  })

  /** 選択範囲の右下のフィルハンドルを掴んだか */
  const isOnFillHandle = (x: number, y: number): boolean => {
    const sel = useStore.getState().selectionRange()
    const hx = offsetOf(cols, sel.c1 + 1)
    const hy = offsetOf(rows, sel.r1 + 1)
    const half = FILL_HANDLE_SIZE
    return Math.abs(x - hx) <= half && Math.abs(y - hy) <= half
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    // 既定動作に任せるとフォーカスがクリック先（body）へ移り、以後の
    // キー入力がどこにも届かなくなる。入力欄自体を押した場合だけは
    // キャレット移動のために既定動作を残す
    if (!isGridInput(e.target)) e.preventDefault()
    const store = useStore.getState()
    focusGrid()

    const { zone, x, y } = zoneOf(e.clientX, e.clientY)
    const addr = toAddr(e.clientX, e.clientY)

    // 数式の参照選択（ポイントモード）。`=SUM(` まで打った状態でセルを
    // クリックしたら、確定ではなく参照の差し込みになる（Excel と同じ）。
    // 参照を差し込めない位置（数式が完成している）ときは、下の通常の処理で確定する
    if (zone === 'body' && store.editing && isFormula(store.editing.text)) {
      if (store.pointing) {
        store.setPointing(addr)
        dragRef.current = { kind: 'point' }
        return
      }
      const caret = gridInput()?.selectionStart ?? store.editing.text.length
      if (store.startPointing(addr, caret)) {
        dragRef.current = { kind: 'point' }
        return
      }
    }

    if (store.editing) store.commitEdit()

    if (zone === 'body' && isOnFillHandle(x, y)) {
      dragRef.current = { kind: 'fill', source: store.selectionRange() }
      setFillPreview(store.selectionRange())
      return
    }

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

    // タッチ端末：選択中のセルをもう一度タップしたら編集を始める
    // （ダブルタップはブラウザによって dblclick にならないため）
    if (isTouchDevice() && !e.shiftKey && zone === 'body') {
      const range = store.selectionRange()
      const single = range.r0 === range.r1 && range.c0 === range.c1
      const anchor = store.selection.anchor
      if (single && anchor.row === addr.row && anchor.col === addr.col) {
        store.beginEdit(addr)
        return
      }
    }

    if (e.shiftKey) store.setSelection(store.selection.anchor, addr)
    else store.setSelection(addr)
    dragRef.current = { kind: 'select' }
  }

  // --- 長押し（タッチ端末の右クリック相当） -----------------------------
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }
  const onTouchStart = (e: React.TouchEvent) => {
    cancelLongPress()
    if (e.touches.length !== 1) return
    const { clientX, clientY } = e.touches[0]
    const timer = window.setTimeout(() => {
      longPressRef.current = null
      openContextMenu(clientX, clientY)
    }, 500)
    longPressRef.current = { timer, x: clientX, y: clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const pressed = longPressRef.current
    if (!pressed) return
    const t = e.touches[0]
    // 指が動いたらスクロールなので長押しにしない
    if (Math.abs(t.clientX - pressed.x) > 10 || Math.abs(t.clientY - pressed.y) > 10) {
      cancelLongPress()
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current
    const store = useStore.getState()

    if (!drag) {
      const { zone, x, y } = zoneOf(e.clientX, e.clientY)
      if (zone === 'col-header' && borderHit(cols, x) !== null) setCursor('col-resize')
      else if (zone === 'row-header' && borderHit(rows, y) !== null) setCursor('row-resize')
      else if (zone === 'body' && isOnFillHandle(x, y)) setCursor('crosshair')
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
    if (drag.kind === 'point') {
      const pointed = store.pointing
      if (pointed) store.setPointing(pointed.anchor, addr)
      return
    }
    if (drag.kind === 'fill') {
      setFillPreview(fillTargetOf(drag.source, addr))
      return
    }
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
    if (drag?.kind === 'fill') {
      const target = fillPreview
      setFillPreview(null)
      if (target) useStore.getState().fillFrom(drag.source, target)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // タッチ端末では長押しのタイマーから開く（ブラウザが出す contextmenu と二重にしない）
    if (isTouchDevice()) return
    openContextMenu(e.clientX, e.clientY)
  }

  const openContextMenu = (clientX: number, clientY: number) => {
    const store = useStore.getState()
    if (store.editing) store.commitEdit()
    focusGrid()

    const { zone } = zoneOf(clientX, clientY)
    const addr = toAddr(clientX, clientY)

    // 選択範囲の外を右クリックしたら、そのセルを選び直す
    const range = store.selectionRange()
    const inside =
      addr.row >= range.r0 && addr.row <= range.r1 && addr.col >= range.c0 && addr.col <= range.c1
    if (zone === 'col-header') store.selectColumn(addr.col, false)
    else if (zone === 'row-header') store.selectRow(addr.row, false)
    else if (!inside) store.setSelection(addr)

    const sel = useStore.getState().selectionRange()
    const rowSpan = sel.r1 - sel.r0 + 1
    const colSpan = sel.c1 - sel.c0 + 1

    const items: ContextMenuItem[] = [
      { kind: 'item', label: '切り取り', onSelect: () => void useStore.getState().copy(true) },
      { kind: 'item', label: 'コピー', onSelect: () => void useStore.getState().copy(false) },
      {
        kind: 'item',
        label: '貼り付け',
        disabled: useStore.getState().clipboard === null,
        onSelect: () => useStore.getState().paste(),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: `${rowSpan} 行を挿入`,
        onSelect: () => useStore.getState().insertRows(sel.r0, rowSpan),
      },
      {
        kind: 'item',
        label: `${rowSpan} 行を削除`,
        onSelect: () => useStore.getState().deleteRows(sel.r0, rowSpan),
      },
      {
        kind: 'item',
        label: `${colSpan} 列を挿入`,
        onSelect: () => useStore.getState().insertColumns(sel.c0, colSpan),
      },
      {
        kind: 'item',
        label: `${colSpan} 列を削除`,
        onSelect: () => useStore.getState().deleteColumns(sel.c0, colSpan),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'セルを結合／解除',
        onSelect: () => useStore.getState().toggleMerge(),
      },
      {
        kind: 'item',
        label: 'ウィンドウ枠の固定／解除',
        onSelect: () => useStore.getState().toggleFreeze(),
      },
      { kind: 'separator' },
      { kind: 'item', label: '内容をクリア', onSelect: () => useStore.getState().clearSelection() },
      {
        kind: 'item',
        label: '書式をクリア',
        onSelect: () => useStore.getState().clearStyles(),
      },
    ]

    setContextMenu({ x: clientX, y: clientY, items })
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const { zone, x, y } = zoneOf(e.clientX, e.clientY)
    const store = useStore.getState()
    // 参照選択中の 2 度目のクリックは mousedown 側で処理済み。
    // ここで編集を始め直すと、書きかけの数式が消えてしまう
    if (store.pointing) return
    if (zone === 'col-header') {
      const hit = borderHit(cols, x)
      // Excel と同じく、境界のダブルクリックは内容に合わせた幅にする
      if (hit !== null) store.setColWidth(hit, autofitColumn(hit))
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
    // 印字可能なキーは握りつぶさず入力欄へ流す。
    // そこで onInput / compositionstart が拾って編集を始めるので、
    // 半角英数でも日本語でも同じ経路になる
  }

  // 固定領域は常に表示されるので、その分だけスクロール範囲を広げないと
  // 最終行・最終列がスクロールしても見えない
  const frozenW = offsetOf(cols, Math.min(sheet.frozen?.cols ?? 0, sheet.colCount))
  const frozenH = offsetOf(rows, Math.min(sheet.frozen?.rows ?? 0, sheet.rowCount))
  const totalW = totalSize(cols) + HEADER_W + frozenW
  const totalH = totalSize(rows) + HEADER_H + frozenH
  // 入力欄はアクティブセルの上に置く。IME の変換候補もここに出る
  const inputAddr = editing ? editing.addr : selection.anchor

  return (
    // オーバーレイはスクロール内容の外に置く。中に入れると通常フローで
    // canvas の下へ流れてしまい、編集中の入力欄がグリッドの外に出る
    <div className="grid-wrap" onKeyDown={onKeyDown}>
      <div
        ref={scrollRef}
        className="grid-scroll"
        onScroll={(e) => {
          const el = e.currentTarget
          setScroll({ x: el.scrollLeft, y: el.scrollTop })
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        style={{ cursor }}
      >
        <div className="grid-spacer" style={{ width: totalW, height: totalH }} />
        <canvas
          ref={canvasRef}
          className="grid-canvas"
          style={{ width: viewport.width, height: viewport.height }}
        />
      </div>
      <div className="grid-overlay">
        {contextMenu ? (
          <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
        ) : null}
        <CellInput
          editing={editing}
          left={HEADER_W + offsetOf(cols, inputAddr.col) - scroll.x}
          top={HEADER_H + offsetOf(rows, inputAddr.row) - scroll.y}
          width={sizeOf(cols, inputAddr.col)}
          height={sizeOf(rows, inputAddr.row)}
        />
      </div>
    </div>
  )
}
