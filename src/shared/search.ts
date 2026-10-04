/**
 * 検索と置換（Ctrl+F / Ctrl+H）の文字列処理。セルの走査順もここで決める。
 */
import type { Addr } from './a1'

export type SearchOptions = {
  /** 大文字と小文字を区別する */
  matchCase: boolean
  /** セル内容が完全に同一であるものを検索する */
  wholeCell: boolean
}

function normalize(text: string, options: SearchOptions): string {
  return options.matchCase ? text : text.toLowerCase()
}

export function matchesText(text: string, query: string, options: SearchOptions): boolean {
  if (query === '') return false
  const a = normalize(text, options)
  const b = normalize(query, options)
  return options.wholeCell ? a === b : a.includes(b)
}

/** 見つかった箇所をすべて置き換える。完全一致の指定ならセル全体を置き換える */
export function replaceText(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions,
): string {
  if (!matchesText(text, query, options)) return text
  if (options.wholeCell) return replacement
  if (options.matchCase) return text.split(query).join(replacement)
  // 大文字小文字を区別しないときは、元の文字列の位置を保ったまま置き換える
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  let out = ''
  let i = 0
  while (i < text.length) {
    const at = lower.indexOf(needle, i)
    if (at < 0) break
    out += text.slice(i, at) + replacement
    i = at + needle.length
  }
  return out + text.slice(i)
}

/**
 * 検索の順番に並べる（Excel の既定と同じく行ごと）。
 * from の次のセルから始めて末尾まで行ったら先頭へ戻る。backwards なら逆順。
 */
export function searchOrder(cells: Addr[], from: Addr, backwards = false): Addr[] {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col)
  const after = (a: Addr) => a.row > from.row || (a.row === from.row && a.col > from.col)
  const before = (a: Addr) => a.row < from.row || (a.row === from.row && a.col < from.col)
  if (!backwards) {
    const head = sorted.filter(after)
    const tail = sorted.filter((a) => !after(a))
    return [...head, ...tail]
  }
  const rev = sorted.reverse()
  const head = rev.filter(before)
  const tail = rev.filter((a) => !before(a))
  return [...head, ...tail]
}
