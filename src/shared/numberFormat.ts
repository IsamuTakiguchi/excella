/**
 * 表示形式（numFmt）のフォーマッタ。
 *
 * Excel の書式コードを完全に実装するのは MVP のスコープ外なので、実用的な
 * サブセットをテーブルで持ち、未知のコードは General として扱う。
 * ただし未知のコードも文字列としてはモデルに保持するため、xlsx へ往復しても失われない。
 */

/** Excel のシリアル値の起点（HyperFormula の既定 nullDate と同じ 1899-12-30） */
const EPOCH_UTC = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86400000

export const NUMBER_FORMATS = [
  { code: 'General', label: '標準' },
  { code: '0', label: '整数' },
  { code: '0.00', label: '小数点以下 2 桁' },
  { code: '#,##0', label: '桁区切り' },
  { code: '#,##0.00', label: '桁区切り + 小数 2 桁' },
  { code: '0%', label: 'パーセント' },
  { code: '0.00%', label: 'パーセント (2 桁)' },
  { code: '¥#,##0', label: '通貨 (円)' },
  { code: '$#,##0.00', label: '通貨 (ドル)' },
  { code: 'yyyy/mm/dd', label: '日付 (2024/01/31)' },
  { code: 'yyyy-mm-dd', label: '日付 (2024-01-31)' },
  { code: 'm/d', label: '日付 (1/31)' },
  { code: 'h:mm', label: '時刻 (13:05)' },
  { code: 'h:mm:ss', label: '時刻 (13:05:30)' },
  { code: 'yyyy/mm/dd h:mm', label: '日付と時刻' },
] as const

const DATE_CODES = new Set([
  'yyyy/mm/dd',
  'yyyy-mm-dd',
  'm/d',
  'h:mm',
  'h:mm:ss',
  'yyyy/mm/dd h:mm',
])

export function isDateFormat(code: string | undefined): boolean {
  return code !== undefined && DATE_CODES.has(code)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fixed(value: number, decimals: number, grouping: boolean): string {
  const neg = value < 0
  const abs = Math.abs(value)
  const s = abs.toFixed(decimals)
  const [int, frac] = s.split('.')
  const head = grouping ? groupThousands(int) : int
  const body = frac ? `${head}.${frac}` : head
  return neg ? `-${body}` : body
}

/** 'General' 相当。指数が極端なときだけ指数表記に落とす。 */
export function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e11 || abs < 1e-10) return value.toExponential(5).replace('e', 'E')
  // 浮動小数の誤差を丸めたうえで末尾のゼロを落とす
  const rounded = Number(value.toPrecision(12))
  return String(rounded)
}

export function serialToDate(serial: number): Date {
  return new Date(EPOCH_UTC + Math.round(serial * MS_PER_DAY))
}

export function dateToSerial(date: Date): number {
  return (date.getTime() - EPOCH_UTC) / MS_PER_DAY
}

function formatDate(serial: number, code: string): string {
  const d = serialToDate(serial)
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const da = d.getUTCDate()
  const h = d.getUTCHours()
  const mi = d.getUTCMinutes()
  const se = d.getUTCSeconds()
  switch (code) {
    case 'yyyy/mm/dd':
      return `${y}/${pad2(mo)}/${pad2(da)}`
    case 'yyyy-mm-dd':
      return `${y}-${pad2(mo)}-${pad2(da)}`
    case 'm/d':
      return `${mo}/${da}`
    case 'h:mm':
      return `${h}:${pad2(mi)}`
    case 'h:mm:ss':
      return `${h}:${pad2(mi)}:${pad2(se)}`
    case 'yyyy/mm/dd h:mm':
      return `${y}/${pad2(mo)}/${pad2(da)} ${h}:${pad2(mi)}`
    default:
      return formatGeneral(serial)
  }
}

/** 数値を書式コードに従って文字列化する。未知のコードは General 扱い。 */
export function formatNumber(value: number, code: string | undefined): string {
  if (!Number.isFinite(value)) return String(value)
  if (!code || code === 'General') return formatGeneral(value)
  if (DATE_CODES.has(code)) return formatDate(value, code)

  switch (code) {
    case '0':
      return fixed(value, 0, false)
    case '0.00':
      return fixed(value, 2, false)
    case '#,##0':
      return fixed(value, 0, true)
    case '#,##0.00':
      return fixed(value, 2, true)
    case '0%':
      return `${fixed(value * 100, 0, false)}%`
    case '0.00%':
      return `${fixed(value * 100, 2, false)}%`
    case '¥#,##0':
      return `¥${fixed(value, 0, true)}`
    case '$#,##0.00':
      return `$${fixed(value, 2, true)}`
    default:
      return formatGeneral(value)
  }
}

/** セルの計算結果を表示文字列に変換する。 */
export function formatCellValue(
  value: string | number | boolean | null | undefined,
  code: string | undefined,
): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return formatNumber(value, code)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return value
}
