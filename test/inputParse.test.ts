import { describe, expect, it } from 'vitest'
import { parseTypedInput } from '../src/shared/inputParse'
import { formatNumber } from '../src/shared/numberFormat'

const now = new Date(2024, 0, 15)

describe('parseTypedInput', () => {
  it('数値・数式・文字列', () => {
    expect(parseTypedInput('')).toEqual({ data: null })
    expect(parseTypedInput('=A1')).toEqual({ data: { f: '=A1' } })
    expect(parseTypedInput('12.5')).toEqual({ data: { v: 12.5 } })
    expect(parseTypedInput('abc')).toEqual({ data: { v: 'abc' } })
    expect(parseTypedInput('true')).toEqual({ data: { v: true } })
  })

  it('桁区切りは数値にして #,##0 を付ける', () => {
    expect(parseTypedInput('1,234')).toEqual({ data: { v: 1234 }, numFmt: '#,##0' })
    expect(parseTypedInput('-1,234.50')).toEqual({ data: { v: -1234.5 }, numFmt: '#,##0.00' })
    // 区切り位置がおかしいものは文字列のまま
    expect(parseTypedInput('12,34')).toEqual({ data: { v: '12,34' } })
  })

  it('通貨', () => {
    expect(parseTypedInput('¥1,500')).toEqual({ data: { v: 1500 }, numFmt: '¥#,##0' })
    expect(parseTypedInput('$9.99')).toEqual({ data: { v: 9.99 }, numFmt: '$#,##0.00' })
  })

  it('パーセント', () => {
    expect(parseTypedInput('50%')).toEqual({ data: { v: 0.5 }, numFmt: '0%' })
    expect(parseTypedInput('12.5%')).toEqual({ data: { v: 0.125 }, numFmt: '0.00%' })
  })

  it('日付は日付のシリアル値にする', () => {
    const r = parseTypedInput('2024/1/31')
    expect(r.data).toEqual({ v: 45322 })
    expect(formatNumber(45322, r.numFmt)).toBe('2024/1/31')
    expect(parseTypedInput('2024-01-31').data).toEqual({ v: 45322 })
    expect(parseTypedInput('2024年1月31日')).toEqual({
      data: { v: 45322 },
      numFmt: 'yyyy"年"m"月"d"日"',
    })
  })

  it('年を省いた日付は今年', () => {
    const r = parseTypedInput('3/5', now)
    expect(formatNumber(r.data?.v as number, 'yyyy/mm/dd')).toBe('2024/03/05')
    expect(formatNumber(r.data?.v as number, r.numFmt)).toBe('3月5日')
  })

  it('存在しない日付は文字列のまま', () => {
    expect(parseTypedInput('2024/2/30')).toEqual({ data: { v: '2024/2/30' } })
    expect(parseTypedInput('13/1', now)).toEqual({ data: { v: '13/1' } })
  })

  it('時刻', () => {
    expect(parseTypedInput('13:30')).toEqual({ data: { v: 13.5 / 24 }, numFmt: 'h:mm' })
    expect(parseTypedInput('25:00')).toEqual({ data: { v: '25:00' } })
  })
})
