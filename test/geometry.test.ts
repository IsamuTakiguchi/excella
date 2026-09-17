import { describe, expect, it } from 'vitest'
import {
  borderHit,
  buildSizes,
  indexAt,
  offsetOf,
  sizeOf,
  totalSize,
  visibleRange,
} from '../src/renderer/grid/geometry'

const sizes = buildSizes(5, { 1: 40, 3: 200 }, 100)
// 各列: [0,100) [100,140) [140,240) [240,440) [440,540)

describe('buildSizes', () => {
  it('累積オフセットを持つ', () => {
    expect(sizes.offsets).toEqual([0, 100, 140, 240, 440, 540])
    expect(totalSize(sizes)).toBe(540)
    expect(sizeOf(sizes, 1)).toBe(40)
    expect(offsetOf(sizes, 3)).toBe(240)
  })
})

describe('indexAt', () => {
  it('座標からインデックスを引ける', () => {
    expect(indexAt(sizes, 0)).toBe(0)
    expect(indexAt(sizes, 99)).toBe(0)
    expect(indexAt(sizes, 100)).toBe(1)
    expect(indexAt(sizes, 139)).toBe(1)
    expect(indexAt(sizes, 140)).toBe(2)
    expect(indexAt(sizes, 439)).toBe(3)
    expect(indexAt(sizes, 440)).toBe(4)
  })

  it('範囲外はクランプする', () => {
    expect(indexAt(sizes, -50)).toBe(0)
    expect(indexAt(sizes, 100000)).toBe(4)
  })
})

describe('visibleRange', () => {
  it('表示域に重なるインデックスを返す', () => {
    expect(visibleRange(sizes, 0, 150)).toEqual({ first: 0, last: 2 })
    expect(visibleRange(sizes, 150, 100)).toEqual({ first: 2, last: 3 })
    expect(visibleRange(sizes, 500, 100)).toEqual({ first: 4, last: 4 })
  })
})

describe('borderHit', () => {
  it('境界付近だけ手前のインデックスを返す', () => {
    expect(borderHit(sizes, 100)).toBe(0)
    expect(borderHit(sizes, 102)).toBe(0)
    expect(borderHit(sizes, 138)).toBe(1)
    expect(borderHit(sizes, 70)).toBeNull()
    expect(borderHit(sizes, 300)).toBeNull()
  })
})
