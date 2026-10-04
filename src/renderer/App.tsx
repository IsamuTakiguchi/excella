import { useCallback, useEffect, useState } from 'react'
import { formatCellValue } from '@shared/numberFormat'
import type { MenuAction, RecoverySnapshot } from '@shared/ipc'
import { createAutoPersistence, saveCurrent } from './autosave'
import { bridge, preloadMissing } from './bridge'
import { onLocalMenu } from './menuBus'
import { SheetCanvas } from './grid/SheetCanvas'
import { useStore } from './store/workbookStore'
import { FindDialog, type FindMode } from './ui/FindDialog'
import { FormulaBar } from './ui/FormulaBar'
import { RecoveryBanner } from './ui/RecoveryBanner'
import { SheetTabs } from './ui/SheetTabs'
import { StatusBar } from './ui/StatusBar'
import { TitleBar } from './ui/TitleBar'
import { Toolbar } from './ui/Toolbar'

export function App(): React.JSX.Element {
  const showFormulaBar = useStore((s) => s.showFormulaBar)
  // 検索と置換（Ctrl+F / Ctrl+H）。開いていないときは null
  const [findMode, setFindMode] = useState<FindMode | null>(null)
  const save = useCallback(async (asNew: boolean) => {
    await saveCurrent(asNew)
  }, [])

  // 前回、保存されないまま閉じた変更があれば復元を勧める（Excel の「ドキュメントの回復」）
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null)
  useEffect(() => {
    let alive = true
    void bridge.loadRecovery().then((snapshot) => {
      if (alive) setRecovery(snapshot)
    })
    return () => {
      alive = false
    }
  }, [])

  // 自動回復（常に）と自動保存（スイッチがオンのとき）を裏で動かす
  useEffect(() => {
    const persistence = createAutoPersistence({
      api: bridge,
      store: useStore,
      save: () => saveCurrent(false, { silent: true }),
    })
    // タブを閉じる・アプリを切り替えるときは、待たずに控えを書く
    const onHide = () => {
      if (document.visibilityState === 'hidden') void persistence.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      persistence.stop()
    }
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
        case 'find':
        case 'replace':
          if (store.editing) return
          setFindMode(action)
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
      // Excel のシート操作：Ctrl+PageUp / PageDown で前後のシート、Shift+F11 で新しいシート。
      // セルの編集中やほかの入力欄にいるときは邪魔しない
      if (!useStore.getState().editing && !isOtherInput(document.activeElement)) {
        if (mod && (e.key === 'PageUp' || e.key === 'PageDown')) {
          useStore.getState().activateAdjacentSheet(e.key === 'PageUp' ? -1 : 1)
          e.preventDefault()
          return
        }
        if (e.shiftKey && e.key === 'F11') {
          const state = useStore.getState()
          const index = state.model.sheets.findIndex((s) => s.id === state.model.activeSheetId)
          // Excel と同じく、開いているシートの前に入れる
          state.addSheet(Math.max(0, index))
          e.preventDefault()
          return
        }
      }
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
        case 'f':
        case 'h':
          setFindMode(key === 'f' ? 'find' : 'replace')
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
      {recovery ? (
        <RecoveryBanner
          snapshot={recovery}
          onRestore={() => {
            const store = useStore.getState()
            if (store.dirty && !confirm('いまの変更は破棄されます。復元しますか？')) return
            store.restoreWorkbook(recovery.model, recovery.filePath, recovery.fileName)
            setRecovery(null)
          }}
          onDiscard={() => {
            // いま編集中の変更の控えまで消さないよう、未保存の変更が無いときだけ消す
            if (!useStore.getState().dirty) void bridge.clearRecovery()
            setRecovery(null)
          }}
        />
      ) : null}
      <Toolbar />
      {showFormulaBar ? <FormulaBar /> : null}
      <SheetCanvas />
      <SheetTabs />
      <StatusBar />
      {findMode ? (
        <FindDialog mode={findMode} onModeChange={setFindMode} onClose={() => setFindMode(null)} />
      ) : null}
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
