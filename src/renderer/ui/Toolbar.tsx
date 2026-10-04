import { useEffect, useRef, useState } from 'react'
import { colToLetter } from '@shared/a1'
import { BORDER_PRESETS, BORDER_WEIGHTS } from '@shared/borders'
import { AUTO_FUNCTIONS } from '@shared/dataTools'
import { DEFAULT_FONT_NAME, FONTS, FONT_SIZES, stepFontSize } from '@shared/fonts'
import { DEFAULT_FONT_PT, type BorderWeight, type VerticalAlign } from '@shared/model'
import { NUMBER_FORMATS } from '@shared/numberFormat'
import { COMPACT_RIBBON, NARROW_WIDTH } from '../device'
import { fitColumnWidth, fitRowHeight, growRowsToFit } from '../grid/autofit'
import { focusGrid } from '../grid/focus'
import { MAX_ZOOM, MIN_ZOOM } from '../grid/geometry'
import { emitMenu } from '../menuBus'
import { useStore, type PasteMode } from '../store/workbookStore'
import { useMediaQuery } from '../useMediaQuery'
import { Backstage } from './Backstage'
import {
  AlignBottomIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignMiddleIcon,
  AlignRightIcon,
  AlignTopIcon,
  BorderIcon,
  CellFormatIcon,
  CommaIcon,
  CopyIcon,
  CurrencyIcon,
  CutIcon,
  DecimalDecIcon,
  DecimalIncIcon,
  DeleteRowIcon,
  EraserIcon,
  FillColorIcon,
  FontColorIcon,
  FontGrowIcon,
  FontShrinkIcon,
  FormatPainterIcon,
  FreezeIcon,
  InsertRowIcon,
  MergeIcon,
  PasteIcon,
  PercentIcon,
  RedoIcon,
  SearchIcon,
  SigmaIcon,
  SortAscIcon,
  SortDescIcon,
  UndoIcon,
  WrapIcon,
} from './Icons'

/** Excel の「標準の色」と白黒・灰色 */
const TEXT_COLORS = [
  '#000000',
  '#595959',
  '#808080',
  '#BFBFBF',
  '#FFFFFF',
  '#C00000',
  '#FF0000',
  '#FFC000',
  '#FFFF00',
  '#92D050',
  '#00B050',
  '#00B0F0',
  '#0070C0',
  '#002060',
  '#7030A0',
]
/** 塗りつぶし。先頭の空文字は「塗りつぶしなし」 */
const FILL_COLORS = [
  '',
  '#F2F2F2',
  '#D9D9D9',
  '#FFF2CC',
  '#FCE4D6',
  '#DDEBF7',
  '#E2EFDA',
  '#EDEDED',
  '#F8CBAD',
  '#FFFF00',
  '#92D050',
  '#00B0F0',
  '#FFC000',
  '#C00000',
  '#7030A0',
]

type TabKey = 'home' | 'insert' | 'formulas' | 'data' | 'view'
/** リボンの 1 グループ。rows は広い画面で上下 2 段に積む（Excel と同じ） */
type Group = { key: string; label: string; rows: React.ReactNode[] }

/** Excel のリボンと同じく、ボタンの下にグループ名を出す（広い画面のとき） */
function GroupBox({ label, rows }: { label: string; rows: React.ReactNode[] }) {
  return (
    <div className="group">
      <div className={rows.length > 1 ? 'items stacked' : 'items'}>
        {rows.map((row, i) => (
          <div className="row" key={i}>
            {row}
          </div>
        ))}
      </div>
      <div className="group-label">{label}</div>
    </div>
  )
}

/**
 * 押すと下に開くボタン。開いた位置は画面に対して固定する。
 * リボンは横に流れるので、その中に置くと切り取られて中身が見えない。
 * icon を省くと ▾ だけのボタンになる（左のボタンと組んで分割ボタンにするとき）。
 */
