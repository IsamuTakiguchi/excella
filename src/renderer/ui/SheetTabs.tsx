import { useMemo, useRef, useState } from 'react'
import type { SheetModel } from '@shared/model'
import { focusGrid } from '../grid/focus'
import { useStore } from '../store/workbookStore'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { Dialog } from './Dialog'

/** Excel の「タブの色」の標準の色 */
const TAB_COLORS = [
  '#C00000',
  '#FF0000',
  '#FFC000',
  '#FFFF00',
  '#92D050',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#002060',
  '#7030A0',
]

/** 色つきの見出しに載せる文字色（暗い色には白、明るい色には黒） */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? '#ffffff' : '#000000'
}

function hasContent(sheet: SheetModel): boolean {
  return Object.keys(sheet.cells).length > 0
}

type DragState = { sheetId: string; startX: number; dragging: boolean; before: number | null }

/**
 * シート見出し。Excel のシートタブと同じ操作をそろえる。
 *
 * - クリックで切り替え、ダブルクリックで名前の変更
 * - 右クリック（タッチ端末は長押し）でメニュー：挿入・削除・名前の変更・
 *   移動またはコピー・タブの色・非表示・再表示
 * - マウスでドラッグして並べ替え（タッチ端末はメニューの「移動またはコピー」から）
 * - 左端の ◀ ▶ で見出しの列をスクロール（Ctrl を押しながらで先頭／末尾へ）
 * - 末尾の ＋ で新しいシート
 */
