import { describe, expect, it } from 'vitest'
import { adjustFormula } from '../src/shared/refAdjust'

describe('adjustFormula', () => {
  it('オフセット 0 なら素通し', () => {
    expect(adjustFormula('=A1+B2', 0, 0)).toBe('=A1+B2')
  })

  it('相対参照をずらす', () => {
    expect(adjustFormula('=A1', 1, 0)).toBe('=A2')
    expect(adjustFormula('=A1', 0, 1)).toBe('=B1')
    expect(adjustFormula('=A1+B2', 2, 3)).toBe('=D3+E4')
  })

  it('絶対参照は固定される', () => {
    expect(adjustFormula('=$A$1', 5, 5)).toBe('=$A$1')
    expect(adjustFormula('=$A1', 5, 5)).toBe('=$A6')
    expect(adjustFormula('=A$1', 5, 5)).toBe('=F$1')
  })

  it('範囲は両端が補正される', () => {
    expect(adjustFormula('=SUM(A1:B2)', 1, 1)).toBe('=SUM(B2:C3)')
    expect(adjustFormula('=SUM($A$1:B2)', 1, 1)).toBe('=SUM($A$1:C3)')
  })

  it('関数名を参照と誤認しない', () => {
    expect(adjustFormula('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)')
    expect(adjustFormula('=SUM(A1)', 0, 1)).toBe('=SUM(B1)')
    expect(adjustFormula('=T1(A1)', 1, 0)).toBe('=T1(A2)')
  })

  it('文字列リテラルの中は書き換えない', () => {
    expect(adjustFormula('=IF(A1="B2","A1","X")', 1, 0)).toBe('=IF(A2="B2","A1","X")')
    expect(adjustFormula('="he said ""A1"""&A1', 1, 0)).toBe('="he said ""A1"""&A2')
  })

  it('シート修飾つき参照も補正する', () => {
    expect(adjustFormula('=Sheet2!A1', 1, 0)).toBe('=Sheet2!A2')
    expect(adjustFormula("='My Sheet'!A1", 0, 1)).toBe("='My Sheet'!B1")
    expect(adjustFormula("='A1 data'!A1", 1, 0)).toBe("='A1 data'!A2")
  })

  it('数値リテラルの指数部を参照と誤認しない', () => {
    expect(adjustFormula('=1.5E10+A1', 1, 0)).toBe('=1.5E10+A2')
    expect(adjustFormula('=2E+3*A1', 0, 1)).toBe('=2E+3*B1')
  })

  it('範囲外に出る参照は #REF!', () => {
    expect(adjustFormula('=A1', -1, 0)).toBe('=#REF!')
    expect(adjustFormula('=A1', 0, -1)).toBe('=#REF!')
    expect(adjustFormula('=$A$1', -5, 0)).toBe('=$A$1')
  })

  it('演算子や空白を保つ', () => {
    expect(adjustFormula('=A1 + B1 * 2', 1, 0)).toBe('=A2 + B2 * 2')
  })
})
