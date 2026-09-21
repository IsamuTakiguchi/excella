import { describe, expect, it } from 'vitest'
import {
  a1ToAddr,
  a1ToRange,
  addrToA1,
  colToLetter,
  iterRange,
  letterToCol,
  makeRange,
  rangeContains,
  rangeToA1,
} from '../src/shared/a1'

describe('colToLetter / letterToCol', () => {
  it('境界を正しく変換する', () => {
    expect(colToLetter(0)).toBe('A')
    expect(colToLetter(25)).toBe('Z')
    expect(colToLetter(26)).toBe('AA')
    expect(colToLetter(51)).toBe('AZ')
    expect(colToLetter(52)).toBe('BA')
    expect(colToLetter(701)).toBe('ZZ')
    expect(colToLetter(702)).toBe('AAA')
    expect(colToLetter(16383)).toBe('XFD')
  })

  it('往復する', () => {
    for (const col of [0, 1, 25, 26, 27, 51, 701, 702, 16383]) {
      expect(letterToCol(colToLetter(col))).toBe(col)
    }
  })

  it('不正な入力は -1', () => {
    expect(letterToCol('')).toBe(-1)
    expect(letterToCol('A1')).toBe(-1)
    expect(letterToCol('1')).toBe(-1)
  })
})

describe('A1 アドレス', () => {
  it('変換できる', () => {
    expect(addrToA1({ row: 0, col: 0 })).toBe('A1')
    expect(addrToA1({ row: 9, col: 27 })).toBe('AB10')
    expect(a1ToAddr('A1')).toEqual({ row: 0, col: 0 })
    expect(a1ToAddr('$AB$10')).toEqual({ row: 9, col: 27 })
    expect(a1ToAddr(' b2 ')).toEqual({ row: 1, col: 1 })
  })

  it('解釈できない文字列は null', () => {
    expect(a1ToAddr('A0')).toBeNull()
    expect(a1ToAddr('1A')).toBeNull()
    expect(a1ToAddr('AA')).toBeNull()
    expect(a1ToAddr('')).toBeNull()
  })
})

describe('範囲', () => {
  it('正規化される', () => {
    const r = makeRange({ row: 5, col: 3 }, { row: 1, col: 7 })
    expect(r).toEqual({ r0: 1, c0: 3, r1: 5, c1: 7 })
  })

  it('A1 表記と往復する', () => {
    expect(rangeToA1({ r0: 0, c0: 0, r1: 1, c1: 1 })).toBe('A1:B2')
    expect(rangeToA1({ r0: 2, c0: 2, r1: 2, c1: 2 })).toBe('C3')
    expect(a1ToRange('A1:B2')).toEqual({ r0: 0, c0: 0, r1: 1, c1: 1 })
    expect(a1ToRange('B2:A1')).toEqual({ r0: 0, c0: 0, r1: 1, c1: 1 })
    expect(a1ToRange('C3')).toEqual({ r0: 2, c0: 2, r1: 2, c1: 2 })
    expect(a1ToRange('C3:')).toBeNull()
  })

  it('包含判定と列挙', () => {
    const r = { r0: 1, c0: 1, r1: 2, c1: 2 }
    expect(rangeContains(r, { row: 1, col: 2 })).toBe(true)
    expect(rangeContains(r, { row: 0, col: 1 })).toBe(false)
    expect([...iterRange(r)].map(addrToA1)).toEqual(['B2', 'C2', 'B3', 'C3'])
  })
})
