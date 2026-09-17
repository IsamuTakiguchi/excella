/**
 * ワークブックの状態管理。
 *
 * undo/redo は「変更前のモデル全体のスナップショット」を積む方式にしている。
 * 行削除のように数式まで書き換わる操作でも確実に元へ戻せること、そして
 * HyperFormula 側の undo スタックと二重管理にならないことを優先した。
 * スナップショットは疎なオブジェクトなので MVP が想定するサイズでは十分軽い。
 */

import { create } from 'zustand'
import {
  addrToA1,
  a1ToAddr,
  a1ToRange,
  colToLetter,
  iterRange,
  makeRange,
  rangeCols,
  rangeRows,
  rangeToA1,
  type Addr,
  type Range,
} from '@shared/a1'
import { parseCsv, stringifyCsv } from '@shared/csv'
import {
  createSheet,
  createWorkbook,
  isEmptyStyle,
  type CellData,
  type CellStyle,
  type SheetModel,
  type WorkbookModel,
} from '@shared/model'
import { formatCellValue } from '@shared/numberFormat'
import { adjustFormula } from '@shared/refAdjust'
import { bridge } from '../bridge'
import { Engine, type DisplayValue } from '../engine/hf'

const UNDO_LIMIT = 50

export type ClipboardBlock = {
  /** 入力内容（数式は '=' 付き） */
  cells: Array<Array<CellData | null>>
  styles: Array<Array<CellStyle | undefined>>
  rows: number
  cols: number
  cut: boolean
  /** コピー元。相対参照の補正量と、切り取り時のクリア対象に使う */
  origin: { sheetId: string; range: Range }
  /** OS クリップボードへ書き出した TSV。外部由来かの判定に使う */
  tsv: string
}

export type Editing = {
  addr: Addr
  text: string
  /** 直接入力で始まった編集（カーソルキーで確定できる） */
  typing: boolean
} | null

type State = {
  model: WorkbookModel
  engine: Engine
  /** 再描画用のリビジョン。内容か書式が変わるたびに増える */
  revision: number
  selection: { anchor: Addr; focus: Addr }
  editing: Editing
  clipboard: ClipboardBlock | null
  filePath: string | null
  fileName: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  statusMessage: string
}

type Actions = {
  activeSheet(): SheetModel
  selectionRange(): Range
  displayValue(addr: Addr): DisplayValue
  displayText(addr: Addr): string
  inputText(addr: Addr): string
  styleAt(addr: Addr): CellStyle | undefined

  setSelection(anchor: Addr, focus?: Addr): void
  moveSelection(dRow: number, dCol: number, extend: boolean): void
  moveToEdge(dRow: number, dCol: number, extend: boolean): void
  selectAll(): void
  selectColumn(col: number, extend: boolean): void
  selectRow(row: number, extend: boolean): void

  beginEdit(addr: Addr, initial?: string): void
  updateEdit(text: string): void
  commitEdit(move?: { dRow: number; dCol: number }): void
  cancelEdit(): void

  setCellInput(addr: Addr, text: string): void
  clearSelection(): void
  applyStyle(patch: CellStyle, toggle?: boolean): void
  /** record=false はドラッグ中の連続更新用（undo 履歴を積まない） */
  setColWidth(col: number, px: number, record?: boolean): void
  setRowHeight(row: number, px: number, record?: boolean): void
  /** ドラッグ確定時に、直前の寸法を 1 つだけ undo 履歴へ積む */
  commitResize(before: {
    colWidths: Record<number, number>
    rowHeights: Record<number, number>
  }): void

  insertRows(index: number, amount: number): void
  deleteRows(index: number, amount: number): void
  insertColumns(index: number, amount: number): void
  deleteColumns(index: number, amount: number): void
  sortSelection(columnOffset: number, ascending: boolean): void

  addSheet(): void
  removeSheet(sheetId: string): void
  renameSheet(sheetId: string, name: string): void
  setActiveSheet(sheetId: string): void

  copy(cut: boolean): Promise<void>
  paste(externalText?: string): void

  undo(): void
  redo(): void

  newWorkbook(): void
  loadWorkbook(model: WorkbookModel, path: string | null, name: string): void
  markSaved(path: string, name: string): void
  setStatus(message: string): void
}

