/**
 * 表示形式（numFmt）のフォーマッタ。
 *
 * Excel の書式コードを字句に分けて解釈する。対応しているのは実際によく使われる範囲で、
 *   - 数値：0 # ? , . % E+、桁区切り、"文字" や \文字 のリテラル、_x（空白）
 *   - 区分：正;負;ゼロ;文字列 の 4 区分（負の区分があれば符号はそちらに任せる）
 *   - 色：[Red] などの色指定（formatCell が色を返す）
 *   - 日付・時刻：yyyy yy m mm mmm d dd ddd aaa aaaa h hh mm ss AM/PM [h] と、和暦の g e
 * 解釈できない部分は無視し、コードの文字列そのものはモデルに残すので xlsx へ往復しても失われない。
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
  { code: '#,##0;[Red]-#,##0', label: '桁区切り（負数は赤）' },
  { code: '#,##0;"▲"#,##0', label: '桁区切り（負数は ▲）' },
  { code: '0%', label: 'パーセント' },
  { code: '0.00%', label: 'パーセント (2 桁)' },
  { code: '¥#,##0', label: '通貨 (円)' },
  { code: '$#,##0.00', label: '通貨 (ドル)' },
  { code: 'yyyy/mm/dd', label: '日付 (2024/01/31)' },
  { code: 'yyyy"年"m"月"d"日"', label: '日付 (2024年1月31日)' },
  { code: 'm"月"d"日"', label: '日付 (1月31日)' },
  { code: 'ggge"年"m"月"d"日"', label: '和暦 (令和6年1月31日)' },
  { code: 'yyyy-mm-dd', label: '日付 (2024-01-31)' },
  { code: 'm/d', label: '日付 (1/31)' },
  { code: 'm/d(aaa)', label: '日付と曜日 (1/31(水))' },
  { code: 'h:mm', label: '時刻 (13:05)' },
  { code: 'h:mm:ss', label: '時刻 (13:05:30)' },
  { code: '[h]:mm', label: '経過時間 (25:30)' },
  { code: 'yyyy/mm/dd h:mm', label: '日付と時刻' },
  { code: '@', label: '文字列' },
] as const

/** Excel の [色] 指定。名前で指定されたものだけ対応する */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  blue: '#0000FF',
  cyan: '#00FFFF',
  green: '#008000',
  magenta: '#FF00FF',
  red: '#FF0000',
  white: '#FFFFFF',
  yellow: '#FFFF00',
}

type Token =
  | { kind: 'lit'; text: string; raw: string }
  /** 0 # ? のいずれか */
  | { kind: 'digit'; ch: '0' | '#' | '?'; raw: string }
  | { kind: 'comma'; raw: string }
  | { kind: 'point'; raw: string }
  | { kind: 'percent'; raw: string }
  | { kind: 'exp'; sign: '+' | '-'; raw: string }
  | { kind: 'date'; text: string; raw: string }
  | { kind: 'ampm'; text: string; raw: string }
  | { kind: 'elapsed'; unit: 'h' | 'm' | 's'; width: number; raw: string }
  | { kind: 'text'; raw: string }
  | { kind: 'general'; raw: string }
  | { kind: 'color'; color: string; raw: string }
  /** 条件 [>100] やロケール [$-411] など、表示に効かないもの */
  | { kind: 'skip'; raw: string }

/** ';' で区分に分ける（引用符・角括弧・\ の中の ';' は区切りではない） */
export function splitSections(code: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  let bracket = false
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '\\' && !quoted && i + 1 < code.length) {
      cur += ch + code[i + 1]
      i++
      continue
    }
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '[') bracket = true
    else if (!quoted && ch === ']') bracket = false
    if (ch === ';' && !quoted && !bracket) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function repeatRun(s: string, i: number, lower: string): number {
  let n = 0
  while (i + n < s.length && s[i + n].toLowerCase() === lower) n++
  return n
}

