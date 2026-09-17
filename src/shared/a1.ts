/**
 * A1 形式のアドレス／範囲ユーティリティ。
 * 行・列はすべて 0 始まりの内部表現で扱い、表示のときだけ A1 に変換する。
 */

export type Addr = { row: number; col: number }

/** 正規化済みの矩形範囲（r0 <= r1, c0 <= c1） */
export type Range = { r0: number; c0: number; r1: number; c1: number }

/** 0 → 'A', 25 → 'Z', 26 → 'AA' */
export function colToLetter(col: number): string {
  if (col < 0) throw new RangeError(`列番号が負です: ${col}`)
  let n = col
  let out = ''
  while (true) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
    if (n < 0) break
  }
  return out
}

/** 'A' → 0, 'Z' → 25, 'AA' → 26。不正な文字列は -1 */
export function letterToCol(letters: string): number {
  if (!/^[A-Za-z]+$/.test(letters)) return -1
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

/** {row:0, col:0} → 'A1' */
export function addrToA1(addr: Addr): string {
  return `${colToLetter(addr.col)}${addr.row + 1}`
}

/** 'A1' / '$A$1' → {row:0, col:0}。解釈できなければ null */
export function a1ToAddr(a1: string): Addr | null {
  const m = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(a1.trim())
  if (!m) return null
  const col = letterToCol(m[1])
  const row = Number(m[2]) - 1
  if (col < 0 || row < 0) return null
  return { row, col }
}

/** 'A1:B2' 形式へ。単一セルなら 'A1' */
export function rangeToA1(range: Range): string {
  const tl = addrToA1({ row: range.r0, col: range.c0 })
  if (range.r0 === range.r1 && range.c0 === range.c1) return tl
  return `${tl}:${addrToA1({ row: range.r1, col: range.c1 })}`
}

/** 'A1:B2' / 'A1' を解釈。解釈できなければ null */
export function a1ToRange(text: string): Range | null {
  const parts = text.trim().split(':')
  if (parts.length === 1) {
    const a = a1ToAddr(parts[0])
    return a ? { r0: a.row, c0: a.col, r1: a.row, c1: a.col } : null
  }
  if (parts.length !== 2) return null
  const a = a1ToAddr(parts[0])
  const b = a1ToAddr(parts[1])
  if (!a || !b) return null
  return normalizeRange({ r0: a.row, c0: a.col, r1: b.row, c1: b.col })
}

/** アンカーとフォーカスから正規化された範囲を作る */
export function makeRange(anchor: Addr, focus: Addr): Range {
  return normalizeRange({ r0: anchor.row, c0: anchor.col, r1: focus.row, c1: focus.col })
}

export function normalizeRange(r: Range): Range {
  return {
    r0: Math.min(r.r0, r.r1),
    c0: Math.min(r.c0, r.c1),
    r1: Math.max(r.r0, r.r1),
    c1: Math.max(r.c0, r.c1),
  }
}

export function rangeRows(r: Range): number {
  return r.r1 - r.r0 + 1
}

export function rangeCols(r: Range): number {
  return r.c1 - r.c0 + 1
}

export function rangeContains(r: Range, addr: Addr): boolean {
  return addr.row >= r.r0 && addr.row <= r.r1 && addr.col >= r.c0 && addr.col <= r.c1
}

/** 範囲内の全アドレスを行優先で列挙 */
export function* iterRange(r: Range): Generator<Addr> {
  for (let row = r.r0; row <= r.r1; row++) {
    for (let col = r.c0; col <= r.c1; col++) {
      yield { row, col }
    }
  }
}

export function singleRange(addr: Addr): Range {
  return { r0: addr.row, c0: addr.col, r1: addr.row, c1: addr.col }
}
