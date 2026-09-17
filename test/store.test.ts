import { beforeEach, describe, expect, it } from 'vitest'
import { parseInput, useStore } from '../src/renderer/store/workbookStore'

const store = () => useStore.getState()

function setCell(a1: string, text: string): void {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  store().setCellInput({ row: Number(m[2]) - 1, col: col - 1 }, text)
}

function valueOf(a1: string): unknown {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return store().displayValue({ row: Number(m[2]) - 1, col: col - 1 })
}

function inputOf(a1: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return store().inputText({ row: Number(m[2]) - 1, col: col - 1 })
}

beforeEach(() => {
  store().newWorkbook()
})

describe('parseInput', () => {
  it('入力を型づけする', () => {
    expect(parseInput('')).toBeNull()
    expect(parseInput('=SUM(A1)')).toEqual({ f: '=SUM(A1)' })
    expect(parseInput('12.5')).toEqual({ v: 12.5 })
    expect(parseInput('50%')).toEqual({ v: 0.5 })
    expect(parseInput('TRUE')).toEqual({ v: true })
    expect(parseInput('こんにちは')).toEqual({ v: 'こんにちは' })
  })
})

describe('セル編集と計算', () => {
  it('数式が計算される', () => {
    setCell('A1', '10')
    setCell('A2', '32')
    setCell('A3', '=SUM(A1:A2)')
    expect(valueOf('A3')).toBe(42)
  })

  it('エラーは #DIV/0! のような文字列になる', () => {
    setCell('A1', '=1/0')
    expect(valueOf('A1')).toBe('#DIV/0!')
  })

  it('選択範囲をクリアできる', () => {
    setCell('A1', '1')
    setCell('B1', '2')
    store().setSelection({ row: 0, col: 0 }, { row: 0, col: 1 })
    store().clearSelection()
    expect(valueOf('A1')).toBeNull()
    expect(valueOf('B1')).toBeNull()
  })
})

describe('行と列の挿入・削除', () => {
  it('行を挿入すると数式の参照が追従する', () => {
    setCell('A1', '10')
    setCell('A2', '=A1*2')
    store().insertRows(0, 1)
    expect(inputOf('A3')).toBe('=A2*2')
    expect(valueOf('A3')).toBe(20)
  })

  it('参照していない行を削除しても数式は保たれる', () => {
    setCell('A1', 'ヘッダー')
    setCell('A2', '1')
    setCell('A3', '2')
    setCell('A4', '=A2+A3')
    store().deleteRows(0, 1) // ヘッダー行だけ削除
    expect(inputOf('A3')).toBe('=A1+A2')
    expect(valueOf('A3')).toBe(3)
    expect(store().activeSheet().rowCount).toBe(199)
  })

  it('参照先の行を削除した数式は #REF! になる（Excel と同じ）', () => {
    setCell('A1', '1')
    setCell('A2', '2')
    setCell('A3', '=A1+A2')
    store().deleteRows(0, 1)
    expect(valueOf('A2')).toBe('#REF!')
  })

  it('列の挿入で書式もずれる', () => {
    store().setSelection({ row: 0, col: 0 })
    store().applyStyle({ bold: true })
    expect(store().activeSheet().styles['A1']?.bold).toBe(true)
    store().insertColumns(0, 1)
    expect(store().activeSheet().styles['A1']).toBeUndefined()
    expect(store().activeSheet().styles['B1']?.bold).toBe(true)
  })

  it('列幅も一緒にずれる', () => {
    store().setColWidth(0, 200)
    store().insertColumns(0, 2)
    expect(store().activeSheet().colWidths[2]).toBe(200)
  })
})

describe('undo / redo', () => {
  it('セル編集を元に戻せる', () => {
    setCell('A1', '1')
    setCell('A1', '2')
    expect(valueOf('A1')).toBe(2)
    store().undo()
    expect(valueOf('A1')).toBe(1)
    store().redo()
    expect(valueOf('A1')).toBe(2)
  })

  it('行削除を元に戻すと数式まで復元される', () => {
    setCell('A1', '5')
    setCell('A2', '=A1*3')
    store().deleteRows(0, 1)
    store().undo()
    expect(inputOf('A2')).toBe('=A1*3')
    expect(valueOf('A2')).toBe(15)
  })

  it('書式変更も元に戻せる', () => {
    store().setSelection({ row: 0, col: 0 })
    store().applyStyle({ bg: '#FFF3BF' })
    expect(store().activeSheet().styles['A1']?.bg).toBe('#FFF3BF')
    store().undo()
    expect(store().activeSheet().styles['A1']).toBeUndefined()
  })

  it('スタックが空なら何も起きない', () => {
    expect(() => store().undo()).not.toThrow()
    expect(store().canUndo).toBe(false)
  })
})

