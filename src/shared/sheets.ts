/**
 * シート見出しまわりの純粋関数（シート名の規則・コピー名・表示中のシートの探し方）。
 * ストアからも xlsx の読み込みからも使うので shared に置く。
 */

/** Excel と同じ、シート名に使えない文字 */
const INVALID_CHARS = /[:\\/?*[\]]/

/** Excel のシート名の上限（これを超える名前は Excel で開けない） */
export const MAX_SHEET_NAME = 31

/**
 * シート名が Excel の規則に合うかを調べる。合わなければ理由を返す（合えば null）。
 * 重複の確認は呼び出し側で行う（ブック全体を見ないと分からないため）。
 */
export function sheetNameError(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'シート名を入力してください'
  if (trimmed.length > MAX_SHEET_NAME) return `シート名は ${MAX_SHEET_NAME} 文字以内にしてください`
  if (INVALID_CHARS.test(trimmed)) return 'シート名に : \\ / ? * [ ] は使えません'
  if (trimmed.startsWith("'") || trimmed.endsWith("'")) {
    return "シート名の先頭と末尾に ' は使えません"
  }
  return null
}

/**
 * コピーしたシートの名前。Excel と同じく「Sheet1 (2)」「Sheet1 (3)」…と付ける。
 * コピーのコピーは「Sheet1 (2) (2)」ではなく元の名前に番号を振り直す。
 */
export function copySheetName(taken: Iterable<string>, name: string): string {
  const used = new Set(taken)
  const base = name.replace(/ \(\d+\)$/, '')
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`
    // 31 文字に収まるよう、元の名前の方を詰める
    const candidate = base.slice(0, MAX_SHEET_NAME - suffix.length) + suffix
    if (!used.has(candidate)) return candidate
  }
}

/**
 * index の位置のシートが消えたり隠れたりしたときに、代わりに表示するシートの位置。
 * Excel と同じく左隣を優先し、無ければ右隣を探す。見つからなければ -1。
 */
export function nearestVisibleIndex(hidden: boolean[], index: number, exclude = index): number {
  for (let i = Math.min(index, hidden.length) - 1; i >= 0; i--) {
    if (i !== exclude && !hidden[i]) return i
  }
  for (let i = index; i < hidden.length; i++) {
    if (i !== exclude && !hidden[i]) return i
  }
  return -1
}

/**
 * 「before の位置の前に入れる」を、移動後の配列での位置に直す。
 * before は 0〜length（length なら末尾）。自分より後ろへ動かすときは 1 つずれる。
 */
export function moveTargetIndex(from: number, before: number, length: number): number {
  const clamped = Math.max(0, Math.min(before, length))
  return clamped > from ? clamped - 1 : clamped
}