export type Store = State & Actions

/** 入力文字列をセルの内容に変換する */
export function parseInput(text: string): CellData | null {
  if (text === '') return null
  if (text.startsWith('=')) return { f: text }
  const trimmed = text.trim()
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isFinite(n)) return { v: n }
  }
  if (/^-?(\d+\.?\d*)%$/.test(trimmed)) {
    const n = Number(trimmed.slice(0, -1)) / 100
    if (Number.isFinite(n)) return { v: n }
  }
  if (trimmed === 'TRUE') return { v: true }
  if (trimmed === 'FALSE') return { v: false }
  return { v: text }
}

function cloneModel(model: WorkbookModel): WorkbookModel {
  return structuredClone(model)
}

function findSheet(model: WorkbookModel, sheetId: string): SheetModel {
  const sheet = model.sheets.find((s) => s.id === sheetId)
  if (!sheet) throw new Error(`シートが見つかりません: ${sheetId}`)
  return sheet
}

/** 行・列の挿入削除に合わせて A1 キーの Record をずらす */
function shiftKeyedRecord<T>(
  record: Record<string, T>,
  axis: 'row' | 'col',
  index: number,
  delta: number,
): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const addr = a1ToAddr(key)
    if (!addr) continue
    const pos = axis === 'row' ? addr.row : addr.col
    if (pos < index) {
      next[key] = value
      continue
    }
    if (delta < 0 && pos < index - delta) continue // 削除された範囲そのもの
    const moved =
      axis === 'row' ? { ...addr, row: addr.row + delta } : { ...addr, col: addr.col + delta }
    next[addrToA1(moved)] = value
  }
  return next
}

/** 列幅・行高のような数値キーの Record をずらす */
function shiftIndexRecord(
  record: Record<number, number>,
  index: number,
  delta: number,
): Record<number, number> {
  const next: Record<number, number> = {}
  for (const [rawKey, value] of Object.entries(record)) {
    const key = Number(rawKey)
    if (key < index) {
      next[key] = value
      continue
    }
    if (delta < 0 && key < index - delta) continue
    next[key + delta] = value
  }
  return next
}

/**
 * 行・列の挿入削除に合わせて結合セルの範囲をずらす。
 * 削除された行列に完全に飲み込まれた結合は破棄し、またがった結合は縮める。
 */
export function shiftMerges(
  merges: string[],
  axis: 'row' | 'col',
  index: number,
  delta: number,
): string[] {
  const out: string[] = []
  for (const text of merges) {
    const range = a1ToRange(text)
    if (!range) continue
    let start = axis === 'row' ? range.r0 : range.c0
    let end = axis === 'row' ? range.r1 : range.c1

    if (delta > 0) {
      // 挿入：開始位置以降は丸ごとずらし、途中に入ったものは伸ばす
      if (start >= index) {
        start += delta
        end += delta
      } else if (end >= index) {
        end += delta
      }
    } else {
      const removed = -delta
      const from = index
      const to = index + removed - 1
      if (start >= from && end <= to) continue // 完全に削除された
      if (start > to) {
        start += delta
        end += delta
      } else {
        // 重なった分だけ縮める
        const overlap = Math.max(0, Math.min(end, to) - Math.max(start, from) + 1)
        end -= overlap
        if (start > from) start = from
      }
      if (end <= start) continue // 1 セルに潰れたら結合を解除
    }

    const next =
      axis === 'row' ? { ...range, r0: start, r1: end } : { ...range, c0: start, c1: end }
    out.push(rangeToA1(next))
  }
  return out
}

