/**
 * セルに打ち込んだ文字列の解釈。Excel と同じく、日付・時刻・桁区切り・通貨・パーセントは
 * 数値として取り込み、見た目を保つ表示形式も一緒に返す（例：「2024/1/31」→ 日付のシリアル値と yyyy/m/d）。
 */
import type { CellData } from './model'
import { dateToSerial } from './numberFormat'

export type ParsedInput = {
  data: CellData | null
  /** セルにまだ表示形式が無いときに付ける表示形式 */
  numFmt?: string
}

const NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const GROUPED = /^(-?)(\d{1,3}(?:,\d{3})+)(\.\d+)?$/
const CURRENCY = /^(-?)([¥￥$])\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/
const PERCENT = /^(-?(?:\d+\.?\d*|\.\d+))%$/
const YMD = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/
const YMD_JA = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/
const MD = /^(\d{1,2})\/(\d{1,2})$/
const MD_JA = /^(\d{1,2})月(\d{1,2})日$/
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

/** 実在する日付ならシリアル値（2/30 のようなものは null） */
function dateSerial(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return dateToSerial(date)
}

function decimalsOf(fraction: string | undefined): number {
  return fraction ? fraction.length - 1 : 0
}

export function parseTypedInput(text: string, now: Date = new Date()): ParsedInput {
  if (text === '') return { data: null }
  if (text.startsWith('=')) return { data: { f: text } }
  const t = text.trim()

  if (NUMBER.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return { data: { v: n } }
  }

  let m = PERCENT.exec(t)
  if (m) {
    const n = Number(m[1]) / 100
    if (Number.isFinite(n)) {
      const decimals = m[1].includes('.') ? m[1].split('.')[1].length : 0
      return { data: { v: n }, numFmt: decimals > 0 ? '0.00%' : '0%' }
    }
  }

  m = GROUPED.exec(t)
  if (m) {
    const n = Number(`${m[1]}${m[2].replace(/,/g, '')}${m[3] ?? ''}`)
    const decimals = decimalsOf(m[3])
    return {
      data: { v: n },
      numFmt: decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0',
    }
  }

  m = CURRENCY.exec(t)
  if (m) {
    const n = Number(`${m[1]}${m[3].replace(/,/g, '')}${m[4] ?? ''}`)
    const yen = m[2] !== '$'
    const decimals = decimalsOf(m[4])
    const tail = decimals > 0 ? `.${'0'.repeat(decimals)}` : yen ? '' : '.00'
    return { data: { v: n }, numFmt: `${yen ? '¥' : '$'}#,##0${tail}` }
  }

  m = YMD.exec(t) ?? YMD_JA.exec(t)
  if (m) {
    const serial = dateSerial(Number(m[1]), Number(m[2]), Number(m[3]))
    if (serial !== null) {
      return {
        data: { v: serial },
        numFmt: t.includes('年') ? 'yyyy"年"m"月"d"日"' : 'yyyy/m/d',
      }
    }
  }

  m = MD.exec(t) ?? MD_JA.exec(t)
  if (m) {
    // 年を省いた日付は今年（Excel と同じ）
    const serial = dateSerial(now.getFullYear(), Number(m[1]), Number(m[2]))
    if (serial !== null) return { data: { v: serial }, numFmt: 'm"月"d"日"' }
  }

  m = TIME.exec(t)
  if (m) {
    const h = Number(m[1])
    const mi = Number(m[2])
    const s = m[3] === undefined ? 0 : Number(m[3])
    if (h < 24 && mi < 60 && s < 60) {
      return {
        data: { v: (h * 3600 + mi * 60 + s) / 86400 },
        numFmt: m[3] === undefined ? 'h:mm' : 'h:mm:ss',
      }
    }
  }

  if (t === 'TRUE' || t === 'true') return { data: { v: true } }
  if (t === 'FALSE' || t === 'false') return { data: { v: false } }
  return { data: { v: text } }
}
