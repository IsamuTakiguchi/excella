import { describe, expect, it } from 'vitest'
import { HyperFormula } from 'hyperformula'
import {
  activeCall,
  applySuggestion,
  FUNCTION_CATALOG,
  functionPrefixAt,
  highlightedArg,
  suggestFunctions,
} from '../src/shared/functions'

const names = HyperFormula.getRegisteredFunctionNames('enGB')

describe('FUNCTION_CATALOG', () => {
  it('載せた関数はすべて HyperFormula で使える', () => {
    const missing = FUNCTION_CATALOG.map((f) => f.name).filter((n) => !names.includes(n))
    expect(missing).toEqual([])
  })
})

describe('functionPrefixAt', () => {
  it('打ちかけの関数名を取り出す', () => {
    expect(functionPrefixAt('=SU', 3)).toEqual({ start: 1, prefix: 'SU' })
    expect(functionPrefixAt('=A1+vlo', 7)).toEqual({ start: 4, prefix: 'vlo' })
    expect(functionPrefixAt('=SUM(co', 7)).toEqual({ start: 5, prefix: 'co' })
  })

  it('数式でない・文字列の中・数値・シート名のあとでは出さない', () => {
    expect(functionPrefixAt('SU', 2)).toBeNull()
    expect(functionPrefixAt('="SU', 4)).toBeNull()
    expect(functionPrefixAt('=12', 3)).toBeNull()
    expect(functionPrefixAt('=Sheet1!A', 9)).toBeNull()
    expect(functionPrefixAt('=SUM(A1)', 4)).toBeNull() // すでに ( がある
    expect(functionPrefixAt('=SUM(A1)', 3)).toBeNull() // 名前の途中
  })
})

describe('suggestFunctions', () => {
  it('前方一致で、主な関数を先に出す', () => {
    const hits = suggestFunctions('su', names)
    expect(hits[0]).toBe('SUM')
    expect(hits).toContain('SUMIF')
    expect(hits.every((n) => n.startsWith('SU'))).toBe(true)
    expect(hits.length).toBeLessThanOrEqual(8)
  })

  it('一致しなければ空', () => {
    expect(suggestFunctions('A1', names)).toEqual([])
  })
})

describe('activeCall', () => {
  it('一番内側の関数と引数の位置', () => {
    expect(activeCall('=SUM(', 5)).toEqual({ name: 'SUM', argIndex: 0 })
    expect(activeCall('=IF(A1>0,"a,b",', 15)).toEqual({ name: 'IF', argIndex: 2 })
    expect(activeCall('=IF(A1>0,ROUND(B1,', 18)).toEqual({ name: 'ROUND', argIndex: 1 })
    expect(activeCall('=ROUND(B1,2)+', 13)).toBeNull()
  })
})

describe('applySuggestion', () => {
  it('名前と ( を入れてキャレットを括弧の後ろへ', () => {
    expect(applySuggestion('=A1+vl', 4, 6, 'VLOOKUP')).toEqual({ text: '=A1+VLOOKUP(', caret: 12 })
  })
})

describe('highlightedArg', () => {
  it('... 以降は繰り返しの引数を強調する', () => {
    const sum = FUNCTION_CATALOG.find((f) => f.name === 'SUM')!
    expect(highlightedArg(sum, 0)).toBe(0)
    expect(highlightedArg(sum, 5)).toBe(1)
    const round = FUNCTION_CATALOG.find((f) => f.name === 'ROUND')!
    expect(highlightedArg(round, 1)).toBe(1)
  })
})
