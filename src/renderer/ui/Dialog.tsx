import { useEffect, useRef } from 'react'

/**
 * 小さなモーダルダイアログ（シートの「移動またはコピー」「再表示」など）。
 * Esc とオーバーレイのクリックで閉じる。開いたら最初のボタン以外の操作部品にフォーカスする。
 */
export function Dialog({
  title,
  children,
  onClose,
  footer,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  footer: React.ReactNode
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>('select, input, button.primary')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-footer">{footer}</div>
      </div>
    </div>
  )
}