/** 1 区分を字句に分ける */
export function tokenize(section: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < section.length) {
    const ch = section[i]
    const lower = ch.toLowerCase()

    if (ch === '"') {
      const end = section.indexOf('"', i + 1)
      const stop = end < 0 ? section.length : end
      tokens.push({
        kind: 'lit',
        text: section.slice(i + 1, stop),
        raw: section.slice(i, stop + 1),
      })
      i = stop + 1
      continue
    }
    if (ch === '\\' && i + 1 < section.length) {
      tokens.push({ kind: 'lit', text: section[i + 1], raw: section.slice(i, i + 2) })
      i += 2
      continue
    }
    if (ch === '_' && i + 1 < section.length) {
      // _x は「x の幅の空白」。見た目をそろえる用途なので空白 1 つで代用する
      tokens.push({ kind: 'lit', text: ' ', raw: section.slice(i, i + 2) })
      i += 2
      continue
    }
    if (ch === '*' && i + 1 < section.length) {
      // *x は「残りを x で埋める」。セル幅を知らないので無視する
      tokens.push({ kind: 'skip', raw: section.slice(i, i + 2) })
      i += 2
      continue
    }
    if (ch === '[') {
      const end = section.indexOf(']', i)
      const stop = end < 0 ? section.length - 1 : end
      const inner = section.slice(i + 1, stop)
      const raw = section.slice(i, stop + 1)
      i = stop + 1
      const named = NAMED_COLORS[inner.toLowerCase()]
      if (named) tokens.push({ kind: 'color', color: named, raw })
      else if (/^(h+|m+|s+)$/i.test(inner)) {
        tokens.push({
          kind: 'elapsed',
          unit: inner[0].toLowerCase() as 'h' | 'm' | 's',
          width: inner.length,
          raw,
        })
      } else if (inner.startsWith('$')) {
        // [$¥-411] のような通貨記号つきロケール。記号の部分だけ表示する
        const symbol = inner.slice(1).split('-')[0]
        tokens.push(symbol ? { kind: 'lit', text: symbol, raw } : { kind: 'skip', raw })
      } else tokens.push({ kind: 'skip', raw })
      continue
    }
    if (section.slice(i, i + 7).toLowerCase() === 'general') {
      tokens.push({ kind: 'general', raw: section.slice(i, i + 7) })
      i += 7
      continue
    }
    if (section.slice(i, i + 5).toUpperCase() === 'AM/PM') {
      tokens.push({ kind: 'ampm', text: 'AM/PM', raw: section.slice(i, i + 5) })
      i += 5
      continue
    }
    if (section.slice(i, i + 3).toUpperCase() === 'A/P') {
      tokens.push({ kind: 'ampm', text: 'A/P', raw: section.slice(i, i + 3) })
      i += 3
      continue
    }
    if (ch === '0' || ch === '#' || ch === '?') {
      tokens.push({ kind: 'digit', ch, raw: ch })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', raw: ch })
      i++
      continue
    }
    if (ch === '.') {
      tokens.push({ kind: 'point', raw: ch })
      i++
      continue
    }
    if (ch === '%') {
      tokens.push({ kind: 'percent', raw: ch })
      i++
      continue
    }
    if ((ch === 'E' || ch === 'e') && (section[i + 1] === '+' || section[i + 1] === '-')) {
      tokens.push({ kind: 'exp', sign: section[i + 1] as '+' | '-', raw: section.slice(i, i + 2) })
      i += 2
      continue
    }
    if (ch === '@') {
      tokens.push({ kind: 'text', raw: ch })
      i++
      continue
    }
    if ('ymdhsage'.includes(lower)) {
      const n = repeatRun(section, i, lower)
      const raw = section.slice(i, i + n)
      tokens.push({ kind: 'date', text: lower.repeat(n), raw })
      i += n
      continue
    }
    tokens.push({ kind: 'lit', text: ch, raw: ch })
    i++
  }
  return tokens
}

function isDateSection(tokens: Token[]): boolean {
  const hasDigits = tokens.some((t) => t.kind === 'digit')
  const hasDate = tokens.some(
    (t) => (t.kind === 'date' && t.text !== 'e') || t.kind === 'elapsed' || t.kind === 'ampm',
  )
  // 'e' 単独は和暦の年だが、0.0e+0 のような指数と紛らわしいので数字が無いときだけ日付とみなす
  const eraOnly = tokens.some((t) => t.kind === 'date' && t.text === 'e')
  return !hasDigits && (hasDate || eraOnly)
}

