import { useState } from 'react'
import { colToLetter } from '@shared/a1'
import { BORDER_PRESETS, BORDER_WEIGHTS } from '@shared/borders'
import type { BorderWeight } from '@shared/model'
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
  const [skipHeader, setSkipHeader] = useState(true)
  const [borderWeight, setBorderWeight] = useState<BorderWeight>('thin')
  const [borderColor, setBorderColor] = useState('#000000')

  // 並べ替えの基準はアクティブセルの列（選択範囲の左端からの相対位置で渡す）
  const sortOffset = Math.max(0, Math.min(selection.anchor.col - range.c0, range.c1 - range.c0))
  const sortColumnName = colToLetter(range.c0 + sortOffset)

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
        <span className="label">罫線</span>
        {BORDER_PRESETS.map((item) => (
          <button
            key={item.preset}
            title={item.label}
            onClick={() =>
              store().applyBorders(item.preset, { weight: borderWeight, color: borderColor })
            }
          >
            {item.icon}
          </button>
        ))}
        <select
          title="罫線の太さ"
          value={borderWeight}
          onChange={(e) => setBorderWeight(e.target.value as BorderWeight)}
        >
          {BORDER_WEIGHTS.map((w) => (
            <option key={w.weight} value={w.weight}>
              {w.label}
            </option>
          ))}
        </select>
        <input
          type="color"
          className="color-input"
          title="罫線の色"
          value={borderColor}
          onChange={(e) => setBorderColor(e.target.value)}
        />
      </div>

      <div className="group">
        <button title="セルを結合／解除" onClick={() => store().toggleMerge()}>
          ⊞
        </button>
        <button
          title="アクティブセルの左上でウィンドウ枠を固定／解除"
          onClick={() => store().toggleFreeze()}
        >
          ❄
        </button>
      </div>

      <div className="group">
        <button
          title={`${sortColumnName} 列（アクティブセルの列）で昇順に並べ替え`}
          onClick={() => store().sortSelection(sortOffset, true, skipHeader)}
        >
          A→Z
        </button>
        <button
          title={`${sortColumnName} 列（アクティブセルの列）で降順に並べ替え`}
          onClick={() => store().sortSelection(sortOffset, false, skipHeader)}
        >
          Z→A
        </button>
        <label className="checkbox" title="選択範囲の先頭行を見出しとして並べ替えの対象から外す">
          <input
            type="checkbox"
            checked={skipHeader}
            onChange={(e) => setSkipHeader(e.target.checked)}
          />
          先頭行は見出し
        </label>
      </div>
    </div>
  )
}
