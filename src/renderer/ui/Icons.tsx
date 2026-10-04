/**
 * ツールバーなどで使う小さな SVG アイコン。
 * 絵文字や Unicode 記号だと OS ごとに見た目が変わるので、自前の線画にそろえる。
 * すべて 16px・stroke は currentColor。色付きの帯だけ props の color で塗る。
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  /*
   * 線幅 1.5 は高解像度の画面でピクセルの境目に半端に乗り、輪郭がにじむ
   * （端末ピクセル比 3 なら 4.5px ぶん）。2 なら 1x・2x・3x のどれでも
   * 整数ピクセルに収まるので、小さくても輪郭がはっきりする。
   */
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function UndoIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M6 4 3 7l3 3" />
      <path d="M3 7h6.5a3.5 3.5 0 0 1 0 7H8" />
    </svg>
  )
}

export function RedoIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="m10 4 3 3-3 3" />
      <path d="M13 7H6.5a3.5 3.5 0 0 0 0 7H8" />
    </svg>
  )
}

export function AlignLeftIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 4h12M2 8h8M2 12h12" />
    </svg>
  )
}

export function AlignCenterIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 4h12M4 8h8M2 12h12" />
    </svg>
  )
}

export function AlignRightIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 4h12M6 8h8M2 12h12" />
    </svg>
  )
}

/** 文字色。Excel と同じく「A」の下に現在の色の帯を出す */
export function FontColorIcon({ color, ...p }: IconProps & { color: string }): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text
        x="8"
        y="10.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        A
      </text>
      <rect x="2" y="12.5" width="12" height="2.5" fill={color} stroke="none" />
    </svg>
  )
}

/** 塗りつぶし。バケツと現在の色の帯 */
export function FillColorIcon({ color, ...p }: IconProps & { color: string }): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M7 2.5 3 6.5l4.5 4.5L12 6.5 7.5 2z" />
      <path d="M3 6.5h8.5" />
      <path d="M13 8.5c.9 1.2.9 2.1 0 3-.9-.9-.9-1.8 0-3z" fill="currentColor" stroke="none" />
      <rect x="2" y="12.5" width="12" height="2.5" fill={color} stroke="none" />
    </svg>
  )
}

export type BorderIconKind =
  'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'none'

/** 罫線のプリセット。薄い点線の格子の上に、引かれる辺だけを実線で描く */
export function BorderIcon({
  kind,
  ...p
}: IconProps & { kind: BorderIconKind }): React.JSX.Element {
  const on = (sides: BorderIconKind[]) => sides.includes(kind)
  const outer = on(['all', 'outer'])
  const inner = on(['all', 'inner'])
  return (
    <svg {...base} {...p}>
      <g stroke="currentColor" strokeOpacity="0.35" strokeDasharray="1 1.5">
        <rect x="2" y="2" width="12" height="12" />
        <path d="M2 8h12M8 2v12" />
      </g>
      <g strokeWidth="1.8">
        {outer || on(['top']) ? <path d="M2 2h12" /> : null}
        {outer || on(['bottom']) ? <path d="M2 14h12" /> : null}
        {outer || on(['left']) ? <path d="M2 2v12" /> : null}
        {outer || on(['right']) ? <path d="M14 2v12" /> : null}
        {inner ? <path d="M2 8h12M8 2v12" /> : null}
        {kind === 'none' ? <path d="M3.5 12.5 12.5 3.5" stroke="#C00000" /> : null}
      </g>
    </svg>
  )
}

export function MergeIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="3.5" width="12" height="9" />
      <path d="M5 8h6" />
      <path d="m9.5 6.5 1.5 1.5-1.5 1.5M6.5 6.5 5 8l1.5 1.5" />
    </svg>
  )
}

export function FreezeIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="2" width="12" height="12" />
      <path d="M2 6h12M6 2v12" strokeWidth="2.2" />
      <path d="M2 10h12M10 2v12" strokeOpacity="0.4" />
    </svg>
  )
}

function GridWithBadge({
  lines,
  minus,
  ...p
}: IconProps & { lines: 'rows' | 'cols'; minus?: boolean }): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="2" width="12" height="12" />
      {lines === 'rows' ? <path d="M2 6h12M2 10h12" /> : <path d="M6 2v12M10 2v12" />}
      <circle cx="12.5" cy="12.5" r="3.2" fill="#fff" />
      <path d={minus ? 'M10.7 12.5h3.6' : 'M12.5 10.7v3.6M10.7 12.5h3.6'} stroke="#107C41" />
    </svg>
  )
}

export const InsertRowIcon = (p: IconProps) => <GridWithBadge lines="rows" {...p} />
export const DeleteRowIcon = (p: IconProps) => <GridWithBadge lines="rows" minus {...p} />
export const InsertColIcon = (p: IconProps) => <GridWithBadge lines="cols" {...p} />
export const DeleteColIcon = (p: IconProps) => <GridWithBadge lines="cols" minus {...p} />