/** 貼り付けなどで範囲外に書き込んだとき、シートの行数・列数を伸ばす */
function growSheet(sheet: SheetModel, lastRow: number, lastCol: number): void {
  if (lastRow >= sheet.rowCount) sheet.rowCount = lastRow + 10
  if (lastCol >= sheet.colCount) sheet.colCount = lastCol + 5
}

/** 構造操作のあと、数式が書き換わったモデル側 cells を HyperFormula から引き直す */
function syncCellsFromEngine(sheet: SheetModel, engine: Engine): void {
  const grid = engine.getSheetSerialized(sheet.id)
  const cells: Record<string, CellData> = {}
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const raw = row[c]
      if (raw === null || raw === undefined || raw === '') continue
      const key = addrToA1({ row: r, col: c })
      if (typeof raw === 'string' && raw.startsWith('=')) cells[key] = { f: raw }
      else cells[key] = { v: raw as string | number | boolean }
    }
  }
  sheet.cells = cells
}

function uniqueSheetName(model: WorkbookModel, base: string): string {
  const taken = new Set(model.sheets.map((s) => s.name))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}${i}`)) i++
  return `${base}${i}`
}

const initialModel = createWorkbook()

export const useStore = create<Store>((set, get) => {
  /** 変更前スナップショットを積んでからモデルを書き換える */
  const undoStack: WorkbookModel[] = []
  const redoStack: WorkbookModel[] = []
  /** 最後に保存（または新規作成・読み込み）した時点のモデル。dirty 判定に使う */
  let savedModel: WorkbookModel | null = null

  /** undo/redo で戻った先が保存時点と同じなら「未保存」を解除する */
  const isSameAsSaved = (model: WorkbookModel): boolean =>
    savedModel !== null && JSON.stringify(model) === JSON.stringify(savedModel)

  const markDirty = () => {
    bridge.setDirty(true)
  }

  /**
   * モデルを変更する共通経路。
   * mutate 内ではモデル（クローン済み）と engine を自由に触ってよい。
   */
  const mutate = (fn: (model: WorkbookModel, engine: Engine) => void, record = true): void => {
    const { model, engine } = get()
    if (record) {
      undoStack.push(cloneModel(model))
      if (undoStack.length > UNDO_LIMIT) undoStack.shift()
      redoStack.length = 0
    }
    const next = cloneModel(model)
    fn(next, engine)
    set({
      model: next,
      revision: get().revision + 1,
      dirty: true,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    })
    markDirty()
  }

  const clampAddr = (addr: Addr, sheet: SheetModel): Addr => ({
    row: Math.max(0, Math.min(addr.row, sheet.rowCount - 1)),
    col: Math.max(0, Math.min(addr.col, sheet.colCount - 1)),
  })

  return {
    model: initialModel,
    engine: new Engine(initialModel),
    revision: 0,
    selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
    editing: null,
    clipboard: null,
    filePath: null,
    fileName: '新しいブック',
    dirty: false,
    canUndo: false,
    canRedo: false,
    statusMessage: '',

    activeSheet: () => findSheet(get().model, get().model.activeSheetId),
    selectionRange: () => makeRange(get().selection.anchor, get().selection.focus),

    displayValue: (addr) => get().engine.getValue(get().model.activeSheetId, addr),

    displayText: (addr) => {
      const state = get()
      const style = state.styleAt(addr)
      return formatCellValue(state.displayValue(addr), style?.numFmt)
    },

    inputText: (addr) => get().engine.getSerialized(get().model.activeSheetId, addr),

    styleAt: (addr) => get().activeSheet().styles[addrToA1(addr)],

    setSelection: (anchor, focus) => {
      const sheet = get().activeSheet()
      const a = clampAddr(anchor, sheet)
      set({ selection: { anchor: a, focus: focus ? clampAddr(focus, sheet) : a } })
    },

    moveSelection: (dRow, dCol, extend) => {
      const { selection } = get()
      const sheet = get().activeSheet()
      if (extend) {
        const focus = clampAddr(
          { row: selection.focus.row + dRow, col: selection.focus.col + dCol },
          sheet,
        )
        set({ selection: { anchor: selection.anchor, focus } })
      } else {
        const next = clampAddr(
          { row: selection.anchor.row + dRow, col: selection.anchor.col + dCol },
          sheet,
        )
        set({ selection: { anchor: next, focus: next } })
      }
    },

    moveToEdge: (dRow, dCol, extend) => {
      const state = get()
      const sheet = state.activeSheet()
      const from = extend ? state.selection.focus : state.selection.anchor
      let { row, col } = from
      const occupied = (a: Addr) => sheet.cells[addrToA1(a)] !== undefined
      const step = () => ({ row: row + dRow, col: col + dCol })
      const inside = (a: Addr) =>
        a.row >= 0 && a.col >= 0 && a.row < sheet.rowCount && a.col < sheet.colCount

      if (!inside(step())) {
        // そのまま端へ
      } else if (occupied(from) && occupied(step())) {
        while (inside(step()) && occupied(step())) ({ row, col } = step())
      } else {
        let moved = false
        while (inside(step())) {
          ;({ row, col } = step())
          if (occupied({ row, col })) {
            moved = true
            break
          }
        }
        if (!moved) {
          row = dRow > 0 ? sheet.rowCount - 1 : dRow < 0 ? 0 : row
          col = dCol > 0 ? sheet.colCount - 1 : dCol < 0 ? 0 : col
        }
      }
      const target = clampAddr({ row, col }, sheet)
      if (extend) set({ selection: { anchor: state.selection.anchor, focus: target } })
      else set({ selection: { anchor: target, focus: target } })
    },

    selectAll: () => {
      const sheet = get().activeSheet()
      set({
        selection: {
          anchor: { row: 0, col: 0 },
          focus: { row: sheet.rowCount - 1, col: sheet.colCount - 1 },
        },
      })
    },

    selectColumn: (col, extend) => {
      const state = get()
      const sheet = state.activeSheet()
      const anchor = extend ? state.selection.anchor : { row: 0, col }
      set({ selection: { anchor, focus: { row: sheet.rowCount - 1, col } } })
    },

    selectRow: (row, extend) => {
      const state = get()
      const sheet = state.activeSheet()
      const anchor = extend ? state.selection.anchor : { row, col: 0 }
      set({ selection: { anchor, focus: { row, col: sheet.colCount - 1 } } })
    },

    beginEdit: (addr, initial) => {
      const text = initial !== undefined ? initial : get().inputText(addr)
      set({
        editing: { addr, text, typing: initial !== undefined },
        selection: { anchor: addr, focus: addr },
      })
    },

    updateEdit: (text) => {
      const editing = get().editing
      if (!editing) return
      set({ editing: { ...editing, text } })
    },

    commitEdit: (move) => {
      const editing = get().editing
      if (!editing) return
      const { addr, text } = editing
      set({ editing: null })
      if (text !== get().inputText(addr)) get().setCellInput(addr, text)
      if (move) get().moveSelection(move.dRow, move.dCol, false)
    },

    cancelEdit: () => set({ editing: null }),

    setCellInput: (addr, text) => {
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        const key = addrToA1(addr)
        const data = parseInput(text)
        if (data === null) delete sheet.cells[key]
        else sheet.cells[key] = data
        engine.setContent(
          model.activeSheetId,
          addr,
          data === null ? null : (data.f ?? data.v ?? null),
        )
      })
    },

    clearSelection: () => {
      const range = get().selectionRange()
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        const block: Array<Array<null>> = []
        for (let r = range.r0; r <= range.r1; r++) {
          block.push(new Array(rangeCols(range)).fill(null))
          for (let c = range.c0; c <= range.c1; c++)
            delete sheet.cells[addrToA1({ row: r, col: c })]
        }
        engine.setBlock(model.activeSheetId, { row: range.r0, col: range.c0 }, block)
      })
    },

    applyStyle: (patch, toggle = false) => {
      const range = get().selectionRange()
      const current = get().styleAt(get().selection.anchor)
      mutate((model) => {
        const sheet = findSheet(model, model.activeSheetId)
        for (const addr of iterRange(range)) {
          const key = addrToA1(addr)
          const base = sheet.styles[key] ?? {}
          const next: CellStyle = { ...base }
          for (const [prop, value] of Object.entries(patch) as Array<
            [keyof CellStyle, CellStyle[keyof CellStyle]]
          >) {
            if (toggle && typeof value === 'boolean') {
              // アンカーセルの状態を基準に、範囲全体を同じ状態へそろえる
              const on = !(current?.[prop] as boolean | undefined)
              if (on) (next[prop] as boolean) = true
              else delete next[prop]
            } else if (value === undefined) {
              delete next[prop]
            } else {
              ;(next[prop] as CellStyle[keyof CellStyle]) = value
            }
          }
          if (isEmptyStyle(next)) delete sheet.styles[key]
          else sheet.styles[key] = next
        }
      })
    },

    setColWidth: (col, px, record = true) => {
      mutate((model) => {
        const sheet = findSheet(model, model.activeSheetId)
        sheet.colWidths[col] = Math.max(24, Math.round(px))
      }, record)
    },

    setRowHeight: (row, px, record = true) => {
      mutate((model) => {
        const sheet = findSheet(model, model.activeSheetId)
        sheet.rowHeights[row] = Math.max(14, Math.round(px))
      }, record)
    },

    commitResize: (before) => {
      // ドラッグ開始時点の寸法を持つスナップショットを作って履歴に積む。
      // こうするとドラッグ全体が undo 1 回で元に戻る。
      const { model } = get()
      const snapshot = cloneModel(model)
      const sheet = snapshot.sheets.find((s) => s.id === snapshot.activeSheetId)
      if (sheet) {
        sheet.colWidths = { ...before.colWidths }
        sheet.rowHeights = { ...before.rowHeights }
      }
      undoStack.push(snapshot)
      if (undoStack.length > UNDO_LIMIT) undoStack.shift()
      redoStack.length = 0
      set({ canUndo: true, canRedo: false })
    },

    insertRows: (index, amount) => {
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        engine.addRows(sheet.id, index, amount)
        sheet.merges = shiftMerges(sheet.merges, 'row', index, +amount)
        sheet.styles = shiftKeyedRecord(sheet.styles, 'row', index, amount)
        sheet.rowHeights = shiftIndexRecord(sheet.rowHeights, index, amount)
        sheet.rowCount += amount
        syncCellsFromEngine(sheet, engine)
      })
    },

    deleteRows: (index, amount) => {
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        engine.removeRows(sheet.id, index, amount)
        sheet.merges = shiftMerges(sheet.merges, 'row', index, -amount)
        sheet.styles = shiftKeyedRecord(sheet.styles, 'row', index, -amount)
        sheet.rowHeights = shiftIndexRecord(sheet.rowHeights, index, -amount)
        sheet.rowCount = Math.max(1, sheet.rowCount - amount)
        syncCellsFromEngine(sheet, engine)
      })
    },

    insertColumns: (index, amount) => {
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        engine.addColumns(sheet.id, index, amount)
        sheet.merges = shiftMerges(sheet.merges, 'col', index, +amount)
        sheet.styles = shiftKeyedRecord(sheet.styles, 'col', index, amount)
        sheet.colWidths = shiftIndexRecord(sheet.colWidths, index, amount)
        sheet.colCount += amount
        syncCellsFromEngine(sheet, engine)
      })
    },

    deleteColumns: (index, amount) => {
      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        engine.removeColumns(sheet.id, index, amount)
        sheet.merges = shiftMerges(sheet.merges, 'col', index, -amount)
        sheet.styles = shiftKeyedRecord(sheet.styles, 'col', index, -amount)
        sheet.colWidths = shiftIndexRecord(sheet.colWidths, index, -amount)
        sheet.colCount = Math.max(1, sheet.colCount - amount)
        syncCellsFromEngine(sheet, engine)
      })
    },

    sortSelection: (columnOffset, ascending) => {
      const state = get()
      const range = state.selectionRange()
      if (rangeRows(range) < 2) {
        set({ statusMessage: '並べ替えるには 2 行以上を選択してください' })
        return
      }
      const sortCol = range.c0 + columnOffset
      const values = state.engine.getRangeValues(state.model.activeSheetId, range)
      const inputs = state.engine.getRangeSerialized(state.model.activeSheetId, range)

      const order = values
        .map((row, i) => ({ i, key: row[columnOffset] }))
        .sort((a, b) => compareValues(a.key, b.key) * (ascending ? 1 : -1) || a.i - b.i)

      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)
        const styleRows: Array<Array<CellStyle | undefined>> = []
        for (let r = range.r0; r <= range.r1; r++) {
          const row: Array<CellStyle | undefined> = []
          for (let c = range.c0; c <= range.c1; c++) {
            row.push(sheet.styles[addrToA1({ row: r, col: c })])
          }
          styleRows.push(row)
        }

        const block: Array<Array<string | number | boolean | null>> = []
        order.forEach(({ i }, newIndex) => {
          const src = inputs[i] ?? []
          const out: Array<string | number | boolean | null> = []
          for (let c = 0; c < rangeCols(range); c++) {
            const raw = src[c]
            if (typeof raw === 'string' && raw.startsWith('=')) {
              // 行が動くぶんだけ相対参照をずらす
              out.push(adjustFormula(raw, newIndex - i, 0))
            } else {
              out.push((raw ?? null) as string | number | boolean | null)
            }
            const style = styleRows[i]?.[c]
            const key = addrToA1({ row: range.r0 + newIndex, col: range.c0 + c })
            if (style) sheet.styles[key] = structuredClone(style)
            else delete sheet.styles[key]
          }
          block.push(out)
        })

        engine.setBlock(model.activeSheetId, { row: range.r0, col: range.c0 }, block)
        syncCellsFromEngine(sheet, engine)
      })
      set({ statusMessage: `${colToLetter(sortCol)} 列で並べ替えました` })
    },

    addSheet: () => {
      const newId = createSheet('tmp')
      mutate((model, engine) => {
        const name = uniqueSheetName(model, `Sheet${model.sheets.length + 1}`)
        newId.name = name
        model.sheets.push(newId)
        model.activeSheetId = newId.id
        engine.addSheet(newId.id, name)
      })
      set({ selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } } })
    },

    removeSheet: (sheetId) => {
      if (get().model.sheets.length <= 1) {
        set({ statusMessage: 'シートは 1 つ以上必要です' })
        return
      }
      mutate((model, engine) => {
        const index = model.sheets.findIndex((s) => s.id === sheetId)
        if (index < 0) return
        engine.removeSheet(sheetId)
        model.sheets.splice(index, 1)
        if (model.activeSheetId === sheetId) {
          model.activeSheetId = model.sheets[Math.max(0, index - 1)].id
        }
      })
    },

    renameSheet: (sheetId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const model = get().model
      if (model.sheets.some((s) => s.id !== sheetId && s.name === trimmed)) {
        set({ statusMessage: '同じ名前のシートがあります' })
        return
      }
      mutate((next, engine) => {
        const sheet = findSheet(next, sheetId)
        engine.renameSheet(sheetId, trimmed)
        sheet.name = trimmed
      })
    },

    setActiveSheet: (sheetId) => {
      const model = get().model
      if (!model.sheets.some((s) => s.id === sheetId)) return
      set({
        model: { ...model, activeSheetId: sheetId },
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        editing: null,
        revision: get().revision + 1,
      })
    },

    copy: async (cut) => {
      const state = get()
      const range = state.selectionRange()
      const sheet = state.activeSheet()
      const inputs = state.engine.getRangeSerialized(state.model.activeSheetId, range)

      const cells: Array<Array<CellData | null>> = []
      const styles: Array<Array<CellStyle | undefined>> = []
      const tsvRows: string[][] = []
      for (let r = 0; r < rangeRows(range); r++) {
        const cellRow: Array<CellData | null> = []
        const styleRow: Array<CellStyle | undefined> = []
        const tsvRow: string[] = []
        for (let c = 0; c < rangeCols(range); c++) {
          const raw = inputs[r]?.[c]
          if (raw === null || raw === undefined || raw === '') cellRow.push(null)
          else if (typeof raw === 'string' && raw.startsWith('=')) cellRow.push({ f: raw })
          else cellRow.push({ v: raw as string | number | boolean })
          const addr = { row: range.r0 + r, col: range.c0 + c }
          styleRow.push(sheet.styles[addrToA1(addr)])
          tsvRow.push(state.displayText(addr))
        }
        cells.push(cellRow)
        styles.push(styleRow)
        tsvRows.push(tsvRow)
      }

      const tsv = stringifyCsv(tsvRows, '\t')
      set({
        clipboard: {
          cells,
          styles,
          rows: rangeRows(range),
          cols: rangeCols(range),
          cut,
          origin: { sheetId: state.model.activeSheetId, range },
          tsv,
        },
        statusMessage: cut ? '切り取りました' : 'コピーしました',
      })

      try {
        await navigator.clipboard.writeText(tsv)
      } catch {
        // クリップボード権限がない環境ではアプリ内クリップボードだけで動く
      }
    },

    paste: (externalText) => {
      const state = get()
      const clip = state.clipboard
      const target = state.selectionRange()
      const topLeft = { row: target.r0, col: target.c0 }

      // OS クリップボードの中身が自前のコピーと違う＝外部由来なら TSV として貼る
      const useExternal =
        externalText !== undefined && externalText !== '' && (!clip || externalText !== clip.tsv)

      if (useExternal) {
        const rows = parseCsv(externalText, '\t')
        if (rows.length === 0) return
        mutate((model, engine) => {
          const sheet = findSheet(model, model.activeSheetId)
          const block: Array<Array<string | number | boolean | null>> = []
          rows.forEach((row, r) => {
            const out: Array<string | number | boolean | null> = []
            row.forEach((text, c) => {
              const data = parseInput(text)
              const key = addrToA1({ row: topLeft.row + r, col: topLeft.col + c })
              if (data === null) delete sheet.cells[key]
              else sheet.cells[key] = data
              out.push(data === null ? null : (data.f ?? data.v ?? null))
            })
            block.push(out)
          })
          growSheet(
            sheet,
            topLeft.row + rows.length - 1,
            topLeft.col + Math.max(...rows.map((r) => r.length)) - 1,
          )
          engine.setBlock(model.activeSheetId, topLeft, block)
        })
        set({
          selection: {
            anchor: topLeft,
            focus: {
              row: topLeft.row + rows.length - 1,
              col: topLeft.col + Math.max(...rows.map((r) => r.length)) - 1,
            },
          },
        })
        return
      }

      if (!clip) return
      // 貼り付け先とコピー元のずれ。切り取りのときは Excel と同じく参照をずらさない
      const dRow = clip.cut ? 0 : topLeft.row - clip.origin.range.r0
      const dCol = clip.cut ? 0 : topLeft.col - clip.origin.range.c0

      mutate((model, engine) => {
        const sheet = findSheet(model, model.activeSheetId)

        // 切り取り元を先に消す。別シートから切り取った場合もあるので、
        // モデル側のクリア対象は必ずコピー元のシートにする
        if (clip.cut) {
          const src = clip.origin.range
          const srcSheet = model.sheets.find((s) => s.id === clip.origin.sheetId)
          const blank: Array<Array<null>> = []
          for (let r = src.r0; r <= src.r1; r++) {
            blank.push(new Array(rangeCols(src)).fill(null))
            if (!srcSheet) continue
            for (let c = src.c0; c <= src.c1; c++) {
              const key = addrToA1({ row: r, col: c })
              delete srcSheet.cells[key]
              delete srcSheet.styles[key]
            }
          }
          if (srcSheet) {
            engine.setBlock(clip.origin.sheetId, { row: src.r0, col: src.c0 }, blank)
          }
        }

        const block: Array<Array<string | number | boolean | null>> = []
        for (let r = 0; r < clip.rows; r++) {
          const out: Array<string | number | boolean | null> = []
          for (let c = 0; c < clip.cols; c++) {
            const src = clip.cells[r][c]
            const key = addrToA1({ row: topLeft.row + r, col: topLeft.col + c })
            if (src === null) {
              delete sheet.cells[key]
              out.push(null)
            } else if (src.f !== undefined) {
              const shifted = adjustFormula(src.f, dRow, dCol)
              sheet.cells[key] = { f: shifted }
              out.push(shifted)
            } else {
              sheet.cells[key] = { v: src.v as string | number | boolean }
              out.push(src.v ?? null)
            }
            const style = clip.styles[r][c]
            if (style) sheet.styles[key] = structuredClone(style)
            else delete sheet.styles[key]
          }
          block.push(out)
        }
        growSheet(sheet, topLeft.row + clip.rows - 1, topLeft.col + clip.cols - 1)
        engine.setBlock(model.activeSheetId, topLeft, block)
      })

      set({
        clipboard: clip.cut ? null : clip,
        selection: {
          anchor: topLeft,
          focus: { row: topLeft.row + clip.rows - 1, col: topLeft.col + clip.cols - 1 },
        },
      })
    },

    undo: () => {
      const snapshot = undoStack.pop()
      if (!snapshot) return
      const { model, engine } = get()
      redoStack.push(cloneModel(model))
      engine.rebuild(snapshot)
      const clean = isSameAsSaved(snapshot)
      set({
        model: snapshot,
        revision: get().revision + 1,
        editing: null,
        dirty: !clean,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      })
      bridge.setDirty(!clean)
    },

    redo: () => {
      const snapshot = redoStack.pop()
      if (!snapshot) return
      const { model, engine } = get()
      undoStack.push(cloneModel(model))
      engine.rebuild(snapshot)
      const clean = isSameAsSaved(snapshot)
      set({
        model: snapshot,
        revision: get().revision + 1,
        editing: null,
        dirty: !clean,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      })
      bridge.setDirty(!clean)
    },

    newWorkbook: () => {
      const model = createWorkbook()
      get().engine.rebuild(model)
      savedModel = cloneModel(model)
      undoStack.length = 0
      redoStack.length = 0
      set({
        model,
        revision: get().revision + 1,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        editing: null,
        filePath: null,
        fileName: '新しいブック',
        dirty: false,
        canUndo: false,
        canRedo: false,
        statusMessage: '',
      })
      bridge.setDirty(false)
    },

    loadWorkbook: (model, path, name) => {
      get().engine.rebuild(model)
      savedModel = cloneModel(model)
      undoStack.length = 0
      redoStack.length = 0
      set({
        model,
        revision: get().revision + 1,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        editing: null,
        filePath: path,
        fileName: name,
        dirty: false,
        canUndo: false,
        canRedo: false,
        statusMessage: `${name} を開きました`,
      })
      bridge.setDirty(false)
    },

    markSaved: (path, name) => {
      savedModel = cloneModel(get().model)
      set({ filePath: path, fileName: name, dirty: false, statusMessage: `${name} に保存しました` })
      bridge.setDirty(false)
    },

    setStatus: (message) => set({ statusMessage: message }),
  }
})

function compareValues(a: DisplayValue, b: DisplayValue): number {
  const aEmpty = a === null || a === ''
  const bEmpty = b === null || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1 // 空白は常に末尾
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return String(a).localeCompare(String(b), 'ja')
}
