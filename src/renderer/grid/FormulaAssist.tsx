import { functionInfo, highlightedArg, type FunctionInfo } from '@shared/functions'

/**
 * 数式の入力補助（Excel の「数式オートコンプリート」と引数のヒント）。
 * 表示だけを受け持ち、キー操作は CellInput が行う。
 * マウスで押しても入力欄のフォーカスを奪わないように mousedown を止める。
 */
export function FunctionList({
  items,
  selected,
  left,
  top,
  onPick,
  onHover,
}: {
  items: string[]
  selected: number
  left: number
  top: number
  onPick: (name: string) => void
  onHover: (index: number) => void
}): React.JSX.Element {
  const info = functionInfo(items[selected] ?? '')
  return (
    <div
      className="formula-assist"
      style={{ left, top }}
      role="listbox"
      aria-label="関数の候補"
      onMouseDown={(e) => e.preventDefault()}
    >
      <ul>
        {items.map((name, i) => (
          <li
            key={name}
            role="option"
            aria-selected={i === selected}
            className={i === selected ? 'selected' : ''}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(name)}
          >
            <span className="fn-icon">fx</span>
            {name}
          </li>
        ))}
      </ul>
      {info ? <p className="fn-description">{info.description}</p> : null}
      <p className="fn-tip">Tab キーで入力</p>
    </div>
  )
}

export function ArgumentHint({
  info,
  argIndex,
  left,
  top,
}: {
  info: FunctionInfo
  argIndex: number
  left: number
  top: number
}): React.JSX.Element {
  const current = highlightedArg(info, argIndex)
  return (
    <div className="formula-hint" style={{ left, top }} onMouseDown={(e) => e.preventDefault()}>
      <b>{info.name}</b>(
      {info.args.map((arg, i) => (
        <span key={i}>
          {i > 0 ? ', ' : ''}
          <span className={i === current ? 'current' : ''}>{arg}</span>
        </span>
      ))}
      )
    </div>
  )
}
