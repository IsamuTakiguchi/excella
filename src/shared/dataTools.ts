/**
 * リボンの「数式」「データ」タブのコマンドが使う純粋関数。
 * セルの中身は呼び出し側から関数で受け取り、ここではモデルにもエンジンにも触らない。
 */
import type { Addr, Range } from './a1'

/** オート SUM のボタンで入れられる関数 */
export type AutoFunction = 'SUM' | 'AVERAGE' | 'COUNT' | 'MAX' | 'MIN'

export const AUTO_FUNCTIONS: Array<{ fn: AutoFunction; label: string }> = [
  { fn: 'SUM', label: '合計' },
  { fn: 'AVERAGE', label: '平均' },
  { fn: 'COUNT', label: '数値の個数' },
  { fn: 'MAX', label: '最大値' },
  { fn: 'MIN', label: '最小値' },
]

/**
 * Excel のオート SUM と同じく、アクティブセルのすぐ上に続く数値の範囲を探す。
 * 上に数値が無ければ左を探す。どちらにも無ければ null（Excel は空のカッコを入れる）。
 */
export function detectAutoSumRange(
  addr: Addr,
  isNumber: (row: number, col: number) => boolean,
): Range | null {
  if (addr.row > 0 && isNumber(addr.row - 1, addr.col)) {
    let top = addr.row - 1
    while (top > 0 && isNumber(top - 1, addr.col)) top--
    return { r0: top, c0: addr.col, r1: addr.row - 1, c1: addr.col }
  }
  if (addr.col > 0 && isNumber(addr.row, addr.col - 1)) {
    let left = addr.col - 1
    while (left > 0 && isNumber(addr.row, left - 1)) left--
    return { r0: addr.row, c0: left, r1: addr.row, c1: addr.col - 1 }
  }
  return null
}

/**
 * 範囲を選んでからオート SUM を押したときの書き込み先。
 * 縦に複数行あれば各列の 1 つ下へ、1 行だけなら右隣へ（Excel と同じ）。
 */
export function autoSumTargets(range: Range): Array<{ target: Addr; source: Range }> {
  const out: Array<{ target: Addr; source: Range }> = []
  if (range.r1 > range.r0) {
    for (let c = range.c0; c <= range.c1; c++) {
      out.push({
        target: { row: range.r1 + 1, col: c },
        source: { r0: range.r0, c0: c, r1: range.r1, c1: c },
      })
    }
  } else if (range.c1 > range.c0) {
    out.push({
      target: { row: range.r0, col: range.c1 + 1 },
      source: { r0: range.r0, c0: range.c0, r1: range.r0, c1: range.c1 },
    })
  }
  return out
}

/**
 * 重複の削除で残す行。最初に出てきた行を残し、同じ内容の 2 行目以降を除く。
 * keys は行ごとの比較用の文字列（全列をつないだもの）。戻り値は keys の位置。
 */
export function uniqueRowIndices(keys: string[]): number[] {
  const seen = new Set<string>()
  const keep: number[] = []
  keys.forEach((key, index) => {
    if (seen.has(key)) return
    seen.add(key)
    keep.push(index)
  })
  return keep
}
