import { useEffect, useRef, useState } from 'react'
import { focusGrid } from '../grid/focus'
import { useStore, type FindOptions } from '../store/workbookStore'

export type FindMode = 'find' | 'replace'

/** 検索条件はダイアログを閉じても覚えておく（Excel と同じ） */
let remembered = {
  query: '',
  replacement: '',
  options: {
    matchCase: false,
    wholeCell: false,
    scope: 'sheet',
    lookIn: 'values',
  } as FindOptions,
}

/**
 * Excel の「検索と置換」（Ctrl+F / Ctrl+H）。
 * 表を見ながら次々に探せるよう、モーダルにせず右上に浮かべる。
 */
export function FindDialog({
  mode,
  onModeChange,
  onClose,
}: {
  mode: FindMode
  onModeChange: (mode: FindMode) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState(remembered.query)
  const [replacement, setReplacement] = useState(remembered.replacement)
  const [options, setOptions] = useState<FindOptions>(remembered.options)
  const [showOptions, setShowOptions] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [mode])

  useEffect(() => {
    remembered = { query, replacement, options }
  }, [query, replacement, options])

  const close = () => {
    onClose()
    focusGrid()
  }

  const store = () => useStore.getState()
  // 置換は入力内容（数式）に対して行うので、検索対象も数式にそろえる
  const effective: FindOptions = mode === 'replace' ? { ...options, lookIn: 'formulas' } : options

  const findNext = (backwards = false) => {
    if (query) store().find(query, effective, backwards)
  }

  const set = <K extends keyof FindOptions>(key: K, value: FindOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }))

  return (
    <div
      className="find-dialog"
      role="dialog"
      aria-label="検索と置換"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          findNext(e.shiftKey)
        }
      }}
    >
      <div className="find-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'find'}
          className={mode === 'find' ? 'active' : ''}
          onClick={() => onModeChange('find')}
        >
          検索
        </button>
        <button
          role="tab"
          aria-selected={mode === 'replace'}
          className={mode === 'replace' ? 'active' : ''}
          onClick={() => onModeChange('replace')}
        >
          置換
        </button>
        <button className="find-close" title="閉じる (Esc)" onClick={close}>
          ×
        </button>
      </div>

      <label className="find-field">
        <span>検索する文字列</span>
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {mode === 'replace' ? (
        <label className="find-field">
          <span>置換後の文字列</span>
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </label>
      ) : null}

      <button className="find-toggle" onClick={() => setShowOptions((v) => !v)}>
        オプション {showOptions ? '▴' : '▾'}
      </button>
      {showOptions ? (
        <div className="find-options">
          <label>
            検索場所
            <select
              value={options.scope}
              onChange={(e) => set('scope', e.target.value as FindOptions['scope'])}
            >
              <option value="sheet">シート</option>
              <option value="book">ブック</option>
            </select>
          </label>
          {mode === 'find' ? (
            <label>
              検索対象
              <select
                value={options.lookIn}
                onChange={(e) => set('lookIn', e.target.value as FindOptions['lookIn'])}
              >
                <option value="values">値</option>
                <option value="formulas">数式</option>
              </select>
            </label>
          ) : null}
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={options.matchCase}
              onChange={(e) => set('matchCase', e.target.checked)}
            />
            大文字と小文字を区別する
          </label>
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={options.wholeCell}
              onChange={(e) => set('wholeCell', e.target.checked)}
            />
            セル内容が完全に同一であるものを検索する
          </label>
        </div>
      ) : null}

      <div className="find-actions">
        {mode === 'replace' ? (
          <>
            <button
              disabled={!query}
              onClick={() => store().replaceAll(query, replacement, effective)}
            >
              すべて置換
            </button>
            <button
              disabled={!query}
              onClick={() => store().replaceNext(query, replacement, effective)}
            >
              置換
            </button>
          </>
        ) : null}
        <button disabled={!query} title="前を検索 (Shift+Enter)" onClick={() => findNext(true)}>
          前へ
        </button>
        <button className="primary" disabled={!query} onClick={() => findNext()}>
          次を検索
        </button>
      </div>
    </div>
  )
}