export function isDateFormat(code: string | undefined): boolean {
  if (!code || code === 'General') return false
  return isDateSection(tokenize(splitSections(code)[0]))
}

/** 文字列（@）形式か。入力した数字を数値に変えずに文字列のまま持つ */
export function isTextFormat(code: string | undefined): boolean {
  return code === '@'
}

function pad(n: number, width: number): string {
  const s = String(n)
  return s.length >= width ? s : '0'.repeat(width - s.length) + s
}

/**
 * 四捨五入して小数 decimals 桁の文字列にする。toFixed は 1.555 → '1.55' のように
 * 2 進数の誤差で切り捨てられるので、ごくわずかに持ち上げてから丸める（Excel は 1.56）
 */
function toFixedRounded(value: number, decimals: number): string {
  const factor = 10 ** decimals
  const scaled = value * factor
  if (!Number.isFinite(scaled) || Math.abs(scaled) > 1e15) return value.toFixed(decimals)
  const rounded = Math.round(scaled * (1 + 4 * Number.EPSILON)) / factor
  return rounded.toFixed(decimals)
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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

/**
 * 端末の地域での「今日」をシリアル値に（時刻は 0:00）。
 * シリアル値は UTC の壁時計として表示しているので、現地の年月日をそのまま UTC に置く。
 * そうしないと日本時間の朝 9 時前に「昨日」が入ってしまう。
 */
export function todaySerial(now: Date = new Date()): number {
  return dateToSerial(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

/** 端末の地域での現在時刻を、1 日の端数のシリアル値に */
export function timeSerial(now: Date = new Date()): number {
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

/** 和暦。開始日（UTC の年月日）の新しい順 */
const ERAS = [
  { start: Date.UTC(2019, 4, 1), name: '令和', short: 'R' },
  { start: Date.UTC(1989, 0, 8), name: '平成', short: 'H' },
  { start: Date.UTC(1926, 11, 25), name: '昭和', short: 'S' },
  { start: Date.UTC(1912, 6, 30), name: '大正', short: 'T' },
  { start: Date.UTC(1868, 0, 1), name: '明治', short: 'M' },
]

function eraOf(d: Date): { name: string; short: string; year: number } | null {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  for (const era of ERAS) {
    if (t >= era.start) {
      return {
        name: era.name,
        short: era.short,
        year: d.getUTCFullYear() - new Date(era.start).getUTCFullYear() + 1,
      }
    }
  }
  return null
}

function formatDateTokens(serial: number, tokens: Token[]): string {
  const d = serialToDate(serial)
  const twelve = tokens.some((t) => t.kind === 'ampm')
  const hours = d.getUTCHours()
  const era = tokens.some((t) => t.kind === 'date' && (t.text[0] === 'g' || t.text[0] === 'e'))
    ? eraOf(d)
    : null

  // m は前に h があるか、後ろに s があれば「分」
  const isMinute = (index: number): boolean => {
    for (let j = index - 1; j >= 0; j--) {
      const t = tokens[j]
      if (t.kind === 'date') return t.text[0] === 'h'
      if (t.kind === 'elapsed') return t.unit === 'h'
    }
    for (let j = index + 1; j < tokens.length; j++) {
      const t = tokens[j]
      if (t.kind === 'date') return t.text[0] === 's'
      if (t.kind === 'elapsed') return t.unit === 's'
    }
    return false
  }

  let out = ''
  tokens.forEach((t, index) => {
    switch (t.kind) {
      case 'lit':
        out += t.text
        return
      case 'ampm': {
        const pm = hours >= 12
        out += t.text === 'A/P' ? (pm ? 'P' : 'A') : pm ? 'PM' : 'AM'
        return
      }
      case 'elapsed': {
        const totalSeconds = Math.round(serial * 86400)
        const v =
          t.unit === 'h'
            ? Math.floor(totalSeconds / 3600)
            : t.unit === 'm'
              ? Math.floor(totalSeconds / 60)
              : totalSeconds
        out += pad(v, t.width)
        return
      }
      case 'date':
        break
      case 'point':
      case 'comma':
      case 'percent':
        // 日付の中の . , % はただの文字（ge.m.d など）
        out += t.raw
        return
      default:
        return
    }
    const n = t.text.length
    switch (t.text[0]) {
      case 'y':
        out += n <= 2 ? pad(d.getUTCFullYear() % 100, 2) : String(d.getUTCFullYear())
        return
      case 'm':
        if (n <= 2 && isMinute(index)) {
          out += pad(d.getUTCMinutes(), n)
          return
        }
        if (n <= 2) out += pad(d.getUTCMonth() + 1, n)
        else if (n === 3) out += MONTHS[d.getUTCMonth()].slice(0, 3)
        else if (n === 4) out += MONTHS[d.getUTCMonth()]
        else out += MONTHS[d.getUTCMonth()][0]
        return
      case 'd':
        if (n <= 2) out += pad(d.getUTCDate(), n)
        else if (n === 3) out += WEEKDAYS[d.getUTCDay()].slice(0, 3)
        else out += WEEKDAYS[d.getUTCDay()]
        return
      case 'a':
        // aaa は「水」、aaaa は「水曜日」（日本語版 Excel の曜日）
        out += n >= 4 ? `${WEEKDAYS_JA[d.getUTCDay()]}曜日` : WEEKDAYS_JA[d.getUTCDay()]
        return
      case 'h': {
        const h = twelve ? hours % 12 || 12 : hours
        out += pad(h, Math.min(n, 2))
        return
      }
      case 's':
        out += pad(d.getUTCSeconds(), Math.min(n, 2))
        return
      case 'g':
        if (!era) return
        out += n >= 3 ? era.name : n === 2 ? era.name[0] : era.short
        return
      case 'e':
        if (!era) {
          out += String(d.getUTCFullYear())
          return
        }
        out += n >= 2 ? pad(era.year, 2) : String(era.year)
        return
    }
  })
  return out
}

/** 数値の区分を整形する。signed でなければ符号はコード側（負の区分）が表す */
function formatNumberTokens(value: number, tokens: Token[], signed: boolean): string {
  if (tokens.some((t) => t.kind === 'general')) {
    const general = formatGeneral(signed ? value : Math.abs(value))
    return tokens
      .map((t) => (t.kind === 'general' ? general : t.kind === 'lit' ? t.text : ''))
      .join('')
  }

  const firstDigit = tokens.findIndex((t) => t.kind === 'digit')
  if (firstDigit < 0) {
    // 数字の置き場所が無いコード（"-" だけのゼロの区分など）は、リテラルだけを出す
    return tokens.map((t) => (t.kind === 'lit' ? t.text : '')).join('')
  }
  let lastDigit = firstDigit
  tokens.forEach((t, i) => {
    if (t.kind === 'digit') lastDigit = i
  })

  const percents = tokens.filter((t) => t.kind === 'percent').length
  const expIndex = tokens.findIndex((t) => t.kind === 'exp')
  const pointIndex = tokens.findIndex(
    (t, i) => t.kind === 'point' && i > firstDigit - 1 && (expIndex < 0 || i < expIndex),
  )
  const intEnd = pointIndex >= 0 ? pointIndex : expIndex >= 0 ? expIndex : lastDigit + 1
  const mantissaEnd = expIndex >= 0 ? expIndex : tokens.length

  const intTokens = tokens.slice(firstDigit, intEnd)
  const fracTokens = pointIndex >= 0 ? tokens.slice(pointIndex + 1, mantissaEnd) : []
  const fracDigits = fracTokens.filter((t) => t.kind === 'digit') as Array<
    Extract<Token, { kind: 'digit' }>
  >
  const intDigits = intTokens.filter((t) => t.kind === 'digit') as Array<
    Extract<Token, { kind: 'digit' }>
  >
  // 桁区切りは整数部の数字の間にある ',' のとき。末尾の ',' は千で割る指定
  let grouping = false
  let scale = 0
  intTokens.forEach((t, i) => {
    if (t.kind !== 'comma') return
    const digitAfter = intTokens.slice(i + 1).some((x) => x.kind === 'digit')
    if (digitAfter) grouping = true
    else scale++
  })
  // 小数点の無いコードでは、最後の数字の直後の ',' も千で割る指定（#,##0, など）
  if (pointIndex < 0 && expIndex < 0) {
    for (let i = lastDigit + 1; i < tokens.length && tokens[i].kind === 'comma'; i++) scale++
  }

  let abs = (Math.abs(value) * 100 ** percents) / 1000 ** scale
  let exponent = 0
  if (expIndex >= 0 && abs !== 0) {
    const intWidth = Math.max(1, intDigits.length)
    exponent = Math.floor(Math.log10(abs)) - (intWidth - 1)
    abs = abs / 10 ** exponent
  }

  const decimals = fracDigits.length
  let [intStr, fracStr = ''] = toFixedRounded(abs, decimals).split('.')
  if (expIndex >= 0 && intStr.length > Math.max(1, intDigits.length)) {
    // 丸めで 9.99 → 10.0 になったら指数を 1 つ上げる
    exponent += 1
    ;[intStr, fracStr = ''] = toFixedRounded(abs / 10, decimals).split('.')
  }

  // 小数部：# と ? は末尾のゼロを省く（? は空白にする）
  let fracOut = ''
  if (decimals > 0) {
    const chars = fracStr.split('')
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] !== '0' || fracDigits[i].ch === '0') break
      chars[i] = fracDigits[i].ch === '?' ? ' ' : ''
    }
    fracOut = chars.join('')
  }

  // 整数部：必須桁（0）の数だけゼロで埋める。0 だけのときに # なら空にする
  const minInt = intDigits.filter((t) => t.ch === '0').length
  if (intStr === '0' && minInt === 0) intStr = ''
  if (intStr.length < minInt) intStr = '0'.repeat(minInt - intStr.length) + intStr

  const literalsInsideInt = intTokens.some((t) => t.kind === 'lit')
  let intOut: string
  if (literalsInsideInt) {
    // 000-0000 のように数字の間にリテラルがあるときは、右から桁を詰める
    const digits = intStr.split('')
    const parts: string[] = []
    const placeholders = intDigits.length
    let used = 0
    for (let i = intTokens.length - 1; i >= 0; i--) {
      const t = intTokens[i]
      if (t.kind === 'lit') parts.unshift(t.text)
      else if (t.kind === 'digit') {
        used++
        if (used === placeholders) parts.unshift(digits.join(''))
        else parts.unshift(digits.pop() ?? (t.ch === '?' ? ' ' : ''))
      }
    }
    intOut = parts.join('')
  } else {
    intOut = grouping ? groupThousands(intStr) : intStr
  }

  let body = intOut
  if (pointIndex >= 0) body += '.' + fracOut
  if (expIndex >= 0) {
    const expTok = tokens[expIndex] as Extract<Token, { kind: 'exp' }>
    const expDigits = tokens.slice(expIndex + 1).filter((t) => t.kind === 'digit').length
    const sign = exponent < 0 ? '-' : expTok.sign === '+' ? '+' : ''
    body += 'E' + sign + pad(Math.abs(exponent), Math.max(1, expDigits))
  }

  const prefix = tokens
    .slice(0, firstDigit)
    .map((t) => (t.kind === 'lit' ? t.text : t.kind === 'percent' ? '%' : ''))
    .join('')
  const suffixStart = lastDigit + 1
  const suffix = tokens
    .slice(suffixStart)
    .map((t) => (t.kind === 'lit' ? t.text : t.kind === 'percent' ? '%' : ''))
    .join('')
  // 小数点の直前に % などがある並び（0%.0 のような変則）は扱わない
  const pctInside = tokens.slice(firstDigit, suffixStart).filter((t) => t.kind === 'percent').length
  const negative = signed && value < 0 && Number(intStr || '0') + Number(fracStr || '0') !== 0
  return (negative ? '-' : '') + prefix + body + '%'.repeat(pctInside) + suffix
}

/** 値に使う区分と、その区分が符号を自分で表すかを決める */
function pickSection(sections: string[], value: number): { section: string; signed: boolean } {
  if (value < 0 && sections.length >= 2) return { section: sections[1], signed: false }
  if (value === 0 && sections.length >= 3) return { section: sections[2], signed: false }
  return { section: sections[0], signed: true }
}

export type FormattedCell = {
  text: string
  /** 書式の [Red] などで指定された文字色 */
  color?: string
}

/** 数値を書式コードで整形する（色つき） */
export function formatNumberWithColor(value: number, code: string | undefined): FormattedCell {
  if (!Number.isFinite(value)) return { text: String(value) }
  if (!code || code === 'General') return { text: formatGeneral(value) }
  if (code === '@') return { text: formatGeneral(value) }

  const { section, signed } = pickSection(splitSections(code), value)
  const tokens = tokenize(section)
  const color = (tokens.find((t) => t.kind === 'color') as { color: string } | undefined)?.color
  if (isDateSection(tokens)) {
    // 日付として表せない負の値は Excel と同じく #### にする
    if (value < 0) return { text: '########' }
    return { text: formatDateTokens(value, tokens), color }
  }
  return { text: formatNumberTokens(value, tokens, signed), color }
}

/** 数値を書式コードに従って文字列化する */
export function formatNumber(value: number, code: string | undefined): string {
  return formatNumberWithColor(value, code).text
}

/** セルの計算結果を表示用の文字列と色にする */
export function formatCell(
  value: string | number | boolean | null | undefined,
  code: string | undefined,
): FormattedCell {
  if (value === null || value === undefined) return { text: '' }
  if (typeof value === 'number') return formatNumberWithColor(value, code)
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' }
  // 文字列は 4 番目の区分（または @ だけの区分）があればそれに当てはめる
  if (code && code !== 'General' && code !== '@') {
    const sections = splitSections(code)
    const textSection = sections.length >= 4 ? sections[3] : undefined
    if (textSection !== undefined) {
      const tokens = tokenize(textSection)
      const color = (tokens.find((t) => t.kind === 'color') as { color: string } | undefined)?.color
      const text = tokens
        .map((t) => (t.kind === 'text' ? value : t.kind === 'lit' ? t.text : ''))
        .join('')
      return { text, color }
    }
  }
  return { text: value }
}

/** セルの計算結果を表示文字列に変換する。 */
export function formatCellValue(
  value: string | number | boolean | null | undefined,
  code: string | undefined,
): string {
  return formatCell(value, code).text
}

/** 表示形式に出ている小数点以下の桁数（General のときは値から） */
function generalDecimals(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0
  const text = formatGeneral(value)
  if (text.includes('E')) return 0
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/**
 * 「小数点以下の表示桁数を増やす／減らす」。
 * 各区分の数字の並びの小数部に 0 を足す（または最後の桁を消す）。
 * 日付・時刻と文字列の形式は変えない。General は値の今の桁数から始める（Excel と同じ）。
 */
export function adjustDecimals(
  code: string | undefined,
  delta: 1 | -1,
  value: number | null = null,
): string | undefined {
  if (!code || code === 'General') {
    const next = Math.max(0, generalDecimals(value) + delta)
    return next === 0 ? '0' : `0.${'0'.repeat(next)}`
  }
  if (code === '@' || isDateFormat(code)) return code

  const sections = splitSections(code).map((section) => {
    const tokens = tokenize(section)
    const digits = tokens.map((t, i) => (t.kind === 'digit' ? i : -1)).filter((i) => i >= 0)
    if (digits.length === 0) return section
    const expIndex = tokens.findIndex((t) => t.kind === 'exp')
    const mantissa = digits.filter((i) => expIndex < 0 || i < expIndex)
    const lastMantissa = mantissa[mantissa.length - 1]
    const pointIndex = tokens.findIndex(
      (t, i) => t.kind === 'point' && (expIndex < 0 || i < expIndex),
    )
    const raws = tokens.map((t) => t.raw)
    if (delta > 0) {
      if (pointIndex < 0) raws[lastMantissa] += '.0'
      else raws[Math.max(pointIndex, lastMantissa)] += '0'
    } else if (pointIndex >= 0) {
      const fraction = mantissa.filter((i) => i > pointIndex)
      if (fraction.length > 0) raws[fraction[fraction.length - 1]] = ''
      if (fraction.length <= 1) raws[pointIndex] = ''
    }
    return raws.join('')
  })
  return sections.join(';')
}
