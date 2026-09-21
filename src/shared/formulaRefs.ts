/**
 * 数式の中の A1 参照を扱う純粋関数。
 *
 * 「= を打ってからカーソルキーやマウスでセルを選ぶ」Excel のポイントモードと、
 * 編集中の数式が参照しているセルの色分け表示で使う。
 *
 * 走査の仕方（文字列リテラルと関数名を参照と誤認しない）は
 * `refAdjust.ts` の相対参照の補正と同じ考え方だが、あちらは書き換え、
 * こちらは位置の取り出しと目的が違うのでコードは分けている。
 */

/** この文字の直後なら新しい参照を差し込める（演算子・開き括弧・区切り） */
const OPENERS = new Set(['=', '+', '-', '*', '/', '^', '(', ',', ';', ':', '<', '>', '&'])

/** 1 つの A1 参照（`A1` または `A1:B2`）。end は終端の次の位置 */
export type RefSpan = { start: number; end: number; text: string }

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?![A-Za-z0-9_(])/

/** 数式（先頭が `=`）か */
export function isFormula(text: string): boolean {
  return text.startsWith('=')
}

/**
 * caret の位置に新しいセル参照を差し込めるか。
 *
 * 直前が演算子や開き括弧なら差し込める（`=`、`=A1+`、`=SUM(`、`=SUM(A1,`）。
 * 参照や数値の途中（`=A1` の直後や `=12` の直後）では差し込めない。
 * 数式でない文字列は常に false（呼び出し側で isFormula を忘れても安全なように）。
 */
export function canInsertRef(text: string, caret: number): boolean {
  if (!isFormula(text)) return false
  if (caret < 1 || caret > text.length) return false

  // 直後にトークンの続きがあるなら、そこへ差し込むと壊れる（`=+A1` の + の後など）
  const next = text[caret]
  if (next !== undefined && /[A-Za-z0-9$]/.test(next)) return false

  let i = caret - 1
  while (i >= 0 && text[i] === ' ') i--
  if (i < 0) return false
  return OPENERS.has(text[i])
}

/**
 * 数式に含まれる参照をすべて取り出す。
 * 文字列リテラル `"A1"` の中、関数名（`LOG10(`）、数値の指数部（`1.5E10`）は含まない。
 * 範囲 `A1:B2` は 1 つの参照として返す。
 */
export function parseRefs(formula: string): RefSpan[] {
  const out: RefSpan[] = []
  let i = 0
  const n = formula.length

  while (i < n) {
    const ch = formula[i]

    // 文字列リテラルとクォートされたシート名（"" '' でエスケープ）
    if (ch === '"' || ch === "'") {
      i++
      while (i < n) {
        if (formula[i] === ch) {
          if (formula[i + 1] === ch) i += 2
          else {
            i++
            break
          }
        } else i++
      }
      continue
    }

    // 数値リテラル（1.5E10 の E10 を参照と読まないため先に食う）
    if (ch >= '0' && ch <= '9') {
      while (i < n && /[0-9.]/.test(formula[i])) i++
      if (i < n && /[eE]/.test(formula[i]) && /[0-9+-]/.test(formula[i + 1] ?? '')) {
        i++
        if (/[+-]/.test(formula[i])) i++
        while (i < n && /[0-9]/.test(formula[i])) i++
      }
      continue
    }

    if (/[A-Za-z$]/.test(ch)) {
      const m = REF_RE.exec(formula.slice(i))
      if (m) {
        const start = i
        let end = i + m[0].length
        // 範囲は両端をまとめて 1 つの参照として扱う
        if (formula[end] === ':') {
          const tail = REF_RE.exec(formula.slice(end + 1))
          if (tail) end = end + 1 + tail[0].length
        }
        out.push({ start, end, text: formula.slice(start, end) })
        i = end
        continue
      }
      // 参照でない識別子（関数名・TRUE・シート名など）は読み飛ばす
      const start = i
      while (i < n && /[A-Za-z0-9_.$]/.test(formula[i])) i++
      if (i === start) i++ // 単独の '$' など
      continue
    }

    i++
  }

  return out
}
