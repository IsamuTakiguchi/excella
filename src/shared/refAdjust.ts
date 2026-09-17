/**
 * 貼り付け時の相対参照補正。
 *
 * 数式テキストを走査して A1 参照だけを検出し、$ が付いていない行・列に
 * オフセットを加算する。文字列リテラル `"A1"` の中と、関数名（`LOG10(` など）は
 * 書き換えない。範囲 `A1:B2` は両端がそれぞれ独立した参照として補正される。
 */

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})(?![A-Za-z0-9_(])/

/** 参照が指せる上限（Excel 互換の 16384 列 × 1048576 行） */
const MAX_COL = 16383
const MAX_ROW = 1048575

function letterToColIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function colIndexToLetter(col: number): string {
  let n = col
  let out = ''
  while (true) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
    if (n < 0) break
  }
  return out
}

/**
 * 数式（先頭の '=' を含む）の相対参照を dRow 行・dCol 列ずらす。
 * 範囲外に出る参照は #REF! に置き換える（Excel と同じ挙動）。
 */
export function adjustFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula

  let out = ''
  let i = 0
  const n = formula.length

  while (i < n) {
    const ch = formula[i]

    // 文字列リテラル: "" でエスケープ
    if (ch === '"') {
      const start = i
      i++
      while (i < n) {
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') i += 2
          else {
            i++
            break
          }
        } else i++
      }
      out += formula.slice(start, i)
      continue
    }

    // シート名のクォート: 'My Sheet'!A1
    if (ch === "'") {
      const start = i
      i++
      while (i < n) {
        if (formula[i] === "'") {
          if (formula[i + 1] === "'") i += 2
          else {
            i++
            break
          }
        } else i++
      }
      out += formula.slice(start, i)
      continue
    }

    // 数値リテラル（1.5E10 の E10 を参照と誤認しないため先に食う）
    if (ch >= '0' && ch <= '9') {
      const start = i
      while (i < n && /[0-9.]/.test(formula[i])) i++
      if (i < n && /[eE]/.test(formula[i]) && /[0-9+-]/.test(formula[i + 1] ?? '')) {
        i++
        if (/[+-]/.test(formula[i])) i++
        while (i < n && /[0-9]/.test(formula[i])) i++
      }
      out += formula.slice(start, i)
      continue
    }

    if (/[A-Za-z$]/.test(ch)) {
      const m = REF_RE.exec(formula.slice(i))
      if (m) {
        const [whole, colAbs, letters, rowAbs, digits] = m
        let col = letterToColIndex(letters)
        let row = Number(digits) - 1
        if (!colAbs) col += dCol
        if (!rowAbs) row += dRow
        if (col < 0 || row < 0 || col > MAX_COL || row > MAX_ROW) {
          out += '#REF!'
        } else {
          out += `${colAbs}${colIndexToLetter(col)}${rowAbs}${row + 1}`
        }
        i += whole.length
        continue
      }
      // 参照でない識別子（関数名・シート名・TRUE など）はまとめて読み飛ばす
      const start = i
      while (i < n && /[A-Za-z0-9_.$]/.test(formula[i])) i++
      if (i === start) i++ // 単独の '$' など
      out += formula.slice(start, i)
      continue
    }

    out += ch
    i++
  }

  return out
}
