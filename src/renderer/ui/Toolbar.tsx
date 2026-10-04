import { useEffect, useRef, useState } from 'react'
import { colToLetter } from '@shared/a1'
import { BORDER_PRESETS, BORDER_WEIGHTS } from '@shared/borders'
import { AUTO_FUNCTIONS } from '@shared/dataTools'
import type { BorderWeight } from '@shared/model'
import { NUMBER_FORMATS } from '@shared/numberFormat'
import { COMPACT_RIBBON, NARROW_WIDTH } from '../device'
import { focusGrid } from '../grid/focus'
import { MAX_ZOOM, MIN_ZOOM } from '../grid/geometry'
import { emitMenu } from '../menuBus'
import { useStore } from '../store/workbookStore'
import { useMediaQuery } from '../useMediaQuery'
import { Backstage } from './Backstage'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BorderIcon,
  CopyIcon,
  CutIcon,
  DeleteColIcon,
  DeleteRowIcon,
  EraserIcon,
  FillColorIcon,
  FontColorIcon,
  FreezeIcon,
  InsertColIcon,
  InsertRowIcon,
  MergeIcon,
  PasteIcon,
  RedoIcon,
  SortAscIcon,
  SortDescIcon,
  UndoIcon,
} from './Icons'

/** Excel の「標準の色」に合わせた文字色 */
const TEXT_COLORS = ['#000000', '#C00000', '#ED7D31', '#FFC000', '#00B050', '#0070C0', '#7030A0']
/** Excel でよく使われる薄い塗りつぶし色 */
const FILL_COLORS = ['', '#FFF2CC', '#FCE4D6', '#DDEBF7', '#E2EFDA', '#EDEDED', '#F8CBAD']

type TabKey = 'home' | 'insert' | 'formulas' | 'data' | 'view'
type Group = { key: string; label: string; items: React.ReactNode }

/** Excel のリボンと同じく、ボタンの下にグループ名を出す（広い画面のとき） */
function GroupBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group">
      <div className="items">{children}</div>
      <div className="group-label">{label}</div>
    </div>
  )
}

/**
 * 押すと下に開くボタン（狭い画面の色見本・罫線）。
 * 開いた位置は画面に対して固定する。リボンは横に流れるので、
 * その中に置くと切り取られて中身が見えない。
 */
