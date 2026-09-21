import { describe, expect, it } from 'vitest'
import { canInsertRef, isFormula, parseRefs } from '../src/shared/formulaRefs'

describe('isFormula', () => {
  it('= で始まるものだけを数式とみなす', () => {
    expect(isFormula('=A1')).toBe(true)
    expect(isFormula('=')).toBe(true)
    expect(isFormula('123')).toBe(false)
    expect(isFormula(' =A1')).toBe(false)
  })
})

describe('canInsertRef', () => {
  const at = (text: string) => canInsertRef(text, text.length)

  it('演算子や開き括弧の直後なら差し込める', () => {
    expect(at('=')).toBe(true)
    expect(at('=A1+')).toBe(true)
    expect(at('=A1*')).toBe(true)
    expect(at('=SUM(')).toBe(true)
    expect(at('=SUM(A1,')).toBe(true)
    expect(at('=SUM(A1:')).toBe(true)
    expect(at('=A1 + ')).toBe(true)
  })

  it('参照や数値の途中では差し込めない', () => {
    expect(at('=A1')).toBe(false)
    expect(at('=12')).toBe(false)
    expect(at('=SUM(A1)')).toBe(false)
    expect(at('=SUM')).toBe(false)
  })

  it('数式でなければ差し込めない', () => {
    expect(at('123')).toBe(false)
    expect(at('りんご')).toBe(false)
    expect(at('')).toBe(false)
  })

  it('直後にトークンが続く位置では差し込めない（既存の参照を壊すため）', () => {
    // '=+A1' の '+' の直後（caret=2）に差し込むと '=+B2A1' になってしまう
    expect(canInsertRef('=+A1', 2)).toBe(false)
    // 同じ位置でも後ろが空なら差し込める
    expect(canInsertRef('=+', 2)).toBe(true)
    // 後ろが閉じ括弧なら差し込める
    expect(canInsertRef('=SUM()', 5)).toBe(true)
  })
})

describe('parseRefs', () => {
  const texts = (formula: string) => parseRefs(formula).map((r) => r.text)

  it('参照の位置と文字列を返す', () => {
    expect(parseRefs('=A1+B2')).toEqual([
      { start: 1, end: 3, text: 'A1' },
      { start: 4, end: 6, text: 'B2' },
    ])
  })

  it('範囲は 1 つの参照として返す', () => {
    expect(texts('=SUM(A1:B2)')).toEqual(['A1:B2'])
    expect(texts('=SUM(A1:B2,C3)')).toEqual(['A1:B2', 'C3'])
  })

  it('絶対参照も拾う', () => {
    expect(texts('=$A$1+$B2')).toEqual(['$A$1', '$B2'])
  })

  it('文字列リテラルの中は参照とみなさない', () => {
    expect(texts('="A1"&B2')).toEqual(['B2'])
  })

  it('関数名を参照と誤認しない', () => {
    expect(texts('=LOG10(5)')).toEqual([])
    expect(texts('=SUM(A1)')).toEqual(['A1'])
  })

  it('数値の指数部を参照と誤認しない', () => {
    expect(texts('=1.5E10+A1')).toEqual(['A1'])
  })

  it('参照が無ければ空', () => {
    expect(texts('=1+2')).toEqual([])
    expect(texts('=')).toEqual([])
  })
})
