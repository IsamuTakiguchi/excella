import { describe, expect, it } from 'vitest'
import { fillSeries } from '../src/shared/fill'
import type { CellData } from '../src/shared/model'

const down = (i: number) => i + 1

describe('fillSeries', () => {
  it('等差の数値は続きを作る', () => {
    const src: Array<CellData | null> = [{ v: 1 }, { v: 3 }]
    expect(fillSeries(src, 3, 'row', down)).toEqual([{ v: 5 }, { v: 7 }, { v: 9 }])
  })

  it('連続した整数も続く', () => {
    const src: Array<CellData | null> = [{ v: 1 }, { v: 2 }, { v: 3 }]
    expect(fillSeries(src, 2, 'row', down)).toEqual([{ v: 4 }, { v: 5 }])
  })

  it('数値が 1 つだけならコピーする（Excel の既定）', () => {
    const src: Array<CellData | null> = [{ v: 5 }]
    expect(fillSeries(src, 3, 'row', down)).toEqual([{ v: 5 }, { v: 5 }, { v: 5 }])
  })

  it('等差でない数値は繰り返す', () => {
    const src: Array<CellData | null> = [{ v: 1 }, { v: 5 }, { v: 2 }]
    expect(fillSeries(src, 3, 'row', down)).toEqual([{ v: 1 }, { v: 5 }, { v: 2 }])
  })

  it('末尾が数字の文字列は増える', () => {
    const src: Array<CellData | null> = [{ v: '項目 1' }]
    expect(fillSeries(src, 3, 'row', down)).toEqual([
      { v: '項目 2' },
      { v: '項目 3' },
      { v: '項目 4' },
    ])
  })

  it('途中に数字がある文字列も、いちばん右の数字が増える', () => {
    const src: Array<CellData | null> = [{ v: '第 1 週' }]
    expect(fillSeries(src, 2, 'row', down)).toEqual([{ v: '第 2 週' }, { v: '第 3 週' }])
  })

  it('ゼロ埋めの桁数を保つ', () => {
    const src: Array<CellData | null> = [{ v: 'No.008' }]
    expect(fillSeries(src, 2, 'row', down)).toEqual([{ v: 'No.009' }, { v: 'No.010' }])
  })

  it('ただの文字列は繰り返す', () => {
    const src: Array<CellData | null> = [{ v: 'りんご' }, { v: 'みかん' }]
    expect(fillSeries(src, 3, 'row', down)).toEqual([
      { v: 'りんご' },
      { v: 'みかん' },
      { v: 'りんご' },
    ])
  })

  it('数式は相対参照をずらしてコピーする', () => {
    const src: Array<CellData | null> = [{ f: '=A1*2' }]
    expect(fillSeries(src, 2, 'row', down)).toEqual([{ f: '=A2*2' }, { f: '=A3*2' }])
    expect(fillSeries(src, 2, 'col', down)).toEqual([{ f: '=B1*2' }, { f: '=C1*2' }])
  })

  it('空セルは空のまま', () => {
    expect(fillSeries([null], 2, 'row', down)).toEqual([null, null])
  })

  it('元データが空なら何も返さない', () => {
    expect(fillSeries([], 3, 'row', down)).toEqual([])
  })
})
