import { describe, expect, it } from 'vitest'
import {
  dateToSerial,
  formatCellValue,
  formatGeneral,
  formatNumber,
  adjustDecimals,
  formatCell,
  formatNumberWithColor,
  isDateFormat,
  serialToDate,
  splitSections,
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

  it('ロケール指定は無視して曜日を出す', () => {
    expect(formatNumber(1.5, '[$-409]dddd')).toBe('Sunday')
  })

  it('負の区分があれば符号はそちらに任せる', () => {
    expect(formatNumber(-1500, '#,##0;"▲"#,##0')).toBe('▲1,500')
    expect(formatNumber(1500, '#,##0;"▲"#,##0')).toBe('1,500')
    expect(formatNumber(-5, '#,##0_);(#,##0)')).toBe('(5)')
    expect(formatNumber(0, '#,##0;-#,##0;"-"')).toBe('-')
  })

  it('[Red] などの色を返す', () => {
    expect(formatNumberWithColor(-3, '#,##0;[Red]-#,##0')).toEqual({ text: '-3', color: '#FF0000' })
    expect(formatNumberWithColor(3, '#,##0;[Red]-#,##0').color).toBeUndefined()
  })

  it('任意の桁数・リテラル・千単位', () => {
    expect(formatNumber(3.14159, '0.000')).toBe('3.142')
    expect(formatNumber(1234.5, '#,##0.0"円"')).toBe('1,234.5円')
    expect(formatNumber(1234567, '#,##0,"千円"')).toBe('1,235千円')
    expect(formatNumber(1.5, '0.0#')).toBe('1.5')
    expect(formatNumber(1.555, '0.0#')).toBe('1.56')
    expect(formatNumber(1000001, '000-0000')).toBe('100-0001')
    expect(formatNumber(7, '000')).toBe('007')
    expect(formatNumber(12345, '0.00E+00')).toBe('1.23E+04')
    expect(formatNumber(1500, '[$¥-411]#,##0')).toBe('¥1,500')
  })

  it('負の値が丸めで 0 になったら符号を付けない', () => {
    expect(formatNumber(-0.001, '0.00')).toBe('0.00')
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

  it('日本語の日付・曜日・和暦', () => {
    expect(formatNumber(45322, 'yyyy"年"m"月"d"日"')).toBe('2024年1月31日')
    expect(formatNumber(45322, 'm/d(aaa)')).toBe('1/31(水)')
    expect(formatNumber(45322, 'aaaa')).toBe('水曜日')
    expect(formatNumber(45322, 'ggge"年"m"月"d"日"')).toBe('令和6年1月31日')
    expect(formatNumber(45322, 'ge.m.d')).toBe('R6.1.31')
    // 平成 31 年 4 月 30 日 → 令和元年（1 年）5 月 1 日
    expect(formatNumber(43585, 'ggge')).toBe('平成31')
    expect(formatNumber(43586, 'ggge')).toBe('令和1')
  })

  it('12 時間制・経過時間・月名', () => {
    expect(formatNumber(45322.75, 'h:mm AM/PM')).toBe('6:00 PM')
    expect(formatNumber(1.0625, '[h]:mm')).toBe('25:30')
    expect(formatNumber(45322, 'mmm d, yyyy')).toBe('Jan 31, 2024')
    expect(formatNumber(45322, 'yy/m/d')).toBe('24/1/31')
  })

  it('日付書式かどうか判定できる', () => {
    expect(isDateFormat('yyyy/mm/dd')).toBe(true)
    expect(isDateFormat('#,##0')).toBe(false)
    expect(isDateFormat(undefined)).toBe(false)
    expect(isDateFormat('yyyy"年"m"月"d"日"')).toBe(true)
    expect(isDateFormat('[h]:mm')).toBe(true)
    expect(isDateFormat('General')).toBe(false)
    expect(isDateFormat('#,##0;[Red]-#,##0')).toBe(false)
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

describe('文字列の区分', () => {
  it('4 番目の区分で文字列を飾る', () => {
    expect(formatCell('abc', '0;-0;0;"【"@"】"')).toEqual({ text: '【abc】' })
    expect(formatCell('abc', '#,##0')).toEqual({ text: 'abc' })
  })
})

describe('splitSections', () => {
  it('引用符と角括弧の中の ; では分けない', () => {
    expect(splitSections('0;"a;b";[Red]0')).toEqual(['0', '"a;b"', '[Red]0'])
  })
})

describe('adjustDecimals', () => {
  it('General は値の今の桁数から増減する', () => {
    expect(adjustDecimals(undefined, 1, 1.5)).toBe('0.00')
    expect(adjustDecimals('General', -1, 1.5)).toBe('0')
    expect(adjustDecimals(undefined, 1, 3)).toBe('0.0')
    expect(adjustDecimals(undefined, -1, 3)).toBe('0')
  })

  it('既存のコードの小数部を伸び縮みさせる', () => {
    expect(adjustDecimals('#,##0', 1)).toBe('#,##0.0')
    expect(adjustDecimals('#,##0.0', 1)).toBe('#,##0.00')
    expect(adjustDecimals('0.00%', 1)).toBe('0.000%')
    expect(adjustDecimals('0.0', -1)).toBe('0')
    expect(adjustDecimals('0.00', -1)).toBe('0.0')
    expect(adjustDecimals('¥#,##0', 1)).toBe('¥#,##0.0')
    expect(adjustDecimals('#,##0;[Red]-#,##0', 1)).toBe('#,##0.0;[Red]-#,##0.0')
    expect(adjustDecimals('#,##0"円"', 1)).toBe('#,##0.0"円"')
  })

  it('日付と文字列はそのまま', () => {
    expect(adjustDecimals('yyyy/mm/dd', 1)).toBe('yyyy/mm/dd')
    expect(adjustDecimals('@', -1)).toBe('@')
  })
})
