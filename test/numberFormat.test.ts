import { describe, expect, it } from 'vitest'
import {
  dateToSerial,
  formatCellValue,
  formatGeneral,
  formatNumber,
  isDateFormat,
  serialToDate,
} from '../src/shared/numberFormat'

describe('formatGeneral', () => {
  it('末尾のゼロを落とす', () => {
    expect(formatGeneral(0)).toBe('0')
    expect(formatGeneral(1)).toBe('1')
    expect(formatGeneral(1.5)).toBe('1.5')
    expect(formatGeneral(-2.25)).toBe('-2.25')
  })

  it('浮動小数の誤差を丸める', () => {
    expect(formatGeneral(0.1 + 0.2)).toBe('0.3')
  })

  it('極端な値は指数表記', () => {
    expect(formatGeneral(1e12)).toContain('E')
    expect(formatGeneral(1e-12)).toContain('E')
  })
})

describe('formatNumber', () => {
  it('数値書式', () => {
    expect(formatNumber(1234.567, '0')).toBe('1235')
    expect(formatNumber(1234.567, '0.00')).toBe('1234.57')
    expect(formatNumber(1234567, '#,##0')).toBe('1,234,567')
    expect(formatNumber(1234567.891, '#,##0.00')).toBe('1,234,567.89')
    expect(formatNumber(-1234.5, '#,##0.00')).toBe('-1,234.50')
    expect(formatNumber(0, '#,##0.00')).toBe('0.00')
  })

  it('パーセントと通貨', () => {
    expect(formatNumber(0.1234, '0%')).toBe('12%')
    expect(formatNumber(0.1234, '0.00%')).toBe('12.34%')
    expect(formatNumber(1500, '¥#,##0')).toBe('¥1,500')
    expect(formatNumber(1500.5, '$#,##0.00')).toBe('$1,500.50')
  })

  it('未知のコードは General 扱い', () => {
    expect(formatNumber(1.5, '[$-409]dddd')).toBe('1.5')
  })
})

describe('日付', () => {
  it('シリアル値と Date を往復する', () => {
    const serial = dateToSerial(new Date(Date.UTC(2024, 0, 31)))
    expect(serial).toBe(45322)
    expect(serialToDate(45322).toISOString().slice(0, 10)).toBe('2024-01-31')
  })

  it('日付書式で整形する', () => {
    expect(formatNumber(45322, 'yyyy/mm/dd')).toBe('2024/01/31')
    expect(formatNumber(45322, 'yyyy-mm-dd')).toBe('2024-01-31')
    expect(formatNumber(45322, 'm/d')).toBe('1/31')
    expect(formatNumber(45322.5, 'h:mm')).toBe('12:00')
    expect(formatNumber(45322.5, 'yyyy/mm/dd h:mm')).toBe('2024/01/31 12:00')
  })

  it('日付書式かどうか判定できる', () => {
    expect(isDateFormat('yyyy/mm/dd')).toBe(true)
    expect(isDateFormat('#,##0')).toBe(false)
    expect(isDateFormat(undefined)).toBe(false)
  })
})

describe('formatCellValue', () => {
  it('型ごとに整形する', () => {
    expect(formatCellValue(null, undefined)).toBe('')
    expect(formatCellValue(undefined, undefined)).toBe('')
    expect(formatCellValue('text', '0.00')).toBe('text')
    expect(formatCellValue(true, undefined)).toBe('TRUE')
    expect(formatCellValue(false, undefined)).toBe('FALSE')
    expect(formatCellValue(12.5, '0.00')).toBe('12.50')
  })
})