describe('コピーと貼り付け', () => {
  it('相対参照がずれる', async () => {
    setCell('A1', '1')
    setCell('A2', '2')
    setCell('A3', '=SUM(A1:A2)')
    store().setSelection({ row: 2, col: 0 })
    await store().copy(false)
    store().setSelection({ row: 2, col: 1 })
    store().paste()
    expect(inputOf('B3')).toBe('=SUM(B1:B2)')
  })

  it('切り取りは参照をずらさず、元を消す', async () => {
    setCell('A1', '7')
    setCell('B1', '=A1*2')
    store().setSelection({ row: 0, col: 1 })
    await store().copy(true)
    store().setSelection({ row: 0, col: 2 })
    store().paste()
    expect(inputOf('C1')).toBe('=A1*2')
    expect(valueOf('B1')).toBeNull()
  })

  it('書式も一緒に貼られる', async () => {
    store().setSelection({ row: 0, col: 0 })
    store().applyStyle({ bold: true, bg: '#E3F2FD' })
    await store().copy(false)
    store().setSelection({ row: 3, col: 3 })
    store().paste()
    expect(store().activeSheet().styles['D4']).toEqual({ bold: true, bg: '#E3F2FD' })
  })

  it('外部の TSV は値として貼られる', () => {
    store().setSelection({ row: 0, col: 0 })
    store().paste('a\tb\n1\t2')
    expect(valueOf('A1')).toBe('a')
    expect(valueOf('B2')).toBe(2)
  })
})

describe('並べ替え', () => {
  it('選択範囲を先頭列で並べ替える', () => {
    setCell('A1', '3')
    setCell('B1', 'c')
    setCell('A2', '1')
    setCell('B2', 'a')
    setCell('A3', '2')
    setCell('B3', 'b')
    store().setSelection({ row: 0, col: 0 }, { row: 2, col: 1 })
    store().sortSelection(0, true)
    expect([valueOf('A1'), valueOf('A2'), valueOf('A3')]).toEqual([1, 2, 3])
    expect([valueOf('B1'), valueOf('B2'), valueOf('B3')]).toEqual(['a', 'b', 'c'])
  })

  it('降順にもできる', () => {
    setCell('A1', 'い')
    setCell('A2', 'あ')
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 0 })
    store().sortSelection(0, false)
    expect([valueOf('A1'), valueOf('A2')]).toEqual(['い', 'あ'])
  })

  it('1 行しか選んでいなければ何もしない', () => {
    setCell('A1', '1')
    store().setSelection({ row: 0, col: 0 })
    store().sortSelection(0, true)
    expect(store().statusMessage).toContain('2 行以上')
  })
})

describe('シート操作', () => {
  it('追加・切り替え・削除', () => {
    const first = store().model.activeSheetId
    store().addSheet()
    expect(store().model.sheets).toHaveLength(2)
    const second = store().model.activeSheetId
    expect(second).not.toBe(first)

    setCell('A1', '99')
    expect(valueOf('A1')).toBe(99)

    store().setActiveSheet(first)
    expect(valueOf('A1')).toBeNull()

    store().removeSheet(second)
    expect(store().model.sheets).toHaveLength(1)
  })

  it('最後の 1 枚は削除できない', () => {
    store().removeSheet(store().model.activeSheetId)
    expect(store().model.sheets).toHaveLength(1)
    expect(store().statusMessage).toContain('1 つ以上')
  })

  it('シート名を変更すると数式からも参照できる', () => {
    const first = store().model.activeSheetId
    store().renameSheet(first, 'データ')
    store().addSheet()
    setCell('A1', "='データ'!A1+1")
    expect(valueOf('A1')).toBe(1)
  })
})
