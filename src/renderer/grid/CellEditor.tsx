import { useEffect, useRef } from 'react'
import { useStore, type Editing } from '../store/workbookStore'

type Props = {
  editing: NonNullable<Editing>
  left: number
  top: number
  width: number
  height: number
}

/** アクティブセルの上に重ねる入力欄。編集中だけ存在する。 */
export function CellEditor({ editing, left, top, width, height }: Props): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // 直接入力で始まったときはカーソルを末尾に置く（上書き入力）
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing.addr.row, editing.addr.col])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const store = useStore.getState()
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      store.commitEdit({ dRow: 1, dCol: 0 })
      e.preventDefault()
      return
    }
    if (e.key === 'Tab') {
      store.commitEdit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 })
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      store.cancelEdit()
      e.preventDefault()
      return
    }
    // 直接入力で始まった編集は矢印キーで確定する（Excel と同じ挙動）
    if (editing.typing && e.key.startsWith('Arrow')) {
      const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      store.commitEdit({ dRow, dCol })
      e.preventDefault()
    }
  }

  return (
    <textarea
      ref={ref}
      className="cell-editor"
      value={editing.text}
      spellCheck={false}
      onChange={(e) => useStore.getState().updateEdit(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => useStore.getState().commitEdit()}
      style={{ left, top, minWidth: width, minHeight: height }}
    />
  )
}
