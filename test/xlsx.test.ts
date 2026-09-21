import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { workbookFromXlsx, xlsxFromWorkbook } from '../src/main/io/xlsx'
import { workbookFromXlsxBuffer, xlsxBufferFromWorkbook } from '../src/shared/xlsx'
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

  it('結合セルは左上だけが値を持ち、従セルは空になる', async () => {
    const sheet = createSheet('結合')
    sheet.cells = { A1: { v: 'タイトル' }, A3: { v: '本文' } }
    sheet.merges = ['A1:C2']
    const path = join(dir, 'merged.xlsx')
    await xlsxFromWorkbook(path, { version: 1, sheets: [sheet], activeSheetId: sheet.id })

    const loaded = await workbookFromXlsx(path)
    const out = loaded.sheets[0]
    expect(out.merges).toContain('A1:C2')
    expect(out.cells['A1']).toEqual({ v: 'タイトル' })
    // 従セルに値が複製されていないこと
    expect(out.cells['B1']).toBeUndefined()
    expect(out.cells['C1']).toBeUndefined()
    expect(out.cells['A2']).toBeUndefined()
    expect(out.cells['C2']).toBeUndefined()
    // 結合外のセルは通常どおり
    expect(out.cells['A3']).toEqual({ v: '本文' })
  })

  it('罫線が往復する', async () => {
    const sheet = createSheet('罫線')
    sheet.cells = { B2: { v: '囲み' } }
    sheet.styles = {
      B2: {
        borders: {
          top: { weight: 'thin' },
          bottom: { weight: 'thick' },
          left: { weight: 'medium', color: '#C0392B' },
        },
      },
    }
    const path = join(dir, 'borders.xlsx')
    await xlsxFromWorkbook(path, { version: 1, sheets: [sheet], activeSheetId: sheet.id })

    const loaded = await workbookFromXlsx(path)
    const borders = loaded.sheets[0].styles['B2']?.borders
    expect(borders?.top).toEqual({ weight: 'thin' })
    expect(borders?.bottom).toEqual({ weight: 'thick' })
    expect(borders?.left).toEqual({ weight: 'medium', color: '#C0392B' })
    // 引いていない辺は付かない
    expect(borders?.right).toBeUndefined()
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

describe('xlsx のバイト列での往復（ブラウザ版が使う経路）', () => {
  it('ファイルを介さずに同じ内容が戻る', async () => {
    const model = sampleModel()
    const bytes = await xlsxBufferFromWorkbook(model)
    expect(bytes).toBeInstanceOf(Uint8Array)
    // xlsx は zip なので先頭は "PK"
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')

    // ブラウザの File.arrayBuffer() と同じ ArrayBuffer で読めること
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const loaded = await workbookFromXlsxBuffer(copy as ArrayBuffer)
    expect(loaded.sheets.map((s) => s.name)).toEqual(['売上', 'メモ'])
    expect(loaded.sheets[0].cells['B4']).toEqual({ f: '=SUM(B2:B3)' })
    expect(loaded.sheets[0].styles['A1']?.bg).toBe('#FFF3BF')
    expect(loaded.sheets[0].frozen).toEqual({ rows: 1, cols: 0 })
  })
})