export function SheetTabs(): React.JSX.Element {
  const model = useStore((s) => s.model)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [moveDialog, setMoveDialog] = useState<string | null>(null)
  const [unhideDialog, setUnhideDialog] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null)

  const store = () => useStore.getState()
  const hiddenSheets = model.sheets.filter((s) => s.hidden)

  const startRename = (sheet: SheetModel) => {
    setRenaming(sheet.id)
    setDraft(sheet.name)
  }

  const finishRename = (sheetId: string) => {
    store().renameSheet(sheetId, draft)
    setRenaming(null)
    focusGrid()
  }

  const openMenu = (sheet: SheetModel, x: number, y: number) => {
    const index = model.sheets.findIndex((s) => s.id === sheet.id)
    const items: ContextMenuItem[] = [
      { kind: 'item', label: '挿入', onSelect: () => store().addSheet(index) },
      {
        kind: 'item',
        label: '削除',
        onSelect: () => {
          // Excel と同じく、中身のあるシートだけ確認する（undo でも戻せる）
          if (hasContent(sheet) && !confirm(`シート「${sheet.name}」を削除しますか？`)) return
          store().removeSheet(sheet.id)
        },
      },
      { kind: 'item', label: '名前の変更', onSelect: () => startRename(sheet) },
      { kind: 'item', label: '移動またはコピー…', onSelect: () => setMoveDialog(sheet.id) },
      { kind: 'separator' },
      {
        kind: 'colors',
        label: 'タブの色',
        colors: TAB_COLORS,
        current: sheet.tabColor,
        onPick: (color) => store().setSheetTabColor(sheet.id, color),
      },
      { kind: 'separator' },
      { kind: 'item', label: '非表示', onSelect: () => store().hideSheet(sheet.id) },
      {
        kind: 'item',
        label: '再表示…',
        disabled: hiddenSheets.length === 0,
        onSelect: () => setUnhideDialog(true),
      },
    ]
    store().setActiveSheet(sheet.id)
    setMenu({ x, y, items })
  }

  // --- ドラッグで並べ替え（マウスのみ） -------------------------------------

  /** ポインタの位置から「どのシートの前に入れるか」（全シート中の位置）を出す */
  const dropBefore = (clientX: number): number => {
    const tabs = strip.current?.querySelectorAll<HTMLElement>('[data-sheet-index]') ?? []
    let lastIndex = -1
    for (const tab of tabs) {
      const index = Number(tab.dataset.sheetIndex)
      const rect = tab.getBoundingClientRect()
      if (clientX < rect.left + rect.width / 2) return index
      lastIndex = index
    }
    return lastIndex + 1
  }

  const onPointerDown = (e: React.PointerEvent, sheet: SheetModel) => {
    if (renaming === sheet.id) return
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      store().setActiveSheet(sheet.id)
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ sheetId: sheet.id, startX: e.clientX, dragging: false, before: null })
      return
    }
    // タッチ：タップで切り替え、長押しでメニュー
    store().setActiveSheet(sheet.id)
    const { clientX, clientY } = e
    const timer = window.setTimeout(() => {
      longPress.current = null
      openMenu(sheet, clientX, clientY)
    }, 500)
    longPress.current = { timer, x: clientX, y: clientY }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const pressed = longPress.current
    if (pressed && (Math.abs(e.clientX - pressed.x) > 10 || Math.abs(e.clientY - pressed.y) > 10)) {
      window.clearTimeout(pressed.timer)
      longPress.current = null
    }
    if (!drag) return
    if (!drag.dragging && Math.abs(e.clientX - drag.startX) < 6) return
    setDrag({ ...drag, dragging: true, before: dropBefore(e.clientX) })
  }

  const onPointerUp = () => {
    if (longPress.current) {
      window.clearTimeout(longPress.current.timer)
      longPress.current = null
    }
    if (drag?.dragging && drag.before !== null) store().moveSheet(drag.sheetId, drag.before)
    setDrag(null)
    focusGrid()
  }

  const scrollTabs = (direction: -1 | 1, toEnd: boolean) => {
    const el = strip.current
    if (!el) return
    if (toEnd) el.scrollTo({ left: direction < 0 ? 0 : el.scrollWidth, behavior: 'smooth' })
    else el.scrollBy({ left: direction * 120, behavior: 'smooth' })
  }

  return (
    <div
      className="sheet-tabs"
      onMouseDown={(e) => {
        // タブやボタンを押してもグリッドのフォーカスを奪わない。
        // 名前変更の入力欄とダイアログの中だけは既定動作（フォーカス移動）が要る
        const target = e.target as HTMLElement
        if (!(target instanceof HTMLInputElement) && !target.closest('.dialog-overlay')) {
          e.preventDefault()
        }
      }}
    >
      <div className="sheet-nav">
        <button
          title="前のシートへスクロール（Ctrl を押しながらで先頭へ）"
          onClick={(e) => scrollTabs(-1, e.ctrlKey || e.metaKey)}
        >
          ◀
        </button>
        <button
          title="次のシートへスクロール（Ctrl を押しながらで末尾へ）"
          onClick={(e) => scrollTabs(1, e.ctrlKey || e.metaKey)}
        >
          ▶
        </button>
      </div>

      <div className="sheet-strip" ref={strip}>
        {model.sheets.map((sheet, index) => {
          if (sheet.hidden) return null
          const active = sheet.id === model.activeSheetId
          const dropHere = drag?.dragging && drag.before === index
          if (renaming === sheet.id) {
            return (
              <input
                key={sheet.id}
                className="sheet-rename"
                autoFocus
                value={draft}
                maxLength={31}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename(sheet.id)
                  if (e.key === 'Escape') {
                    setRenaming(null)
                    focusGrid()
                  }
                }}
                onBlur={() => finishRename(sheet.id)}
              />
            )
          }
          // 色つきの見出し：選んでいないときは色で塗り、選んでいるときは下線だけ色にする（Excel と同じ）
          const style: React.CSSProperties = {}
          if (sheet.tabColor) {
            if (active) style.borderBottomColor = sheet.tabColor
            else {
              style.background = sheet.tabColor
              style.color = textOn(sheet.tabColor)
            }
          }
          return (
            <div
              key={sheet.id}
              data-sheet-index={index}
              className={`sheet-tab${active ? ' active' : ''}${dropHere ? ' drop-before' : ''}${
                drag?.dragging && drag.sheetId === sheet.id ? ' dragging' : ''
              }`}
              style={style}
              role="tab"
              aria-selected={active}
              onPointerDown={(e) => onPointerDown(e, sheet)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={() => startRename(sheet)}
              onContextMenu={(e) => {
                e.preventDefault()
                // タッチ端末では長押しのタイマーから開く（ブラウザの contextmenu と二重にしない）
                if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch')
                  return
                openMenu(sheet, e.clientX, e.clientY)
              }}
              title="ダブルクリックで名前の変更、右クリックでメニュー"
            >
              {sheet.name}
            </div>
          )
        })}
        {drag?.dragging && drag.before !== null && drag.before >= model.sheets.length ? (
          <span className="drop-end" />
        ) : null}
        <button
          className="add-sheet"
          title="新しいシート (Shift+F11)"
          onClick={() => store().addSheet()}
        >
          ＋
        </button>
      </div>

      {menu ? (
        <ContextMenu
          state={menu}
          onClose={() => {
            setMenu(null)
            focusGrid()
          }}
        />
      ) : null}

      {moveDialog ? (
        <MoveOrCopyDialog
          sheetId={moveDialog}
          onClose={() => {
            setMoveDialog(null)
            focusGrid()
          }}
        />
      ) : null}

      {unhideDialog ? (
        <UnhideDialog
          onClose={() => {
            setUnhideDialog(false)
            focusGrid()
          }}
        />
      ) : null}
    </div>
  )
}

