import { useEffect, useRef } from 'react'

export type ContextMenuItem =
  | { kind: 'separator' }
  | { kind: 'item'; label: string; onSelect: () => void; disabled?: boolean }
  /** 色見本の行（シート見出しの「タブの色」など）。先頭は「色なし」 */
  | {
      kind: 'colors'
      label: string
      colors: string[]
      current?: string
      onPick: (color: string | undefined) => void
    }

export type ContextMenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
}

/**
 * 右クリックメニュー。Electron の Menu.popup ではなく renderer 側の div で出す。
 * 表示位置の制御が簡単で、ストアの操作をそのまま呼べるため。
 */
export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // 画面外にはみ出さない位置へ寄せる
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`
    }
  }, [state.x, state.y])

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // capture で拾うと、メニュー項目の onClick より先に閉じてしまうので bubble で待つ
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: state.x, top: state.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.items.map((item, index) =>
        item.kind === 'separator' ? (
          <div key={`sep-${index}`} className="separator" />
        ) : item.kind === 'colors' ? (
          <div key={`colors-${index}`} className="menu-colors">
            <div className="menu-colors-label">{item.label}</div>
            <div className="menu-colors-row">
              <button
                className={`swatch none${item.current ? '' : ' selected'}`}
                title="色なし"
                onClick={() => {
                  item.onPick(undefined)
                  onClose()
                }}
              />
              {item.colors.map((color) => (
                <button
                  key={color}
                  className={`swatch${item.current === color ? ' selected' : ''}`}
                  title={color}
                  style={{ background: color }}
                  onClick={() => {
                    item.onPick(color)
                    onClose()
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
