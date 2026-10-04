import { describe, expect, it } from 'vitest'
import { matchesText, replaceText, searchOrder } from '../src/shared/search'

const loose = { matchCase: false, wholeCell: false }

describe('matchesText', () => {
  it('部分一致・大文字小文字・完全一致', () => {
    expect(matchesText('Apple pie', 'apple', loose)).toBe(true)
    expect(matchesText('Apple pie', 'apple', { ...loose, matchCase: true })).toBe(false)
    expect(matchesText('Apple pie', 'apple pie', { ...loose, wholeCell: true })).toBe(true)
    expect(matchesText('Apple pie', 'apple', { ...loose, wholeCell: true })).toBe(false)
    expect(matchesText('abc', '', loose)).toBe(false)
  })
})

describe('replaceText', () => {
  it('すべての箇所を置き換える', () => {
    expect(replaceText('a-b-a', 'a', 'x', loose)).toBe('x-b-x')
    expect(replaceText('Aa', 'a', 'x', loose)).toBe('xx')
    expect(replaceText('Aa', 'a', 'x', { ...loose, matchCase: true })).toBe('Ax')
    expect(replaceText('abc', 'abc', 'z', { ...loose, wholeCell: true })).toBe('z')
    expect(replaceText('abcd', 'abc', 'z', { ...loose, wholeCell: true })).toBe('abcd')
  })
})

describe('searchOrder', () => {
  const cells = [
    { row: 2, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 0 },
    { row: 1, col: 3 },
  ]
  it('行ごとに、今のセルの次から巡回する', () => {
    expect(searchOrder(cells, { row: 0, col: 1 })).toEqual([
      { row: 1, col: 3 },
      { row: 2, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
  })
  it('逆順', () => {
    expect(searchOrder(cells, { row: 1, col: 3 }, true)).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 0 },
      { row: 2, col: 0 },
      { row: 1, col: 3 },
    ])
  })
})
