import { describe, expect, it } from 'vitest'
import { applyPreset, positionIn, sidesForPreset } from '../src/shared/borders'
import type { CellBorders } from '../src/shared/model'

const range = { r0: 1, c0: 1, r1: 3, c1: 3 }
const thin = { weight: 'thin' as const }

describe('positionIn', () => {
  it('範囲内での位置を判定する', () => {
    expect(positionIn(range, 1, 1)).toEqual({
      isTop: true,
      isBottom: false,
      isLeft: true,
      isRight: false,
    })
    expect(positionIn(range, 2, 2)).toEqual({
      isTop: false,
      isBottom: false,
      isLeft: false,
      isRight: false,
    })
    expect(positionIn(range, 3, 3)).toEqual({
      isTop: false,
      isBottom: true,
      isLeft: false,
      isRight: true,
    })
  })
})

describe('sidesForPreset', () => {
  it('外枠は範囲の縁だけ引く', () => {
    const corner = sidesForPreset('outer', positionIn(range, 1, 1))
    expect(corner.top).toBeDefined()
    expect(corner.left).toBeDefined()
    expect(corner.bottom).toBeUndefined()
    expect(corner.right).toBeUndefined()

    const middle = sidesForPreset('outer', positionIn(range, 2, 2))
    expect(Object.values(middle).every((v) => v === undefined)).toBe(true)
  })

  it('内側は縁を避ける', () => {
    const corner = sidesForPreset('inner', positionIn(range, 1, 1))
    expect(corner.top).toBeUndefined()
    expect(corner.bottom).toBeDefined()
    expect(corner.right).toBeDefined()
  })

  it('格子は四辺すべて', () => {
    const middle = sidesForPreset('all', positionIn(range, 2, 2))
    expect(Object.values(middle).every((v) => v !== undefined && v !== null)).toBe(true)
  })

  it('罫線なしは四辺すべて消す', () => {
    const all = sidesForPreset('none', positionIn(range, 2, 2))
    expect(Object.values(all).every((v) => v === null)).toBe(true)
  })
})

describe('applyPreset', () => {
  it('既存の罫線に重ねる', () => {
    const current: CellBorders = { top: { weight: 'thick' } }
    const next = applyPreset(current, 'bottom', positionIn(range, 3, 2), thin)
    expect(next.top).toEqual({ weight: 'thick' }) // 触っていない辺は残る
    expect(next.bottom).toEqual(thin)
  })

  it('罫線なしで全部消える', () => {
    const current: CellBorders = { top: thin, bottom: thin, left: thin, right: thin }
    expect(applyPreset(current, 'none', positionIn(range, 2, 2), thin)).toEqual({})
  })

  it('引数を書き換えない', () => {
    const current: CellBorders = { top: thin }
    const copy = structuredClone(current)
    applyPreset(current, 'all', positionIn(range, 2, 2), { weight: 'thick' })
    expect(current).toEqual(copy)
  })

  it('太さと色を反映する', () => {
    const next = applyPreset(undefined, 'all', positionIn(range, 2, 2), {
      weight: 'medium',
      color: '#C0392B',
    })
    expect(next.top).toEqual({ weight: 'medium', color: '#C0392B' })
  })
})
