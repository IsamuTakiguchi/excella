/**
 * グリッドの座標計算。すべて純粋関数なのでテストできる。
 * 行高・列幅は疎な Record で持ち、未指定は既定値を使う。
 */

/** 行番号ヘッダの幅 / 列名ヘッダの高さ（px） */
export const HEADER_W = 46
export const HEADER_H = 24

export type Sizes = {
  /** 累積オフセット。offsets[i] は i 番目の先頭位置、最後に全体長が入る */
  offsets: number[]
}

export function buildSizes(count: number, custom: Record<number, number>, fallback: number): Sizes {
  const offsets = new Array<number>(count + 1)
  offsets[0] = 0
  for (let i = 0; i < count; i++) {
    offsets[i + 1] = offsets[i] + (custom[i] ?? fallback)
  }
  return { offsets }
}

export function sizeOf(sizes: Sizes, index: number): number {
  return sizes.offsets[index + 1] - sizes.offsets[index]
}

export function offsetOf(sizes: Sizes, index: number): number {
  return sizes.offsets[Math.max(0, Math.min(index, sizes.offsets.length - 1))]
}

export function totalSize(sizes: Sizes): number {
  return sizes.offsets[sizes.offsets.length - 1]
}

/** 座標からインデックスを引く（境界は右/下の側に属する） */
export function indexAt(sizes: Sizes, position: number): number {
  const last = sizes.offsets.length - 2
  if (position < 0) return 0
  if (position >= sizes.offsets[last + 1]) return last
  let lo = 0
  let hi = last
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (sizes.offsets[mid] <= position) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** scroll..scroll+viewport に重なるインデックス範囲 [first, last] */
export function visibleRange(
  sizes: Sizes,
  scroll: number,
  viewport: number,
): { first: number; last: number } {
  const first = indexAt(sizes, scroll)
  const last = indexAt(sizes, scroll + Math.max(0, viewport - 1))
  return { first, last }
}

/** ヘッダ境界のドラッグ判定。境界から ±tolerance px 以内なら、その手前のインデックスを返す */
export function borderHit(sizes: Sizes, position: number, tolerance = 4): number | null {
  const count = sizes.offsets.length - 1
  const approx = indexAt(sizes, position)
  for (const candidate of [approx - 1, approx, approx + 1]) {
    if (candidate < 0 || candidate >= count) continue
    if (Math.abs(sizes.offsets[candidate + 1] - position) <= tolerance) return candidate
  }
  return null
}

/** 自動調整のときに内容の両側へ足す余白（px） */
export const AUTOFIT_PADDING = 12

/**
 * 列の内容に合わせた幅を求める。
 * 計測は呼び出し側が渡す measure（Canvas の measureText など）に任せ、
 * この関数自体は純粋に保つ。
 */
export function autofitWidth(
  rowCount: number,
  measure: (row: number) => number,
  options: { min?: number; max?: number } = {},
): number {
  const min = options.min ?? 40
  const max = options.max ?? 400
  let widest = 0
  for (let row = 0; row < rowCount; row++) {
    const w = measure(row)
    if (w > widest) widest = w
  }
  return Math.max(min, Math.min(max, Math.ceil(widest + AUTOFIT_PADDING)))
}
