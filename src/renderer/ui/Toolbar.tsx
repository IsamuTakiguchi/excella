import { NUMBER_FORMATS } from '@shared/numberFormat'
import { useStore } from '../store/workbookStore'

const TEXT_COLORS = ['#1F2328', '#C0392B', '#1F6FEB', '#137333', '#8250DF', '#B26B00']
const FILL_COLORS = ['', '#FFF3BF', '#FFE3E3', '#E3F2FD', '#E6F4EA', '#F1E7FD', '#EDEFF2']

export function Toolbar(): React.JSX.Element {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const selection = useStore((s) => s.selection)
  const revision = useStore((s) => s.revision)
  const style = useStore((s) => s.styleAt)(selection.anchor)
  void revision

  const store = () => useStore.getState()
  const range = useStore((s) => s.selectionRange)()

  return (
    <div className="toolbar">
      <div className="group">
        <button title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={() => store().undo()}>
          ↺
        </button>
        <button title="やり直し (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => store().redo()}>
          ↻
        </button>
      </div>

      <div className="group">
        <button
          title="太字 (Ctrl+B)"
          className={style?.bold ? 'active' : ''}
          onClick={() => store().applyStyle({ bold: true }, true)}
        >
          <b>B</b>
        </button>
        <button
          title="斜体 (Ctrl+I)"
          className={style?.italic ? 'active' : ''}
          onClick={() => store().applyStyle({ italic: true }, true)}
        >
          <i>I</i>
        </button>
        <button
          title="下線 (Ctrl+U)"
          className={style?.underline ? 'active' : ''}
          onClick={() => store().applyStyle({ underline: true }, true)}
        >
          <u>U</u>
        </button>
      </div>

      <div className="group">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            title={`${align === 'left' ? '左' : align === 'center' ? '中央' : '右'}寄せ`}
            className={style?.align === align ? 'active' : ''}
            onClick={() => store().applyStyle({ align })}
          >
            {align === 'left' ? '⬅' : align === 'center' ? '↔' : '➡'}
          </button>
        ))}
      </div>

      <div className="group">
        <span className="label">文字</span>
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            className="swatch"
            title={`文字色 ${color}`}
            style={{ background: color }}
            onClick={() => store().applyStyle({ color })}
          />
        ))}
      </div>

      <div className="group">
        <span className="label">塗り</span>
        {FILL_COLORS.map((color) => (
          <button
            key={color || 'none'}
            className={`swatch${color ? '' : ' none'}`}
            title={color ? `背景色 ${color}` : '背景色なし'}
            style={color ? { background: color } : undefined}
            onClick={() => store().applyStyle({ bg: color || undefined })}
          />
        ))}
      </div>

      <div className="group">
        <select
          title="表示形式"
          value={style?.numFmt ?? 'General'}
          onChange={(e) =>
            store().applyStyle({
              numFmt: e.target.value === 'General' ? undefined : e.target.value,
            })
          }
        >
          {NUMBER_FORMATS.map((fmt) => (
            <option key={fmt.code} value={fmt.code}>
              {fmt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="group">
        <button
          title="行を挿入"
          onClick={() => store().insertRows(range.r0, range.r1 - range.r0 + 1)}
        >
          行＋
        </button>
        <button
          title="行を削除"
          onClick={() => store().deleteRows(range.r0, range.r1 - range.r0 + 1)}
        >
          行−
        </button>
        <button
          title="列を挿入"
          onClick={() => store().insertColumns(range.c0, range.c1 - range.c0 + 1)}
        >
          列＋
        </button>
        <button
          title="列を削除"
          onClick={() => store().deleteColumns(range.c0, range.c1 - range.c0 + 1)}
        >
          列−
        </button>
      </div>

      <div className="group">
        <button
          title="選択範囲を左端の列で昇順に並べ替え"
          onClick={() => store().sortSelection(0, true)}
        >
          A→Z
        </button>
        <button
          title="選択範囲を左端の列で降順に並べ替え"
          onClick={() => store().sortSelection(0, false)}
        >
          Z→A
        </button>
      </div>
    </div>
  )
}
