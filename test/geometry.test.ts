import { describe, expect, it } from 'vitest'
import {
  autofitWidth,
  AUTOFIT_PADDING,
  borderHit,
  buildSizes,
  clampZoom,
  HEADER_H,
  HEADER_W,
  headerSize,
  indexAt,
  MAX_ZOOM,
  MIN_ZOOM,
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

describe('autofitWidth', () => {
  it('最も広い内容に余白を足した幅を返す', () => {
    const widths = [30, 120, 60]
    expect(autofitWidth(3, (row) => widths[row])).toBe(120 + AUTOFIT_PADDING)
  })

  it('下限と上限で丸める', () => {
    expect(autofitWidth(1, () => 5)).toBe(40)
    expect(autofitWidth(1, () => 9999)).toBe(400)
    expect(autofitWidth(1, () => 5, { min: 10 })).toBe(17)
  })

  it('空の列でも下限を返す', () => {
    expect(autofitWidth(0, () => 0)).toBe(40)
  })
})

describe('表示倍率', () => {
  it('倍率をかけた行高・列幅になる', () => {
    const sizes = buildSizes(3, { 1: 40 }, 20, 1.5)
    expect(sizeOf(sizes, 0)).toBe(30)
    expect(sizeOf(sizes, 1)).toBe(60)
    expect(totalSize(sizes)).toBe(120)
  })

  it('倍率を省くと素の値のまま（既定の見え方を変えない）', () => {
    const sizes = buildSizes(2, {}, 22)
    expect(sizeOf(sizes, 0)).toBe(22)
    expect(totalSize(sizes)).toBe(44)
  })

  it('縮めすぎても 1px は残る（0 幅の行ができて座標計算が壊れないように）', () => {
    const sizes = buildSizes(2, { 0: 1 }, 1, 0.1)
    expect(sizeOf(sizes, 0)).toBe(1)
  })

  it('ヘッダも倍率ぶん大きくなる', () => {
    expect(headerSize(1)).toEqual({ w: HEADER_W, h: HEADER_H })
    expect(headerSize(2)).toEqual({ w: HEADER_W * 2, h: HEADER_H * 2 })
  })

  it('倍率は上下限に丸める', () => {
    expect(clampZoom(1.25)).toBe(1.25)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
    // 0.1 刻みで足したときの誤差を残さない
    expect(clampZoom(1.3000000000000003)).toBe(1.3)
  })
})
