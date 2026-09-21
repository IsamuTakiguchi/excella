import { useState } from 'react'
import { colToLetter } from '@shared/a1'
import { BORDER_PRESETS, BORDER_WEIGHTS } from '@shared/borders'
import type { BorderWeight } from '@shared/model'
import { NUMBER_FORMATS } from '@shared/numberFormat'
import { focusGrid } from '../grid/focus'
import { useStore } from '../store/workbookStore'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BorderIcon,
  DeleteColIcon,
  DeleteRowIcon,
  FillColorIcon,
  FontColorIcon,
  FreezeIcon,
  InsertColIcon,
  InsertRowIcon,
  MergeIcon,
  RedoIcon,
  SortAscIcon,
  SortDescIcon,
  UndoIcon,
} from './Icons'

/** Excel の「標準の色」に合わせた文字色 */
const TEXT_COLORS = ['#000000', '#C00000', '#ED7D31', '#FFC000', '#00B050', '#0070C0', '#7030A0']
/** Excel でよく使われる薄い塗りつぶし色 */
const FILL_COLORS = ['', '#FFF2CC', '#FCE4D6', '#DDEBF7', '#E2EFDA', '#EDEDED', '#F8CBAD']

/** Excel のリボンと同じく、ボタンの下にグループ名を出す */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group">
      <div className="items">{children}</div>
      <div className="group-label">{label}</div>
    </div>
  )
}

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
  // Excel と同じく「最後に使った色」をアイコンの帯に出し、アイコン本体でその色を適用する
  const [textColor, setTextColor] = useState('#C00000')
  const [fillColor, setFillColor] = useState('#FFF2CC')

  // 並べ替えの基準はアクティブセルの列（選択範囲の左端からの相対位置で渡す）
  const sortOffset = Math.max(0, Math.min(selection.anchor.col - range.c0, range.c1 - range.c0))
  const sortColumnName = colToLetter(range.c0 + sortOffset)

  return (
    // ボタンを押してもグリッドのフォーカスを奪わない（Excel と同じ挙動）。
    // select や色は操作にフォーカスが要るので、変更後にグリッドへ戻す
    <div
      className="toolbar"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
    >
      <Group label="元に戻す">
        <button title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={() => store().undo()}>
          <UndoIcon />
        </button>
        <button title="やり直し (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => store().redo()}>
          <RedoIcon />
        </button>
      </Group>

      <Group label="フォント">
        <button
          title="太字 (Ctrl+B)"
          className={`glyph${style?.bold ? ' active' : ''}`}
          onClick={() => store().applyStyle({ bold: true }, true)}
        >
          <b>B</b>
        </button>
        <button
          title="斜体 (Ctrl+I)"
          className={`glyph${style?.italic ? ' active' : ''}`}
          onClick={() => store().applyStyle({ italic: true }, true)}
        >
          <i>I</i>
        </button>
        <button
          title="下線 (Ctrl+U)"
          className={`glyph${style?.underline ? ' active' : ''}`}
          onClick={() => store().applyStyle({ underline: true }, true)}
        >
          <u>U</u>
        </button>
        <span className="vsep" />
        <button
          title={`文字色 ${textColor}`}
          onClick={() => store().applyStyle({ color: textColor })}
        >
          <FontColorIcon color={textColor} />
        </button>
        <span className="swatches">
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              className="swatch"
              title={`文字色 ${color}`}
              style={{ background: color }}
              onClick={() => {
                setTextColor(color)
                store().applyStyle({ color: color === '#000000' ? undefined : color })
              }}
            />
          ))}
        </span>
        <span className="vsep" />
        <button
          title={`塗りつぶし ${fillColor}`}
          onClick={() => store().applyStyle({ bg: fillColor || undefined })}
        >
          <FillColorIcon color={fillColor || '#ffffff'} />
        </button>
        <span className="swatches">
          {FILL_COLORS.map((color) => (
            <button
              key={color || 'none'}
              className={`swatch${color ? '' : ' none'}`}
              title={color ? `塗りつぶし ${color}` : '塗りつぶしなし'}
              style={color ? { background: color } : undefined}
              onClick={() => {
                setFillColor(color)
                store().applyStyle({ bg: color || undefined })
              }}
            />
          ))}
        </span>
      </Group>

      <Group label="配置">
        <button
          title="左揃え"
          className={style?.align === 'left' ? 'active' : ''}
          onClick={() => store().applyStyle({ align: 'left' })}
        >
          <AlignLeftIcon />
        </button>
        <button
          title="中央揃え"
          className={style?.align === 'center' ? 'active' : ''}
          onClick={() => store().applyStyle({ align: 'center' })}
        >
          <AlignCenterIcon />
        </button>
        <button
          title="右揃え"
          className={style?.align === 'right' ? 'active' : ''}
          onClick={() => store().applyStyle({ align: 'right' })}
        >
          <AlignRightIcon />
        </button>
        <span className="vsep" />
        <button title="セルを結合／解除" onClick={() => store().toggleMerge()}>
          <MergeIcon />
        </button>
      </Group>

      <Group label="数値">
        <select
          title="表示形式"
          value={style?.numFmt ?? 'General'}
          onChange={(e) => {
            store().applyStyle({
              numFmt: e.target.value === 'General' ? undefined : e.target.value,
            })
            focusGrid()
          }}
        >
          {NUMBER_FORMATS.map((fmt) => (
            <option key={fmt.code} value={fmt.code}>
              {fmt.label}
            </option>
          ))}
        </select>
      </Group>

      <Group label="罫線">
        {BORDER_PRESETS.map((item) => (
          <button
            key={item.preset}
            title={item.label}
            onClick={() =>
              store().applyBorders(item.preset, { weight: borderWeight, color: borderColor })
            }
          >
            <BorderIcon kind={item.preset} />
          </button>
        ))}
        <select
          title="罫線の太さ"
          value={borderWeight}
          onChange={(e) => {
            setBorderWeight(e.target.value as BorderWeight)
            focusGrid()
          }}
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
          onBlur={focusGrid}
        />
      </Group>

      <Group label="セル">
        <button
          title="行を挿入"
          onClick={() => store().insertRows(range.r0, range.r1 - range.r0 + 1)}
        >
          <InsertRowIcon />
        </button>
        <button
          title="行を削除"
          onClick={() => store().deleteRows(range.r0, range.r1 - range.r0 + 1)}
        >
          <DeleteRowIcon />
        </button>
        <button
          title="列を挿入"
          onClick={() => store().insertColumns(range.c0, range.c1 - range.c0 + 1)}
        >
          <InsertColIcon />
        </button>
        <button
          title="列を削除"
          onClick={() => store().deleteColumns(range.c0, range.c1 - range.c0 + 1)}
        >
          <DeleteColIcon />
        </button>
        <span className="vsep" />
        <button
          title="アクティブセルの左上でウィンドウ枠を固定／解除"
          onClick={() => store().toggleFreeze()}
        >
          <FreezeIcon />
        </button>
      </Group>

      <Group label="並べ替え">
        <button
          title={`${sortColumnName} 列（アクティブセルの列）で昇順に並べ替え`}
          onClick={() => store().sortSelection(sortOffset, true, skipHeader)}
        >
          <SortAscIcon />
        </button>
        <button
          title={`${sortColumnName} 列（アクティブセルの列）で降順に並べ替え`}
          onClick={() => store().sortSelection(sortOffset, false, skipHeader)}
        >
          <SortDescIcon />
        </button>
        <label className="checkbox" title="選択範囲の先頭行を見出しとして並べ替えの対象から外す">
          <input
            type="checkbox"
            checked={skipHeader}
            onChange={(e) => {
              setSkipHeader(e.target.checked)
              focusGrid()
            }}
          />
          見出し行
        </label>
      </Group>
    </div>
  )
}
