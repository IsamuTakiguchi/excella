import { useCallback, useEffect } from 'react'
import { formatCellValue } from '@shared/numberFormat'
import type { MenuAction, SerializedResults } from '@shared/ipc'
import { bridge, hasFileAccess } from './bridge'
import { SheetCanvas } from './grid/SheetCanvas'
import { useStore } from './store/workbookStore'
import { FormulaBar } from './ui/FormulaBar'
import { SheetTabs } from './ui/SheetTabs'
import { StatusBar } from './ui/StatusBar'
import { Toolbar } from './ui/Toolbar'

export function App(): React.JSX.Element {
  const save = useCallback(async (asNew: boolean) => {
    const state = useStore.getState()
    const results: SerializedResults = state.model.sheets.map((sheet) => [
      sheet.id,
      [...state.engine.getResultMap(sheet).entries()],
    ])
    const result = await bridge.saveWorkbook(
      asNew ? null : state.filePath,
      state.model,
      results,
    )
    if (result) state.markSaved(result.path, result.name)
  }, [])

  const open = useCallback(async () => {
    const state = useStore.getState()
    if (state.dirty && !confirm('保存していない変更があります。破棄して開きますか？')) return
    const result = await bridge.openWorkbook()
    if (result) state.loadWorkbook(result.model, result.path, result.name)
  }, [])

  const exportCsv = useCallback(async () => {
    const state = useStore.getState()
    const sheet = state.activeSheet()
    const display = state.engine.getDisplayMap(sheet.id, (value, key) =>
      formatCellValue(value, sheet.styles[key]?.numFmt),
    )
    const result = await bridge.exportCsv(state.model, sheet.id, [...display.entries()])
    if (result) state.setStatus(`${result.name} に書き出しました`)
  }, [])

  const handleMenu = useCallback(
    (action: MenuAction) => {
      const store = useStore.getState()
      switch (action) {
        case 'new':
          if (store.dirty && !confirm('保存していない変更があります。破棄しますか？')) return
          store.newWorkbook()
          return
        case 'open':
          void open()
          return
        case 'save':
          void save(false)
          return
        case 'save-as':
          void save(true)
          return
        case 'export-csv':
          void exportCsv()
          return
        case 'undo':
          store.undo()
          return
        case 'redo':
          store.redo()
          return
        case 'cut':
          void store.copy(true)
          return
        case 'copy':
          void store.copy(false)
          return
        case 'paste':
          void pasteFromClipboard()
          return
        case 'delete':
          store.clearSelection()
          return
        case 'select-all':
          store.selectAll()
          return
        default:
          return
      }
    },
    [open, save, exportCsv],
  )

  useEffect(() => bridge.onMenu(handleMenu), [handleMenu])

  // メニューのアクセラレータが効かない場面（フォーカスが入力欄にあるなど）に備えた保険
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const store = useStore.getState()
      const inInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      if (inInput && key !== 's' && key !== 'o') return

      switch (key) {
        case 'c':
          void store.copy(false)
          e.preventDefault()
          return
        case 'x':
          void store.copy(true)
          e.preventDefault()
          return
        case 'v':
          void pasteFromClipboard()
          e.preventDefault()
          return
        case 'z':
          if (e.shiftKey) store.redo()
          else store.undo()
          e.preventDefault()
          return
        case 'y':
          store.redo()
          e.preventDefault()
          return
        case 's':
          void save(e.shiftKey)
          e.preventDefault()
          return
        case 'o':
          void open()
          e.preventDefault()
          return
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, save])

  // アプリ内クリップボードにない外部データも貼れるようにする
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      useStore.getState().paste(text)
      e.preventDefault()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="app">
      {hasFileAccess ? null : (
        <div className="warning-banner">
          ファイルの読み書きが使えません（preload の読み込みに失敗しています）。編集と計算は利用できます。
        </div>
      )}
      <Toolbar />
      <FormulaBar />
      <SheetCanvas />
      <SheetTabs />
      <StatusBar />
    </div>
  )
}

async function pasteFromClipboard(): Promise<void> {
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    // 権限が無ければアプリ内クリップボードだけで貼る
  }
  useStore.getState().paste(text)
}
