/**
 * セルの文字の配置計算（折り返し・はみ出し）。
 * 文字幅の計測は呼び出し側から関数で受け取り、ここは純粋に保つ（テスト対象）。
 */

/** 行頭に来てはいけない文字（簡易な禁則）。前の行の末尾にぶら下げる */
const NO_LINE_START = new Set(
  '、。，．,.）)」』】〕〉》！？!?％%ー〜…・：；:;ぁぃぅぇぉっゃゅょァィゥェォッャュョ',
)

/** 折り返しの単位に分ける。英数字の連続は 1 語、空白は直前の語に付け、それ以外は 1 文字ずつ */
function units(paragraph: string): string[] {
  const out: string[] = []
  const re = /[A-Za-z0-9_\-'.,]+\s*|\s+|./gsu
  for (const match of paragraph.matchAll(re)) out.push(match[0])
  return out
}

/**
 * 幅 maxWidth に収まるように折り返す。改行（Alt+Enter）はそのまま段落の区切りになる。
 * 1 語だけで幅を超える場合は、その語を文字単位で切る。
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (const unit of units(paragraph)) {
      const overflows = line !== '' && measure((line + unit).trimEnd()) > maxWidth
      if (overflows && !NO_LINE_START.has(unit[0])) {
        lines.push(line.trimEnd())
        line = ''
        if (unit.trim() === '') continue // 行頭の空白は捨てる
      }
      if (line === '' && measure(unit.trimEnd()) > maxWidth && [...unit].length > 1) {
        // 1 語だけで幅を超えるときは文字ごとに切る
        for (const ch of unit) {
          if (line !== '' && measure(line + ch) > maxWidth) {
            lines.push(line)
            line = ''
          }
          line += ch
        }
        continue
      }
      line += unit
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/**
 * 折り返さない文字が幅を超えたとき、隣のどのセルまではみ出してよいか。
 * Excel と同じく、隣が空のセルである間だけ広げる。左揃えは右へ、右揃えは左へ、中央は両側へ。
 * 戻り値は左右それぞれ何列ぶん広げるか。
 */
export function overflowCols(params: {
  col: number
  colCount: number
  align: 'left' | 'center' | 'right'
  /** セルの内側の幅を超えている量（px） */
  excess: number
  widthOf: (col: number) => number
  isFree: (col: number) => boolean
  /** 見る列数の上限（極端に長い文字で全列を走査しないため） */
  limit?: number
}): { left: number; right: number } {
  const limit = params.limit ?? 50
  let left = 0
  let right = 0
  if (params.excess <= 0) return { left, right }

  const extend = (direction: 1 | -1, need: number): number => {
    let count = 0
    let remaining = need
    let c = params.col + direction
    while (remaining > 0 && count < limit && c >= 0 && c < params.colCount && params.isFree(c)) {
      remaining -= params.widthOf(c)
      count++
      c += direction
    }
    return count
  }

  if (params.align === 'left') right = extend(1, params.excess)
  else if (params.align === 'right') left = extend(-1, params.excess)
  else {
    // 中央揃えは両側に半分ずつ。片側が塞がっていたら、はみ出さない（Excel と同じ）
    const half = params.excess / 2
    left = extend(-1, half)
    right = extend(1, half)
  }
  return { left, right }
}

/** 1 行の高さ（px）。フォントの px に対する比率 */
export const LINE_HEIGHT_RATIO = 1.3

/** 文字が何行あるときに必要な行の高さ（px、倍率 1）。上下に少し余白を取る */
export function rowHeightFor(lines: number, fontPx: number): number {
  return Math.ceil(lines * fontPx * LINE_HEIGHT_RATIO + 4)
}