function PopoverButton({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
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
        className="with-caret"
        aria-expanded={open}
        onClick={(e) => {
          if (open) {
            setAt(null)
            return
          }
          const r = e.currentTarget.getBoundingClientRect()
          // 右端からはみ出さないように寄せる
          setAt({ left: Math.max(4, Math.min(r.left, window.innerWidth - 240)), top: r.bottom + 2 })
        }}
      >
        {icon}
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

function Swatches({
  colors,
  onPick,
}: {
  colors: string[]
  onPick: (color: string) => void
}): React.JSX.Element {
  return (
    <span className="swatch-grid">
      {colors.map((color) => (
        <button
          key={color || 'none'}
          className={`swatch${color ? '' : ' none'}`}
          title={color || 'なし'}
          style={color ? { background: color } : undefined}
          onClick={() => onPick(color)}
        />
      ))}
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
 * 広い画面ではグループ名つきで横に並べ、狭い画面では折り返して詰める。
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

  // リボンが 1 段に収まらない画面では詰めて並べる（色と罫線はボタンから開く形に）
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
    setFillColor(color)
    store().applyStyle({ bg: color || undefined })
  }
  const applyBorder = (preset: (typeof BORDER_PRESETS)[number]['preset']) =>
    store().applyBorders(preset, { weight: borderWeight, color: borderColor })

  // --- ホーム -----------------------------------------------------------------

  const undoItems = (
    <>
      <button title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={() => store().undo()}>
        <UndoIcon />
      </button>
      <button title="やり直し (Ctrl+Y)" disabled={!canRedo} onClick={() => store().redo()}>
        <RedoIcon />
      </button>
    </>
  )

  const clipboardItems = (
    <>
      <button title="貼り付け (Ctrl+V)" onClick={() => emitMenu('paste')}>
        <PasteIcon />
      </button>
      <button title="切り取り (Ctrl+X)" onClick={() => emitMenu('cut')}>
        <CutIcon />
      </button>
      <button title="コピー (Ctrl+C)" onClick={() => emitMenu('copy')}>
        <CopyIcon />
      </button>
    </>
  )

  const fontItems = (
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
      <span className="vsep" />
      {compact ? (
        <>
          <PopoverButton title="文字色" icon={<FontColorIcon color={textColor} />}>
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
          <PopoverButton title="塗りつぶし" icon={<FillColorIcon color={fillColor || '#ffffff'} />}>
            {(close) => (
              <Swatches
                colors={FILL_COLORS}
                onPick={(c) => {
                  applyFill(c)
                  close()
                }}
              />
            )}
          </PopoverButton>
        </>
      ) : (
        <>
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
                onClick={() => applyText(color)}
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
                onClick={() => applyFill(color)}
              />
            ))}
          </span>
        </>
      )}
    </>
  )

  const alignItems = (
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
      <span className="vsep" />
      <button title="セルを結合／解除" onClick={() => store().toggleMerge()}>
        <MergeIcon />
      </button>
    </>
  )

  const numberItems = (
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

  const borderItems = compact ? (
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
  ) : (
    <>
      {BORDER_PRESETS.map((item) => (
        <button key={item.preset} title={item.label} onClick={() => applyBorder(item.preset)}>
          <BorderIcon kind={item.preset} />
        </button>
      ))}
      {borderControls}
    </>
  )

  const cellItems = (
    <>
      <button title="行を挿入" onClick={() => store().insertRows(range.r0, rowSpan)}>
        <InsertRowIcon />
      </button>
      <button title="行を削除" onClick={() => store().deleteRows(range.r0, rowSpan)}>
        <DeleteRowIcon />
      </button>
      <button title="列を挿入" onClick={() => store().insertColumns(range.c0, colSpan)}>
        <InsertColIcon />
      </button>
      <button title="列を削除" onClick={() => store().deleteColumns(range.c0, colSpan)}>
        <DeleteColIcon />
      </button>
    </>
  )

  // Excel の「クリア ▾」と同じく、押すと種類を選べる
  const editItems = (
    <PopoverButton title="クリア" icon={<EraserIcon />}>
      {(close) => (
        <span className="menu-list">
          <button
            onClick={() => {
              store().clearSelection()
              close()
            }}
          >
            数式と値のクリア（Delete）
          </button>
          <button
            onClick={() => {
              store().clearStyles()
              close()
            }}
          >
            書式のクリア
          </button>
        </span>
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
    <button
      className="text-button"
      title="新しいシート (Shift+F11)"
      onClick={() => {
        const state = store()
        const index = state.model.sheets.findIndex((s) => s.id === state.model.activeSheetId)
        state.addSheet(Math.max(0, index))
      }}
    >
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

  const tabs: Array<{ key: TabKey; label: string; groups: Group[] }> = [
    {
      key: 'home',
      label: 'ホーム',
      groups: [
        { key: 'undo', label: '元に戻す', items: undoItems },
        ...(phone ? [] : [{ key: 'clipboard', label: 'クリップボード', items: clipboardItems }]),
        { key: 'font', label: 'フォント', items: fontItems },
        { key: 'align', label: '配置', items: alignItems },
        { key: 'number', label: '数値', items: numberItems },
        { key: 'border', label: '罫線', items: borderItems },
        ...(phone
          ? []
          : [
              { key: 'cells', label: 'セル', items: cellItems },
              { key: 'edit', label: '編集', items: editItems },
            ]),
      ],
    },
    {
      key: 'insert',
      label: '挿入',
      groups: [
        { key: 'cells', label: 'セル', items: insertCellItems },
        { key: 'sheet', label: 'シート', items: insertSheetItems },
        { key: 'now', label: '日付と時刻', items: insertNowItems },
      ],
    },
    {
      key: 'formulas',
      label: '数式',
      groups: [
        { key: 'functions', label: '関数ライブラリ', items: functionItems },
        { key: 'audit', label: 'ワークシート分析', items: formulaViewItems },
      ],
    },
    {
      key: 'data',
      label: 'データ',
      groups: [
        { key: 'sort', label: '並べ替え', items: sortItems },
        { key: 'tools', label: 'データツール', items: dataToolItems },
      ],
    },
    {
      key: 'view',
      label: '表示',
      groups: [
        { key: 'show', label: '表示', items: showItems },
        { key: 'zoom', label: 'ズーム', items: zoomItems },
        { key: 'window', label: 'ウィンドウ', items: windowItems },
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
              {group.items}
            </span>
          ))}
        </div>
      ) : (
        <div className="ribbon-body">
          {current.groups.map((group) => (
            <GroupBox key={group.key} label={group.label}>
              {group.items}
            </GroupBox>
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