/** Excel の「シートの移動またはコピー」ダイアログ */
function MoveOrCopyDialog({
  sheetId,
  onClose,
}: {
  sheetId: string
  onClose: () => void
}): React.JSX.Element {
  const model = useStore((s) => s.model)
  const sheet = model.sheets.find((s) => s.id === sheetId)
  const [before, setBefore] = useState(String(model.sheets.length))
  const [copy, setCopy] = useState(false)

  const apply = () => {
    if (!sheet) return onClose()
    const target = Number(before)
    if (copy) useStore.getState().copySheet(sheet.id, target)
    else useStore.getState().moveSheet(sheet.id, target)
    onClose()
  }

  return (
    <Dialog
      title="シートの移動またはコピー"
      onClose={onClose}
      footer={
        <>
          <button className="primary" onClick={apply}>
            OK
          </button>
          <button onClick={onClose}>キャンセル</button>
        </>
      }
    >
      <p className="dialog-note">「{sheet?.name}」を移動します。</p>
      <label className="dialog-field">
        <span>挿入先（次のシートの前）</span>
        <select size={6} value={before} onChange={(e) => setBefore(e.target.value)}>
          {model.sheets.map((s, index) =>
            s.hidden ? null : (
              <option key={s.id} value={index}>
                {s.name}
              </option>
            ),
          )}
          <option value={model.sheets.length}>（末尾へ移動）</option>
        </select>
      </label>
      <label className="dialog-check">
        <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
        コピーを作成する
      </label>
    </Dialog>
  )
}

/** Excel の「再表示」ダイアログ */
function UnhideDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  // セレクタで filter すると毎回別の配列になり、zustand が無限に再描画するのでここで絞る
  const model = useStore((s) => s.model)
  const hidden = useMemo(() => model.sheets.filter((sheet) => sheet.hidden), [model])
  const [selected, setSelected] = useState(hidden[0]?.id ?? '')

  const apply = () => {
    if (selected) useStore.getState().unhideSheet(selected)
    onClose()
  }

  return (
    <Dialog
      title="再表示"
      onClose={onClose}
      footer={
        <>
          <button className="primary" onClick={apply} disabled={!selected}>
            OK
          </button>
          <button onClick={onClose}>キャンセル</button>
        </>
      }
    >
      <label className="dialog-field">
        <span>表示するシート</span>
        <select
          size={Math.min(6, Math.max(2, hidden.length))}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          onDoubleClick={apply}
        >
          {hidden.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  )
}
