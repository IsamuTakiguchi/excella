import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { workbookFromXlsx, xlsxFromWorkbook } from '../src/main/io/xlsx'
import { createSheet, type WorkbookModel } from '../src/shared/model'

let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'excella-'))
})

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

function sampleModel(): WorkbookModel {
  const sheet = createSheet('売上')
  sheet.cells = {
    A1: { v: '商品' },
    B1: { v: '金額' },
    A2: { v: 'りんご' },
    B2: { v: 120 },
    A3: { v: 'みかん' },
    B3: { v: 80 },
    B4: { f: '=SUM(B2:B3)' },
    C2: { v: true },
  }
  sheet.styles = {
    A1: { bold: true, bg: '#FFF3BF', align: 'center' },
    B1: { bold: true, italic: true, color: '#C0392B' },
    B4: { numFmt: '#,##0', underline: true, fontSize: 14 },
  }
  sheet.colWidths = { 0: 120, 1: 96 }
  sheet.rowHeights = { 0: 30 }
  sheet.frozen = { rows: 1, cols: 0 }

  const second = createSheet('メモ')
  second.cells = { A1: { v: '2 枚目のシート' } }

  return { version: 1, sheets: [sheet, second], activeSheetId: sheet.id }
}

describe('xlsx の往復', () => {
  it('値・数式・書式・レイアウトが保たれる', async () => {
    const model = sampleModel()
    const path = join(dir, 'roundtrip.xlsx')
    await xlsxFromWorkbook(path, model, new Map([[model.sheets[0].id, new Map([['B4', 200]])]]))

    const loaded = await workbookFromXlsx(path)
    expect(loaded.sheets.map((s) => s.name)).toEqual(['売上', 'メモ'])

    const sheet = loaded.sheets[0]
    expect(sheet.cells['A1']).toEqual({ v: '商品' })
    expect(sheet.cells['B2']).toEqual({ v: 120 })
    expect(sheet.cells['C2']).toEqual({ v: true })
    expect(sheet.cells['B4']).toEqual({ f: '=SUM(B2:B3)' })

    expect(sheet.styles['A1']?.bold).toBe(true)
    expect(sheet.styles['A1']?.bg).toBe('#FFF3BF')
    expect(sheet.styles['A1']?.align).toBe('center')
    expect(sheet.styles['B1']?.italic).toBe(true)
    expect(sheet.styles['B1']?.color).toBe('#C0392B')
    expect(sheet.styles['B4']?.numFmt).toBe('#,##0')
    expect(sheet.styles['B4']?.underline).toBe(true)
    expect(sheet.styles['B4']?.fontSize).toBe(14)

    // 文字幅 ⇄ px の変換は近似なので許容誤差を見る
    expect(Math.abs((sheet.colWidths[0] ?? 0) - 120)).toBeLessThanOrEqual(4)
    expect(Math.abs((sheet.rowHeights[0] ?? 0) - 30)).toBeLessThanOrEqual(2)
    expect(sheet.frozen).toEqual({ rows: 1, cols: 0 })

    expect(loaded.sheets[1].cells['A1']).toEqual({ v: '2 枚目のシート' })
  })

  it('空のブックでも壊れない', async () => {
    const sheet = createSheet('Sheet1')
    const path = join(dir, 'empty.xlsx')
    await xlsxFromWorkbook(path, { version: 1, sheets: [sheet], activeSheetId: sheet.id })
    const loaded = await workbookFromXlsx(path)
    expect(loaded.sheets).toHaveLength(1)
    expect(Object.keys(loaded.sheets[0].cells)).toHaveLength(0)
  })
})
