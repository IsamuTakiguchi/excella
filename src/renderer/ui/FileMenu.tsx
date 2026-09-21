import { useRef, useState } from 'react'
import { emitMenu } from '../menuBus'
import { useStore } from '../store/workbookStore'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'

/**
 * 画面上の「ファイル」メニュー。
 * ブラウザ／PWA にはネイティブメニューが無いのでここから開く・保存する。
 * デスクトップ版でも同じものを出しておく（ネイティブメニューと同じ操作）。
 */
export function FileMenu(): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)

  const open = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const items: ContextMenuItem[] = [
      { kind: 'item', label: '新規作成', onSelect: () => emitMenu('new') },
      { kind: 'item', label: '開く…', onSelect: () => emitMenu('open') },
      { kind: 'separator' },
      { kind: 'item', label: '保存', onSelect: () => emitMenu('save') },
      { kind: 'item', label: '名前を付けて保存…', onSelect: () => emitMenu('save-as') },
      { kind: 'item', label: 'CSV として書き出し…', onSelect: () => emitMenu('export-csv') },
      { kind: 'separator' },
      { kind: 'item', label: '元に戻す', disabled: !canUndo, onSelect: () => emitMenu('undo') },
      { kind: 'item', label: 'やり直し', disabled: !canRedo, onSelect: () => emitMenu('redo') },
    ]
    setMenu({ x: rect.left, y: rect.bottom + 2, items })
  }

  return (
    <>
      <button
        ref={ref}
        className="file-menu-button"
        title="ファイル"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onMouseDown={(e) => {
          // グリッドのフォーカスを奪わない。開いているメニューを閉じる
          // window の mousedown より先に止めて、click でトグルさせる
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={() => (menu ? setMenu(null) : open())}
      >
        ファイル
      </button>
      {menu ? <ContextMenu state={menu} onClose={() => setMenu(null)} /> : null}
    </>
  )
}
