import { describe, expect, it } from 'vitest'
import { autoSumTargets, detectAutoSumRange, uniqueRowIndices } from '../src/shared/dataTools'
import { formatNumber, timeSerial, todaySerial } from '../src/shared/numberFormat'

/** 数値が入っているセルを 'r,c' の集合で表す */
const grid = (cells: Array<[number, number]>) => {
  const set = new Set(cells.map(([r, c]) => `${r},${c}`))
  return (r: number, c: number) => set.has(`${r},${c}`)
}

describe('オート SUM の範囲', () => {
  it('上に続く数値をまとめて拾う（見出しの文字は含めない）', () => {
    // A2:A4 が数値、A1 は見出し。A5 で押す
    const isNumber = grid([
      [1, 0],
      [2, 0],
      [3, 0],
    ])
    expect(detectAutoSumRange({ row: 4, col: 0 }, isNumber)).toEqual({ r0: 1, c0: 0, r1: 3, c1: 0 })
  })

  it('上に無ければ左を拾う', () => {
    const isNumber = grid([
      [0, 1],
      [0, 2],
    ])
    expect(detectAutoSumRange({ row: 0, col: 3 }, isNumber)).toEqual({ r0: 0, c0: 1, r1: 0, c1: 2 })
  })

  it('どちらにも無ければ null', () => {
    expect(detectAutoSumRange({ row: 5, col: 5 }, grid([]))).toBeNull()
    expect(detectAutoSumRange({ row: 0, col: 0 }, grid([]))).toBeNull()
  })

  it('範囲を選んだときは各列の下へ、1 行なら右隣へ入れる', () => {
    expect(autoSumTargets({ r0: 1, c0: 1, r1: 3, c1: 2 })).toEqual([
      { target: { row: 4, col: 1 }, source: { r0: 1, c0: 1, r1: 3, c1: 1 } },
      { target: { row: 4, col: 2 }, source: { r0: 1, c0: 2, r1: 3, c1: 2 } },
    ])
    expect(autoSumTargets({ r0: 0, c0: 0, r1: 0, c1: 2 })).toEqual([
      { target: { row: 0, col: 3 }, source: { r0: 0, c0: 0, r1: 0, c1: 2 } },
    ])
    expect(autoSumTargets({ r0: 0, c0: 0, r1: 0, c1: 0 })).toEqual([])
  })
})

describe('重複の削除', () => {
  it('最初の行を残し、同じ内容の行を除く', () => {
    expect(uniqueRowIndices(['a', 'b', 'a', 'c', 'b'])).toEqual([0, 1, 3])
  })

  it('重複が無ければすべて残す', () => {
    expect(uniqueRowIndices(['a', 'b'])).toEqual([0, 1])
  })
})

describe('今日の日付・現在の時刻', () => {
  it('端末の地域の年月日になる（UTC との時差で前日にならない）', () => {
    // 現地の 1 月 2 日 0:30
    const now = new Date(2024, 0, 2, 0, 30)
    expect(formatNumber(todaySerial(now), 'yyyy/mm/dd')).toBe('2024/01/02')
  })

  it('現在の時刻は 1 日の端数になる', () => {
    const now = new Date(2024, 0, 2, 13, 5, 30)
    expect(formatNumber(timeSerial(now), 'h:mm:ss')).toBe('13:05:30')
  })
})
