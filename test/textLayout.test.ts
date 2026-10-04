import { describe, expect, it } from 'vitest'
import { overflowCols, rowHeightFor, wrapText } from '../src/renderer/grid/textLayout'

// 1 文字 = 10px として測る
const measure = (s: string) => [...s].length * 10

describe('wrapText', () => {
  it('幅に収まるものはそのまま', () => {
    expect(wrapText('abc', 100, measure)).toEqual(['abc'])
  })

  it('英単語は語の切れ目で折り返す', () => {
    expect(wrapText('hello big world', 90, measure)).toEqual(['hello big', 'world'])
  })

  it('日本語は 1 文字ずつ折り返す', () => {
    expect(wrapText('あいうえおかき', 30, measure)).toEqual(['あいう', 'えおか', 'き'])
  })

  it('句読点は行頭に来ないよう前の行にぶら下げる', () => {
    expect(wrapText('あいう。えお', 30, measure)).toEqual(['あいう。', 'えお'])
  })

  it('改行は段落の区切りになる（空行も残す）', () => {
    expect(wrapText('a\n\nb', 100, measure)).toEqual(['a', '', 'b'])
  })

  it('幅を超える長い語は文字で切る', () => {
    expect(wrapText('abcdefgh', 30, measure)).toEqual(['abc', 'def', 'gh'])
  })
})

describe('overflowCols', () => {
  const base = {
    col: 2,
    colCount: 10,
    widthOf: () => 50,
    isFree: () => true,
  }

  it('左揃えは右の空セルへはみ出す', () => {
    expect(overflowCols({ ...base, align: 'left', excess: 70 })).toEqual({ left: 0, right: 2 })
  })

  it('右揃えは左へ', () => {
    expect(overflowCols({ ...base, align: 'right', excess: 30 })).toEqual({ left: 1, right: 0 })
  })

  it('中央揃えは両側へ半分ずつ', () => {
    expect(overflowCols({ ...base, align: 'center', excess: 80 })).toEqual({ left: 1, right: 1 })
  })

  it('隣が空でなければ止まる', () => {
    const isFree = (c: number) => c !== 4
    expect(overflowCols({ ...base, align: 'left', excess: 500, isFree })).toEqual({
      left: 0,
      right: 1,
    })
  })

  it('シートの端で止まる', () => {
    expect(overflowCols({ ...base, col: 0, align: 'right', excess: 100 })).toEqual({
      left: 0,
      right: 0,
    })
  })

  it('収まっていれば広げない', () => {
    expect(overflowCols({ ...base, align: 'left', excess: 0 })).toEqual({ left: 0, right: 0 })
  })
})

describe('rowHeightFor', () => {
  it('行数に比例して高くなる', () => {
    expect(rowHeightFor(2, 13)).toBeGreaterThan(rowHeightFor(1, 13))
    expect(rowHeightFor(1, 13)).toBeLessThanOrEqual(24)
  })
})
