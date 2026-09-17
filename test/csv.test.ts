import { describe, expect, it } from 'vitest'
import { coerceScalar, csvToWorkbook, parseCsv, sheetToRows, stringifyCsv } from '../src/shared/csv'

describe('parseCsv', () => {
  it('基本的な行と列', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('引用符とエスケープ', () => {
    expect(parseCsv('"a,b",c')).toEqual([['a,b', 'c']])
    expect(parseCsv('"he said ""hi""",x')).toEqual([['he said "hi"', 'x']])
  })

  it('フィールド内の改行', () => {
    expect(parseCsv('"one\ntwo",b')).toEqual([['one\ntwo', 'b']])
  })

  it('CRLF と CR', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseCsv('a\rb')).toEqual([['a'], ['b']])
  })

  it('BOM を落とす', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']])
  })

  it('空文字列', () => {
    expect(parseCsv('')).toEqual([])
  })

  it('タブ区切りも扱える', () => {
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('stringifyCsv', () => {
  it('必要なときだけ引用する', () => {
    expect(stringifyCsv([['a', 'b']])).toBe('a,b')
    expect(stringifyCsv([['a,b', 'c']])).toBe('"a,b",c')
    expect(stringifyCsv([['he "said"']])).toBe('"he ""said"""')
    expect(stringifyCsv([['one\ntwo']])).toBe('"one\ntwo"')
  })

  it('往復する', () => {
    const rows = [
      ['名前', '説明'],
      ['A', 'カンマ, と "引用符"'],
      ['B', '改行\nあり'],
    ]
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows)
  })
})

describe('coerceScalar', () => {
  it('数値・真偽値・文字列を見分ける', () => {
    expect(coerceScalar('12')).toBe(12)
    expect(coerceScalar('-3.5')).toBe(-3.5)
    expect(coerceScalar('1e3')).toBe(1000)
    expect(coerceScalar('TRUE')).toBe(true)
    expect(coerceScalar('abc')).toBe('abc')
    expect(coerceScalar('007A')).toBe('007A')
    expect(coerceScalar('')).toBe('')
  })
})

describe('csvToWorkbook / sheetToRows', () => {
  it('シートを作って書き戻せる', () => {
    const wb = csvToWorkbook('名前,点数\n田中,80\n鈴木,=B2*2\n', 'data')
    const sheet = wb.sheets[0]
    expect(sheet.name).toBe('data')
    expect(sheet.cells['A1']).toEqual({ v: '名前' })
    expect(sheet.cells['B2']).toEqual({ v: 80 })
    expect(sheet.cells['B3']).toEqual({ f: '=B2*2' })

    const rows = sheetToRows(sheet)
    expect(rows).toEqual([
      ['名前', '点数'],
      ['田中', '80'],
      ['鈴木', '=B2*2'],
    ])
  })

  it('表示値が渡されればそちらを使う', () => {
    const wb = csvToWorkbook('=1+1\n', 'x')
    const rows = sheetToRows(wb.sheets[0], new Map([['A1', '2']]))
    expect(rows).toEqual([['2']])
  })
})