function SortIcon({ desc, ...p }: IconProps & { desc?: boolean }): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M4 3v10M4 13l-2-2M4 13l2-2" />
      <text
        x="11"
        y="7"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {desc ? 'Z' : 'A'}
      </text>
      <text
        x="11"
        y="14.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {desc ? 'A' : 'Z'}
      </text>
    </svg>
  )
}

export const SortAscIcon = (p: IconProps) => <SortIcon {...p} />
export const SortDescIcon = (p: IconProps) => <SortIcon desc {...p} />

/** タイトルバーのロゴ（アプリアイコンと同じ意匠） */
export function LogoIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} width={18} height={18} strokeWidth={1.4} {...p}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
      <path d="M1.5 6h13M1.5 10.5h13M6 1.5v13" />
      <rect x="10.5" y="10.5" width="4" height="4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PasteIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="10" height="11" rx="1" />
      <path d="M6 3V2h4v1" />
      <path d="M6 7h4M6 10h4" />
    </svg>
  )
}

export function CutIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <circle cx="4.5" cy="12" r="2" />
      <circle cx="11.5" cy="12" r="2" />
      <path d="M6 10.5 12 2M10 10.5 4 2" />
    </svg>
  )
}

export function CopyIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
    </svg>
  )
}

/** 消しゴム（クリア） */
export function EraserIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="m9 3 4 4-6 6H4l-2-2 7-8Z" />
      <path d="M6 6l4 4M7 14h7" />
    </svg>
  )
}

/** 文字だけのアイコン（%・¥ など）。線画と同じ 16px の枠にそろえる */
function GlyphIcon({
  text,
  size = 11,
  weight = 700,
  ...p
}: IconProps & { text: string; size?: number; weight?: number }): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize={size}
        fontWeight={weight}
        fill="currentColor"
        stroke="none"
      >
        {text}
      </text>
    </svg>
  )
}

export function CurrencyIcon(p: IconProps): React.JSX.Element {
  return <GlyphIcon text="¥" size={12} {...p} />
}

export function PercentIcon(p: IconProps): React.JSX.Element {
  return <GlyphIcon text="%" size={12} {...p} />
}

/** 桁区切りスタイル */
export function CommaIcon(p: IconProps): React.JSX.Element {
  return <GlyphIcon text="000" size={7.5} {...p} />
}

/** 小数点以下の表示桁数を増やす（.0 → .00） */
export function DecimalIncIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text x="1" y="7" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">
        .0
      </text>
      <text x="4" y="15" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">
        .00
      </text>
      <path d="M12 3h-4m1.5-1.5L8 3l1.5 1.5" strokeWidth="1" />
    </svg>
  )
}

/** 小数点以下の表示桁数を減らす（.00 → .0） */
export function DecimalDecIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text x="0" y="7" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">
        .00
      </text>
      <text x="6" y="15" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">
        .0
      </text>
      <path d="M11 11h4m-1.5-1.5L15 11l-1.5 1.5" strokeWidth="1" />
    </svg>
  )
}

/** フォントサイズの拡大 */
export function FontGrowIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text x="1" y="14" fontSize="13" fontWeight="700" fill="currentColor" stroke="none">
        A
      </text>
      <path d="m11 5 2-2.5L15 5" strokeWidth="1.5" />
    </svg>
  )
}

/** フォントサイズの縮小 */
export function FontShrinkIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <text x="1.5" y="14" fontSize="10" fontWeight="700" fill="currentColor" stroke="none">
        A
      </text>
      <path d="m10.5 2.5 2 2.5 2-2.5" strokeWidth="1.5" />
    </svg>
  )
}

export function AlignTopIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 2.5h12M8 13V6m-2.5 2.5L8 6l2.5 2.5" />
    </svg>
  )
}

export function AlignMiddleIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 8h12M8 1.5V5M6.5 3.5 8 5l1.5-1.5M8 14.5V11m-1.5 1.5L8 11l1.5 1.5" />
    </svg>
  )
}

export function AlignBottomIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 13.5h12M8 3v7m-2.5-2.5L8 10l2.5-2.5" />
    </svg>
  )
}

/** 折り返して全体を表示する */
export function WrapIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M2 3.5h12M2 8h9.5a2 2 0 0 1 0 4H8m1.5-1.5L8 12l1.5 1.5M2 12.5h3.5" />
    </svg>
  )
}

/** 書式のコピー／貼り付け（刷毛） */
export function FormatPainterIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="2" width="10" height="4" rx="1" />
      <path d="M12 4h2v4H8v2" />
      <path d="M7 10h2v4.5H7z" />
    </svg>
  )
}

export function SearchIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </svg>
  )
}

export function SigmaIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M12.5 3.5v-1h-9L8 8l-4.5 5.5h9v-1" />
    </svg>
  )
}

/** 行・列の書式（高さや幅、非表示） */
export function CellFormatIcon(p: IconProps): React.JSX.Element {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M2 6.5h12M6.5 2v12" />
    </svg>
  )
}
