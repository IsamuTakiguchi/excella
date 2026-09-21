import { useCallback, useEffect } from 'react'
import { formatCellValue } from '@shared/numberFormat'
import type { MenuAction, SerializedResults } from '@shared/ipc'
import { bridge, preloadMissing } from './bridge'
import { onLocalMenu } from './menuBus'
import { SheetCanvas } from './grid/SheetCanvas'
import { useStore } from './store/workbookStore'
import { FormulaBar } from './ui/FormulaBar'
import { SheetTabs } from './ui/SheetTabs'
import { StatusBar } from './ui/StatusBar'
import { TitleBar } from './ui/TitleBar'
import { Toolbar } from './ui/Toolbar'

export function App(): React.JSX.Element {
  const save = useCallback(async (asNew: boolean) => {
    const state = useStore.getState()
    const results: SerializedResults = state.model.sheets.map((sheet) => [
      sheet.id,
      [...state.engine.getResultMap(sheet).entries()],
    ])
    const result = await bridge.saveWorkbook(asNew ? null : state.filePath, state.model, results)
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
        case 'toggle-merge':
          store.toggleMerge()
          return
        case 'toggle-freeze':
          store.toggleFreeze()
          return
        default:
          return
      }
    },
    [open, save, exportCsv],
  )

  // ネイティブメニュー（デスクトップ）と画面上のファイルメニュー（両方）の両方を受ける
  useEffect(() => bridge.onMenu(handleMenu), [handleMenu])
  useEffect(() => onLocalMenu(handleMenu), [handleMenu])

  // ファイル関連付けやコマンドライン引数から開かれた場合
  useEffect(
    () =>
      bridge.onOpenFile((result) => {
        const store = useStore.getState()
        if (store.dirty && !confirm('保存していない変更があります。破棄して開きますか？')) return
        store.loadWorkbook(result.model, result.path, result.name)
      }),
    [],
  )

  // メニューのアクセラレータが効かない場面（フォーカスが入力欄にあるなど）に備えた保険
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const store = useStore.getState()
      // グリッドの入力欄は常にフォーカスを持っているので、
      // 「入力欄にいるかどうか」ではなく「編集中かどうか」で判断する
      if (isOtherInput(document.activeElement) && key !== 's' && key !== 'o') return
      if (store.editing && key !== 's' && key !== 'o') return

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
      // 数式バーやシート名の入力中はそのまま貼らせる。
      // グリッドの入力欄は常にフォーカスされているので、編集中かどうかで分ける
      if (isOtherInput(e.target)) return
      if (useStore.getState().editing) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      useStore.getState().paste(text)
      e.preventDefault()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="app">
      {preloadMissing ? (
        <div className="warning-banner">
          preload の読み込みに失敗しています。ファイルの読み書きはブラウザの機能で代替します。
        </div>
      ) : null}
      <TitleBar />
      <Toolbar />
      <FormulaBar />
      <SheetCanvas />
      <SheetTabs />
      <StatusBar />
    </div>
  )
}

/** グリッドの入力欄以外の、ふつうの入力欄にフォーカスがあるか */
function isOtherInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
    return false
  return target.dataset.gridInput !== 'true'
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
