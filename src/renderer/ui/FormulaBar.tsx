import { useState } from 'react'
import { addrToA1, a1ToRange, rangeToA1 } from '@shared/a1'
import { useStore } from '../store/workbookStore'

/**
 * 名前ボックス＋数式入力欄。
 * 入力中だけローカルの下書きを持ち、それ以外はストアから直接導出する
 * （effect で setState するとカーソル移動のたびに再レンダーが連鎖するため）。
 */
export function FormulaBar(): React.JSX.Element {
  const selection = useStore((s) => s.selection)
  const editing = useStore((s) => s.editing)
  const revision = useStore((s) => s.revision)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)

  const range = useStore((s) => s.selectionRange)()
  const active = selection.anchor
  void revision // セルの内容が変わったら再レンダーするための購読

  const committed = editing ? editing.text : useStore.getState().inputText(active)
  const value = draft ?? committed
  const nameValue = nameDraft ?? rangeToA1(range)

  const commit = () => {
    const store = useStore.getState()
    const text = draft ?? committed
    setDraft(null)
    if (store.editing) {
      store.updateEdit(text)
      store.commitEdit({ dRow: 1, dCol: 0 })
    } else if (text !== store.inputText(active)) {
      store.setCellInput(active, text)
      store.moveSelection(1, 0, false)
    }
  }

  const jumpTo = () => {
    const parsed = a1ToRange(nameValue)
    setNameDraft(null)
    if (!parsed) return
    useStore
      .getState()
      .setSelection({ row: parsed.r0, col: parsed.c0 }, { row: parsed.r1, col: parsed.c1 })
  }

  return (
    <div className="formula-bar">
      <input
        className="name-box"
        value={nameValue}
        title={`アクティブセル: ${addrToA1(active)}`}
        onChange={(e) => setNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            jumpTo()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setNameDraft(null)
            e.currentTarget.blur()
          }
        }}
        onBlur={jumpTo}
      />
      <span className="fx">fx</span>
      <input
        className="formula-input"
        value={value}
        spellCheck={false}
        placeholder="値または =SUM(A1:A10) のような数式"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          if (draft !== null) commit()
        }}
      />
    </div>
  )
}
