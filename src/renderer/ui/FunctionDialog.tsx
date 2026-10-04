import { useMemo, useState } from 'react'
import { isFormula } from '@shared/formulaRefs'
import { FUNCTION_CATALOG, functionInfo, type FunctionCategory } from '@shared/functions'
import { functionNames } from '../engine/hf'
import { focusGrid } from '../grid/focus'
import { useStore } from '../store/workbookStore'
import { Dialog } from './Dialog'

const CATEGORIES: Array<FunctionCategory | '主な関数' | 'すべて'> = [
  '主な関数',
  '数学/三角',
  '統計',
  '論理',
  '検索/行列',
  '日付/時刻',
  '文字列操作',
  '情報',
  '財務',
  'すべて',
]

/**
 * Excel の「関数の挿入」（数式バーの fx）。
 * 関数を探して選ぶと、アクティブセルに「=関数名(」を入れて引数を打てる状態にする。
 */
export function FunctionDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('主な関数')
  const [selected, setSelected] = useState<string>('SUM')

  const names = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (q) {
      // 名前と説明の両方から探す（「合計」でも SUM が見つかるように）
      const all = functionNames()
      return all.filter(
        (name) =>
          name.includes(q) || (functionInfo(name)?.description.includes(query.trim()) ?? false),
      )
    }
    if (category === 'すべて') return functionNames()
    if (category === '主な関数') return FUNCTION_CATALOG.map((f) => f.name)
    return FUNCTION_CATALOG.filter((f) => f.category === category).map((f) => f.name)
  }, [query, category])

  const current = names.includes(selected) ? selected : names[0]
  const info = current ? functionInfo(current) : undefined

  const insert = () => {
    if (!current) return
    const store = useStore.getState()
    const editing = store.editing
    if (editing && isFormula(editing.text)) {
      // 数式を書いている途中なら、末尾に関数を足す
      store.updateEdit(`${editing.text}${current}(`)
    } else {
      store.beginEdit(store.selection.anchor, `=${current}(`)
    }
    onClose()
    focusGrid()
  }

  return (
    <Dialog
      title="関数の挿入"
      onClose={() => {
        onClose()
        focusGrid()
      }}
      footer={
        <>
          <button
            onClick={() => {
              onClose()
              focusGrid()
            }}
          >
            キャンセル
          </button>
          <button className="primary" disabled={!current} onClick={insert}>
            OK
          </button>
        </>
      }
    >
      <label className="dialog-field">
        関数の検索
        <input
          className="dialog-input"
          value={query}
          placeholder="例：合計、VLOOKUP"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') insert()
          }}
        />
      </label>
      <label className="dialog-field">
        関数の分類
        <select
          value={category}
          disabled={query.trim() !== ''}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <select
        className="function-list"
        size={8}
        value={current ?? ''}
        aria-label="関数名"
        onChange={(e) => setSelected(e.target.value)}
        onDoubleClick={insert}
      >
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {current ? (
        <div className="function-detail">
          <b>
            {current}({info ? info.args.join(', ') : '…'})
          </b>
          <p>{info ? info.description : '説明はありません（HyperFormula の関数）。'}</p>
        </div>
      ) : (
        <p className="dialog-note">一致する関数がありません。</p>
      )}
    </Dialog>
  )
}