function PopoverButton({
  title,
  icon,
  label,
  children,
}: {
  title: string
  icon?: React.ReactNode
  label?: string
  children: (close: () => void) => React.ReactNode
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setAt(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAt(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="color-palette" ref={ref}>
      <button
        title={title}
        className={`with-caret${icon || label ? '' : ' caret-only'}${label ? ' text-button' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          if (open) {
            setAt(null)
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          // 右端からはみ出さないように寄せる
          setAt({ left: Math.max(4, Math.min(r.left, window.innerWidth - 260)), top: r.bottom + 2 })
        }}
      >
        {icon}
        {label ? <span>{label}</span> : null}
        <span className="caret">▾</span>
      </button>
      {at ? (
        <span className="palette-popover" style={{ left: at.left, top: at.top }}>
          {children(() => {
            setAt(null)
            focusGrid()
          })}
        </span>
      ) : null}
    </span>
  )
}

/** 色見本の格子と「その他の色」 */
function Swatches({
  colors,
  onPick,
  noneLabel,
}: {
  colors: string[]
  onPick: (color: string) => void
  noneLabel?: string
}): React.JSX.Element {
  return (
    <span className="swatch-panel">
      <span className="swatch-grid">
        {colors.map((color) => (
          <button
            key={color || 'none'}
            className={`swatch${color ? '' : ' none'}`}
            title={color || noneLabel || 'なし'}
            style={color ? { background: color } : undefined}
            onClick={() => onPick(color)}
          />
        ))}
      </span>
      <label className="swatch-more">
        その他の色…
        <input type="color" onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </span>
  )
}

/** 文字だけのメニュー（貼り付け ▾・挿入 ▾ など） */
function MenuList({
  items,
  close,
}: {
  items: Array<{ label: string; onSelect: () => void; disabled?: boolean } | 'separator'>
  close: () => void
}): React.JSX.Element {
  return (
    <span className="menu-list" role="menu">
      {items.map((item, i) =>
        item === 'separator' ? (
          <hr key={`sep-${i}`} />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              close()
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </span>
  )
}

/** チェックボックスつきの表示切り替え（目盛線・数式バーなど） */
function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string
  checked: boolean
  onChange: () => void
  title?: string
}) {
  return (
    <label className="checkbox" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {
          onChange()
          focusGrid()
        }}
      />
      {label}
    </label>
  )
}

/**
 * リボン。Excel と同じ「ファイル／ホーム／挿入／数式／データ／表示」のタブで切り替える。
 * 広い画面ではグループ名つきで横に並べ（ボタンは上下 2 段）、狭い画面では折り返して詰める。
 * 「ファイル」は内容の切り替えではなく、Excel と同じ全画面の Backstage を開く。
 */
export function Toolbar(): React.JSX.Element {
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const selection = useStore((s) => s.selection)
  const revision = useStore((s) => s.revision)
  const zoom = useStore((s) => s.zoom)
  const showGridlines = useStore((s) => s.showGridlines)
  const showFormulaBar = useStore((s) => s.showFormulaBar)
  const showFormulas = useStore((s) => s.showFormulas)
  const hasClipboard = useStore((s) => s.clipboard !== null)
  const painting = useStore((s) => s.formatPainter !== null)
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
  const [tab, setTab] = useState<TabKey>('home')
  const [backstage, setBackstage] = useState(false)

  // リボンが 1 段に収まらない画面では詰めて並べる
  const compact = useMediaQuery(COMPACT_RIBBON)
  // スマホでは、長押しメニューやほかのタブにもある操作をホームから外し、表に高さを譲る
  const phone = useMediaQuery(`(max-width: ${NARROW_WIDTH}px)`)

  // 並べ替えの基準はアクティブセルの列（選択範囲の左端からの相対位置で渡す）
  const sortOffset = Math.max(0, Math.min(selection.anchor.col - range.c0, range.c1 - range.c0))
  const sortColumnName = colToLetter(range.c0 + sortOffset)
  const rowSpan = range.r1 - range.r0 + 1
  const colSpan = range.c1 - range.c0 + 1

  const applyText = (color: string) => {
    setTextColor(color)
    store().applyStyle({ color: color === '#000000' ? undefined : color })
  }
  const applyFill = (color: string) => {
    if (color) setFillColor(color)
    store().applyStyle({ bg: color || undefined })
  }
  const applyBorder = (preset: (typeof BORDER_PRESETS)[number]['preset']) =>
    store().applyBorders(preset, { weight: borderWeight, color: borderColor })
  const applyFontSize = (size: number) => {
    store().applyStyle({ fontSize: size === DEFAULT_FONT_PT ? undefined : size })
    // 折り返しのセルは、大きくした文字で行数が増えることがある
    growRowsToFit(range.r0, range.r1)
  }
  const applyValign = (valign: VerticalAlign) =>
    store().applyStyle({ valign: valign === 'bottom' ? undefined : valign })
  const pasteAs = (mode: PasteMode) => {
    if (mode === 'all') emitMenu('paste')
    else store().paste(undefined, mode)
  }

  const insertSheet = () => {
    const state = store()
    const index = state.model.sheets.findIndex((s) => s.id === state.model.activeSheetId)
    // Excel と同じく、開いているシートの前に入れる
    state.addSheet(Math.max(0, index))
  }

  const currentFont = style?.fontName ?? DEFAULT_FONT_NAME
  const currentSize = style?.fontSize ?? DEFAULT_FONT_PT
  const currentValign = style?.valign ?? 'bottom'
  const currentFormat = style?.numFmt ?? 'General'

  // --- ホーム -----------------------------------------------------------------

  const undoRow = (
    <>
      <button title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={() => store().undo()}>
        <UndoIcon />
      </button>
      <button title="やり直し (Ctrl+Y)" disabled={!canRedo} onClick={() => store().redo()}>
        <RedoIcon />
      </button>
    </>
  )

  const pasteButton = (
    <span className="split">
      <button title="貼り付け (Ctrl+V)" onClick={() => pasteAs('all')}>
        <PasteIcon />
      </button>
      <PopoverButton title="貼り付けのオプション">
        {(close) => (
          <MenuList
            close={close}
            items={[
              { label: '貼り付け (Ctrl+V)', onSelect: () => pasteAs('all') },
              { label: '値', onSelect: () => pasteAs('values'), disabled: !hasClipboard },
              { label: '数式', onSelect: () => pasteAs('formulas'), disabled: !hasClipboard },
              { label: '書式設定', onSelect: () => pasteAs('formats'), disabled: !hasClipboard },
              {
                label: '行列を入れ替える',
                onSelect: () => pasteAs('transpose'),
                disabled: !hasClipboard,
              },
            ]}
          />
        )}
      </PopoverButton>
    </span>
  )

  const clipboardRow = (
    <>
      <button title="切り取り (Ctrl+X)" onClick={() => emitMenu('cut')}>
        <CutIcon />
      </button>
      <button title="コピー (Ctrl+C)" onClick={() => emitMenu('copy')}>
        <CopyIcon />
      </button>
      <button
        title="書式のコピー/貼り付け（ダブルクリックで続けて塗る。Esc で終了）"
        className={painting ? 'active' : ''}
        onClick={() => {
          if (store().formatPainter) store().cancelFormatPainter()
          else store().startFormatPainter(false)
        }}
        onDoubleClick={() => store().startFormatPainter(true)}
      >
        <FormatPainterIcon />
      </button>
    </>
  )

  const fontSelects = (
    <>
      <select
        className="font-name"
        title="フォント"
        value={currentFont}
        onChange={(e) => {
          const name = e.target.value
          store().applyStyle({ fontName: name === DEFAULT_FONT_NAME ? undefined : name })
          focusGrid()
        }}
      >
        {FONTS.some((f) => f.name === currentFont) ? null : (
          <option value={currentFont}>{currentFont}</option>
        )}
        {FONTS.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
      <select
        className="font-size"
        title="フォント サイズ"
        value={currentSize}
        onChange={(e) => {
          applyFontSize(Number(e.target.value))
          focusGrid()
        }}
      >
        {FONT_SIZES.includes(currentSize) ? null : (
          <option value={currentSize}>{currentSize}</option>
        )}
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </>
  )

  const fontGrowShrink = (
    <>
      <button
        title="フォント サイズの拡大"
        onClick={() => applyFontSize(stepFontSize(currentSize, 1))}
      >
        <FontGrowIcon />
      </button>
      <button
        title="フォント サイズの縮小"
        onClick={() => applyFontSize(stepFontSize(currentSize, -1))}
      >
        <FontShrinkIcon />
      </button>
    </>
  )

  const styleButtons = (
    <>
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
      <button
        title="取り消し線"
        className={`glyph${style?.strike ? ' active' : ''}`}
        onClick={() => store().applyStyle({ strike: true }, true)}
      >
        <s>S</s>
      </button>
    </>
  )

  const borderControls = (
    <>
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
    </>
  )

  const borderButton = (
    <PopoverButton title="罫線" icon={<BorderIcon kind="all" />}>
      {(close) => (
        <span className="border-popover">
          <span className="border-grid">
            {BORDER_PRESETS.map((item) => (
              <button
                key={item.preset}
                title={item.label}
                onClick={() => {
                  applyBorder(item.preset)
                  close()
                }}
              >
                <BorderIcon kind={item.preset} />
              </button>
            ))}
          </span>
          <span className="border-options">{borderControls}</span>
        </span>
      )}
    </PopoverButton>
  )

  // 塗りつぶしと文字色は Excel と同じ分割ボタン（左で最後の色、▾ で色を選ぶ）
  const colorButtons = (
    <>
      <span className="split">
        <button
          title={`塗りつぶしの色 ${fillColor}`}
          onClick={() => store().applyStyle({ bg: fillColor })}
        >
          <FillColorIcon color={fillColor} />
        </button>
        <PopoverButton title="塗りつぶしの色を選ぶ">
          {(close) => (
            <Swatches
              colors={FILL_COLORS}
              noneLabel="塗りつぶしなし"
              onPick={(c) => {
                applyFill(c)
                close()
              }}
            />
          )}
        </PopoverButton>
      </span>
      <span className="split">
        <button
          title={`フォントの色 ${textColor}`}
          onClick={() => store().applyStyle({ color: textColor })}
        >
          <FontColorIcon color={textColor} />
        </button>
        <PopoverButton title="フォントの色を選ぶ">
          {(close) => (
            <Swatches
              colors={TEXT_COLORS}
              onPick={(c) => {
                applyText(c)
                close()
              }}
            />
          )}
        </PopoverButton>
      </span>
    </>
  )

  const valignButtons = (
    <>
      <button
        title="上揃え"
        className={currentValign === 'top' ? 'active' : ''}
        onClick={() => applyValign('top')}
      >
        <AlignTopIcon />
      </button>
      <button
        title="上下中央揃え"
        className={currentValign === 'middle' ? 'active' : ''}
        onClick={() => applyValign('middle')}
      >
        <AlignMiddleIcon />
      </button>
      <button
        title="下揃え"
        className={currentValign === 'bottom' ? 'active' : ''}
        onClick={() => applyValign('bottom')}
      >
        <AlignBottomIcon />
      </button>
    </>
  )

  const wrapButton = (
    <button
      title="折り返して全体を表示する"
      className={style?.wrap ? 'active' : ''}
      onClick={() => {
        const on = !style?.wrap
        store().applyStyle({ wrap: on || undefined })
        if (on) growRowsToFit(range.r0, range.r1)
      }}
    >
      <WrapIcon />
    </button>
  )

  const alignButtons = (
    <>
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
    </>
  )

  const mergeButton = (
    <button title="セルを結合して中央揃え／解除" onClick={() => store().toggleMerge()}>
      <MergeIcon />
    </button>
  )

  const known = NUMBER_FORMATS.some((f) => f.code === currentFormat)
  const numberSelect = (
    <select
      className="number-format"
      title="表示形式"
      value={currentFormat}
      onChange={(e) => {
        store().applyStyle({
          numFmt: e.target.value === 'General' ? undefined : e.target.value,
        })
        focusGrid()
      }}
    >
      {known ? null : <option value={currentFormat}>ユーザー定義（{currentFormat}）</option>}
      {NUMBER_FORMATS.map((fmt) => (
        <option key={fmt.code} value={fmt.code}>
          {fmt.label}
        </option>
      ))}
    </select>
  )

  const numberButtons = (
    <>
      <button title="通貨表示形式" onClick={() => store().applyStyle({ numFmt: '¥#,##0' })}>
        <CurrencyIcon />
      </button>
      <button title="パーセント スタイル" onClick={() => store().applyStyle({ numFmt: '0%' })}>
        <PercentIcon />
      </button>
      <button title="桁区切りスタイル" onClick={() => store().applyStyle({ numFmt: '#,##0' })}>
        <CommaIcon />
      </button>
      <button title="小数点以下の表示桁数を増やす" onClick={() => store().adjustDecimals(1)}>
        <DecimalIncIcon />
      </button>
      <button title="小数点以下の表示桁数を減らす" onClick={() => store().adjustDecimals(-1)}>
        <DecimalDecIcon />
      </button>
    </>
  )

  const insertMenu = (
    <PopoverButton title="セル・行・列・シートの挿入" icon={<InsertRowIcon />} label="挿入">
      {(close) => (
        <MenuList
          close={close}
          items={[
            {
              label: `${rowSpan} 行を挿入`,
              onSelect: () => store().insertRows(range.r0, rowSpan),
            },
            {
              label: `${colSpan} 列を挿入`,
              onSelect: () => store().insertColumns(range.c0, colSpan),
            },
            'separator',
            { label: 'シートの挿入 (Shift+F11)', onSelect: () => insertSheet() },
          ]}
        />
      )}
    </PopoverButton>
  )

  const deleteMenu = (
    <PopoverButton title="セル・行・列・シートの削除" icon={<DeleteRowIcon />} label="削除">
      {(close) => (
        <MenuList
          close={close}
          items={[
            {
              label: `${rowSpan} 行を削除`,
              onSelect: () => store().deleteRows(range.r0, rowSpan),
            },
            {
              label: `${colSpan} 列を削除`,
              onSelect: () => store().deleteColumns(range.c0, colSpan),
            },
            'separator',
            {
              label: 'シートの削除',
              onSelect: () => {
                const state = store()
                const name = state.activeSheet().name
                if (confirm(`「${name}」を削除しますか？`))
                  state.removeSheet(state.model.activeSheetId)
              },
            },
          ]}
        />
      )}
    </PopoverButton>
  )

  const formatMenu = (
    <PopoverButton title="行の高さ・列の幅・表示/非表示" icon={<CellFormatIcon />} label="書式">
      {(close) => (
        <MenuList
          close={close}
          items={[
            {
              label: '行の高さの自動調整',
              onSelect: () => {
                const heights: Record<number, number> = {}
                for (let r = range.r0; r <= range.r1; r++) heights[r] = fitRowHeight(r)
                store().setRowHeights(heights)
              },
            },
            {
              label: '列の幅の自動調整',
              onSelect: () => {
                for (let c = range.c0; c <= range.c1; c++) store().setColWidth(c, fitColumnWidth(c))
              },
            },
            'separator',
            { label: '行を表示しない', onSelect: () => store().hideRows(range.r0, range.r1) },
            { label: '列を表示しない', onSelect: () => store().hideCols(range.c0, range.c1) },
            { label: '行の再表示', onSelect: () => store().unhideRows(range.r0, range.r1) },
            { label: '列の再表示', onSelect: () => store().unhideCols(range.c0, range.c1) },
          ]}
        />
      )}
    </PopoverButton>
  )

  const autoSumButton = (
    <span className="split">
      <button
        title="オート SUM (Alt+=)。上（または左）の数値をまとめて合計"
        onClick={() => {
          store().autoSum('SUM')
          focusGrid()
        }}
      >
        <SigmaIcon />
      </button>
      <PopoverButton title="ほかの集計">
        {(close) => (
          <MenuList
            close={close}
            items={AUTO_FUNCTIONS.map(({ fn, label }) => ({
              label: `${label}（${fn}）`,
              onSelect: () => store().autoSum(fn),
            }))}
          />
        )}
      </PopoverButton>
    </span>
  )

  // Excel の「クリア ▾」と同じく、押すと種類を選べる
  const clearMenu = (
    <PopoverButton title="クリア" icon={<EraserIcon />}>
      {(close) => (
        <MenuList
          close={close}
          items={[
            {
              label: 'すべてクリア',
              onSelect: () => {
                store().clearSelection()
                store().clearStyles()
              },
            },
            { label: '書式のクリア', onSelect: () => store().clearStyles() },
            { label: '数式と値のクリア (Delete)', onSelect: () => store().clearSelection() },
          ]}
        />
      )}
    </PopoverButton>
  )

  const findMenu = (
    <PopoverButton title="検索と選択" icon={<SearchIcon />}>
      {(close) => (
        <MenuList
          close={close}
          items={[
            { label: '検索 (Ctrl+F)', onSelect: () => emitMenu('find') },
            { label: '置換 (Ctrl+H)', onSelect: () => emitMenu('replace') },
          ]}
        />
      )}
    </PopoverButton>
  )

  // --- 挿入 -------------------------------------------------------------------

  const insertCellItems = (
    <>
      <button className="text-button" onClick={() => store().insertRows(range.r0, rowSpan)}>
        行の挿入
      </button>
      <button className="text-button" onClick={() => store().insertColumns(range.c0, colSpan)}>
        列の挿入
      </button>
    </>
  )

  const insertSheetItems = (
    <button className="text-button" title="新しいシート (Shift+F11)" onClick={insertSheet}>
      新しいシート
    </button>
  )

  const insertNowItems = (
    <>
      <button
        className="text-button"
        title="今日の日付 (Ctrl+;)"
        onClick={() => store().insertNow('date')}
      >
        今日の日付
      </button>
      <button
        className="text-button"
        title="現在の時刻 (Ctrl+:)"
        onClick={() => store().insertNow('time')}
      >
        現在の時刻
      </button>
    </>
  )

  // --- 数式 -------------------------------------------------------------------

  const functionItems = (
    <>
      <button
        className="text-button"
        title="関数の挿入（一覧から探して入れる）"
        onClick={() => emitMenu('insert-function')}
      >
        <i className="fx-label">fx</i> 関数の挿入
      </button>
      {AUTO_FUNCTIONS.map(({ fn, label }) => (
        <button
          key={fn}
          className="text-button"
          title={
            fn === 'SUM'
              ? 'オート SUM (Alt+=)。上（または左）の数値をまとめて合計'
              : `${label}（${fn} 関数）`
          }
          onClick={() => {
            store().autoSum(fn)
            focusGrid()
          }}
        >
          {fn === 'SUM' ? 'Σ オート SUM' : label}
        </button>
      ))}
    </>
  )

  const formulaViewItems = (
    <Toggle
      label="数式の表示"
      title="セルに計算結果ではなく数式を出す (Ctrl+Shift+@)"
      checked={showFormulas}
      onChange={() => store().toggleShowFormulas()}
    />
  )

  // --- データ -----------------------------------------------------------------

  const sortItems = (
    <>
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
      <label
        className="checkbox"
        title="選択範囲の先頭行を見出しとして並べ替え・重複の削除から外す"
      >
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
    </>
  )

  const dataToolItems = (
    <button
      className="text-button"
      title="選択範囲から、すべての列が同じ行を取り除く"
      onClick={() => store().removeDuplicates(skipHeader)}
    >
      重複の削除
    </button>
  )

  // --- 表示 -------------------------------------------------------------------

  const showItems = (
    <>
      <Toggle label="目盛線" checked={showGridlines} onChange={() => store().toggleGridlines()} />
      <Toggle
        label="数式バー"
        checked={showFormulaBar}
        onChange={() => store().toggleFormulaBar()}
      />
    </>
  )

  const zoomItems = (
    <>
      <button
        className="text-button"
        title="表示を小さく"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => store().setZoom(zoom - 0.1)}
      >
        −
      </button>
      <button className="text-button" title="100% に戻す" onClick={() => store().setZoom(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="text-button"
        title="表示を大きく"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => store().setZoom(zoom + 0.1)}
      >
        ＋
      </button>
    </>
  )

  const windowItems = (
    <button
      title="アクティブセルの左上でウィンドウ枠を固定／解除"
      onClick={() => store().toggleFreeze()}
    >
      <FreezeIcon />
    </button>
  )

  // スマホのホームはよく使う書式だけ。ほかは長押しメニューと各タブにある
  const homeGroups: Group[] = phone
    ? [
        { key: 'undo', label: '元に戻す', rows: [undoRow] },
        {
          key: 'font',
          label: 'フォント',
          rows: [
            <>
              {styleButtons}
              {colorButtons}
              {borderButton}
            </>,
          ],
        },
        {
          key: 'align',
          label: '配置',
          rows: [
            <>
              {alignButtons}
              {wrapButton}
              {mergeButton}
            </>,
          ],
        },
        { key: 'number', label: '数値', rows: [numberSelect] },
      ]
    : [
        { key: 'undo', label: '元に戻す', rows: [undoRow] },
        { key: 'clipboard', label: 'クリップボード', rows: [pasteButton, clipboardRow] },
        {
          key: 'font',
          label: 'フォント',
          rows: [
            <>
              {fontSelects}
              {fontGrowShrink}
            </>,
            <>
              {styleButtons}
              <span className="vsep" />
              {borderButton}
              <span className="vsep" />
              {colorButtons}
            </>,
          ],
        },
        {
          key: 'align',
          label: '配置',
          rows: [
            <>
              {valignButtons}
              <span className="vsep" />
              {wrapButton}
            </>,
            <>
              {alignButtons}
              <span className="vsep" />
              {mergeButton}
            </>,
          ],
        },
        { key: 'number', label: '数値', rows: [numberSelect, numberButtons] },
        {
          key: 'cells',
          label: 'セル',
          rows: [
            <>
              {insertMenu}
              {deleteMenu}
            </>,
            formatMenu,
          ],
        },
        {
          key: 'edit',
          label: '編集',
          rows: [
            <>
              {autoSumButton}
              {clearMenu}
            </>,
            findMenu,
          ],
        },
      ]

  const tabs: Array<{ key: TabKey; label: string; groups: Group[] }> = [
    { key: 'home', label: 'ホーム', groups: homeGroups },
    {
      key: 'insert',
      label: '挿入',
      groups: [
        { key: 'cells', label: 'セル', rows: [insertCellItems] },
        { key: 'sheet', label: 'シート', rows: [insertSheetItems] },
        { key: 'now', label: '日付と時刻', rows: [insertNowItems] },
      ],
    },
    {
      key: 'formulas',
      label: '数式',
      groups: [
        { key: 'functions', label: '関数ライブラリ', rows: [functionItems] },
        { key: 'audit', label: 'ワークシート分析', rows: [formulaViewItems] },
      ],
    },
    {
      key: 'data',
      label: 'データ',
      groups: [
        { key: 'sort', label: '並べ替え', rows: [sortItems] },
        { key: 'tools', label: 'データツール', rows: [dataToolItems] },
        { key: 'find', label: '検索', rows: [findMenu] },
      ],
    },
    {
      key: 'view',
      label: '表示',
      groups: [
        { key: 'show', label: '表示', rows: [showItems] },
        { key: 'zoom', label: 'ズーム', rows: [zoomItems] },
        { key: 'window', label: 'ウィンドウ', rows: [windowItems] },
      ],
    },
  ]
  const current = tabs.find((t) => t.key === tab) ?? tabs[0]

  // ボタンを押してもグリッドのフォーカスを奪わない（Excel と同じ挙動）。
  // select や色は操作にフォーカスが要るので、変更後にグリッドへ戻す
  const keepFocus = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault()
  }

  return (
    <div className={`toolbar ribbon${compact ? ' compact' : ''}`} onMouseDown={keepFocus}>
      <div className="ribbon-tabs" role="tablist">
        <button
          className="file-tab"
          title="ファイル（新規・開く・保存など）"
          onClick={() => setBackstage(true)}
        >
          ファイル
        </button>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === current.key}
            className={t.key === current.key ? 'active' : ''}
            onClick={() => {
              setTab(t.key)
              focusGrid()
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {compact ? (
        <div className="items">
          {current.groups.map((group, index) => (
            <span className="section" key={group.key} title={group.label}>
              {index > 0 ? <span className="vsep" /> : null}
              {group.rows.map((row, i) => (
                <span className="section" key={i}>
                  {row}
                </span>
              ))}
            </span>
          ))}
        </div>
      ) : (
        <div className="ribbon-body">
          {current.groups.map((group) => (
            <GroupBox key={group.key} label={group.label} rows={group.rows} />
          ))}
        </div>
      )}

      {backstage ? (
        <Backstage
          onClose={() => {
            setBackstage(false)
            focusGrid()
          }}
        />
      ) : null}
    </div>
  )
}
