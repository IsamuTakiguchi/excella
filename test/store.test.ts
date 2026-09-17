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

// ---------------------------------------------------------------------------
// 以下は監査で見つかった不具合の回帰テスト（Phase A）
// ---------------------------------------------------------------------------

describe('回帰: シートをまたいだ切り取り', () => {
  it('コピー元のシートが消え、貼り付け先の他セルは無傷', async () => {
    const first = store().model.activeSheetId
    setCell('A1', '100')
    setCell('A2', '200')

    store().addSheet()
    const second = store().model.activeSheetId
    setCell('A1', 'keep-A1')
    setCell('A2', 'keep-A2')
    setCell('C1', 'target')

    // Sheet1 の A1:A2 を切り取って Sheet2 の C1 に貼る
    store().setActiveSheet(first)
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 0 })
    await store().copy(true)
    store().setActiveSheet(second)
    store().setSelection({ row: 0, col: 2 })
    store().paste()

    // 貼り付け先
    expect(valueOf('C1')).toBe(100)
    expect(valueOf('C2')).toBe(200)
    // 貼り付け先シートの無関係なセルが巻き込まれていない
    expect(valueOf('A1')).toBe('keep-A1')
    expect(valueOf('A2')).toBe('keep-A2')

    // 切り取り元シートは空になっている（モデル・エンジンの両方で）
    store().setActiveSheet(first)
    expect(valueOf('A1')).toBeNull()
    expect(valueOf('A2')).toBeNull()
    expect(store().activeSheet().cells['A1']).toBeUndefined()
  })
})

describe('回帰: 列幅ドラッグの undo', () => {
  it('ドラッグ中の連続更新は履歴を積まず、undo 1 回で戻る', () => {
    setCell('A1', 'anchor')
    const before = {
      colWidths: { ...store().activeSheet().colWidths },
      rowHeights: { ...store().activeSheet().rowHeights },
    }
    // mousemove 相当を 30 回
    for (let i = 0; i < 30; i++) store().setColWidth(0, 100 + i, false)
    store().commitResize(before)
    expect(store().activeSheet().colWidths[0]).toBe(129)

    store().undo()
    expect(store().activeSheet().colWidths[0]).toBeUndefined()
    // 直前の実編集が履歴から押し出されていない
    store().undo()
    expect(valueOf('A1')).toBeNull()
  })
})

describe('回帰: 行列の挿入削除で結合セルが追従する', () => {
  it('挿入でずれ、削除で消える', () => {
    const sheet = store().activeSheet()
    sheet.merges.push('B2:C3')
    store().insertRows(0, 1)
    expect(store().activeSheet().merges).toEqual(['B3:C4'])

    store().insertColumns(0, 2)
    expect(store().activeSheet().merges).toEqual(['D3:E4'])

    // 結合範囲を丸ごと含む行削除で消える
    store().deleteRows(2, 2)
    expect(store().activeSheet().merges).toEqual([])
  })

  it('またがった削除では結合が縮む', () => {
    const sheet = store().activeSheet()
    sheet.merges.push('A1:A4')
    store().deleteRows(2, 2) // 3〜4 行目を削除
    expect(store().activeSheet().merges).toEqual(['A1:A2'])
  })
})

describe('回帰: undo で保存状態に戻ると dirty が解除される', () => {
  it('保存 → 編集 → undo で未保存フラグが消える', () => {
    store().markSaved('/tmp/book.xlsx', 'book.xlsx')
    expect(store().dirty).toBe(false)

    setCell('A1', '1')
    expect(store().dirty).toBe(true)

    store().undo()
    expect(store().dirty).toBe(false)

    store().redo()
    expect(store().dirty).toBe(true)
  })
})

describe('回帰: 貼り付けでシートが広がる', () => {
  it('最終行付近に貼ると rowCount が伸びる', () => {
    const lastRow = store().activeSheet().rowCount - 1
    store().setSelection({ row: lastRow, col: 0 })
    store().paste('a\nb\nc')
    expect(store().activeSheet().rowCount).toBeGreaterThan(lastRow + 3)
  })
})

describe('回帰: 並べ替えのメッセージが列名になる', () => {
  it('セル番地ではなく列名を出す', () => {
    setCell('B1', '2')
    setCell('B2', '1')
    store().setSelection({ row: 0, col: 1 }, { row: 1, col: 1 })
    store().sortSelection(0, true)
    expect(store().statusMessage).toBe('B 列で並べ替えました')
  })
})

describe('結合セル', () => {
  it('選択範囲を結合し、左上以外の内容は破棄される', () => {
    setCell('A1', 'タイトル')
    setCell('B1', '消える')
    setCell('B2', '消える')
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 1 })
    store().toggleMerge()

    expect(store().activeSheet().merges).toEqual(['A1:B2'])
    expect(valueOf('A1')).toBe('タイトル')
    expect(valueOf('B1')).toBeNull()
    expect(valueOf('B2')).toBeNull()
  })

  it('同じ範囲をもう一度実行すると解除される', () => {
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 1 })
    store().toggleMerge()
    expect(store().activeSheet().merges).toHaveLength(1)
    store().toggleMerge()
    expect(store().activeSheet().merges).toEqual([])
  })

  it('単一セルでは結合しない', () => {
    store().setSelection({ row: 0, col: 0 })
    store().toggleMerge()
    expect(store().activeSheet().merges).toEqual([])
    expect(store().statusMessage).toContain('2 つ以上')
  })

  it('結合に一部でもかかった選択は結合全体まで広がる', () => {
    store().setSelection({ row: 0, col: 0 }, { row: 2, col: 2 })
    store().toggleMerge()
    // C4 と結合 A1:C3 の一部 C3 を含む選択
    store().setSelection({ row: 2, col: 2 }, { row: 3, col: 2 })
    const range = store().selectionRange()
    expect(range).toEqual({ r0: 0, c0: 0, r1: 3, c1: 2 })
  })

  it('結合も undo で元に戻る', () => {
    setCell('B1', 'keep')
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 1 })
    store().toggleMerge()
    expect(valueOf('B1')).toBeNull()
    store().undo()
    expect(store().activeSheet().merges).toEqual([])
    expect(valueOf('B1')).toBe('keep')
  })
})

describe('ウィンドウ枠の固定', () => {
  it('アクティブセルの左上で固定し、もう一度で解除される', () => {
    store().setSelection({ row: 2, col: 1 })
    store().toggleFreeze()
    expect(store().activeSheet().frozen).toEqual({ rows: 2, cols: 1 })

    store().toggleFreeze()
    expect(store().activeSheet().frozen).toBeUndefined()
  })

  it('undo で元に戻る', () => {
    store().setSelection({ row: 1, col: 0 })
    store().toggleFreeze()
    expect(store().activeSheet().frozen).toEqual({ rows: 1, cols: 0 })
    store().undo()
    expect(store().activeSheet().frozen).toBeUndefined()
  })
})

describe('並べ替えの列指定とヘッダ除外', () => {
  it('任意の列を基準にできる', () => {
    setCell('A1', 'x')
    setCell('B1', '3')
    setCell('A2', 'y')
    setCell('B2', '1')
    setCell('A3', 'z')
    setCell('B3', '2')
    store().setSelection({ row: 0, col: 0 }, { row: 2, col: 1 })
    store().sortSelection(1, true) // B 列で昇順
    expect([valueOf('B1'), valueOf('B2'), valueOf('B3')]).toEqual([1, 2, 3])
    expect([valueOf('A1'), valueOf('A2'), valueOf('A3')]).toEqual(['y', 'z', 'x'])
    expect(store().statusMessage).toBe('B 列で並べ替えました')
  })

  it('先頭行を見出しとして除外できる', () => {
    setCell('A1', '見出し')
    setCell('A2', '3')
    setCell('A3', '1')
    setCell('A4', '2')
    store().setSelection({ row: 0, col: 0 }, { row: 3, col: 0 })
    store().sortSelection(0, true, true)
    expect(valueOf('A1')).toBe('見出し')
    expect([valueOf('A2'), valueOf('A3'), valueOf('A4')]).toEqual([1, 2, 3])
  })
})

describe('書式のクリア', () => {
  it('内容は残して書式だけ消す', () => {
    setCell('A1', '値')
    store().setSelection({ row: 0, col: 0 })
    store().applyStyle({ bold: true, bg: '#FFF3BF' })
    expect(store().activeSheet().styles['A1']).toBeDefined()

    store().clearStyles()
    expect(store().activeSheet().styles['A1']).toBeUndefined()
    expect(valueOf('A1')).toBe('値')
  })
})

describe('フィルハンドル', () => {
  it('下方向へ連番を伸ばす', () => {
    setCell('A1', '1')
    setCell('A2', '2')
    store().setSelection({ row: 0, col: 0 }, { row: 1, col: 0 })
    store().fillFrom({ r0: 0, c0: 0, r1: 1, c1: 0 }, { r0: 0, c0: 0, r1: 4, c1: 0 })
    expect([valueOf('A3'), valueOf('A4'), valueOf('A5')]).toEqual([3, 4, 5])
  })

  it('右方向へ数式をずらして伸ばす', () => {
    setCell('A1', '10')
    setCell('B1', '20')
    setCell('A2', '=A1*2')
    store().setSelection({ row: 1, col: 0 })
    store().fillFrom({ r0: 1, c0: 0, r1: 1, c1: 0 }, { r0: 1, c0: 0, r1: 1, c1: 1 })
    expect(inputOf('B2')).toBe('=B1*2')
    expect(valueOf('B2')).toBe(40)
  })

  it('書式も一緒に伸びる', () => {
    setCell('A1', '1')
    store().setSelection({ row: 0, col: 0 })
    store().applyStyle({ bold: true })
    store().fillFrom({ r0: 0, c0: 0, r1: 0, c1: 0 }, { r0: 0, c0: 0, r1: 2, c1: 0 })
    expect(store().activeSheet().styles['A3']?.bold).toBe(true)
  })

  it('上方向にも伸ばせる', () => {
    setCell('A5', '5')
    setCell('A6', '6')
    store().setSelection({ row: 4, col: 0 }, { row: 5, col: 0 })
    store().fillFrom({ r0: 4, c0: 0, r1: 5, c1: 0 }, { r0: 2, c0: 0, r1: 5, c1: 0 })
    expect([valueOf('A4'), valueOf('A3')]).toEqual([4, 3])
  })

  it('undo で元に戻る', () => {
    setCell('A1', '1')
    setCell('A2', '2')
    store().fillFrom({ r0: 0, c0: 0, r1: 1, c1: 0 }, { r0: 0, c0: 0, r1: 3, c1: 0 })
    expect(valueOf('A3')).toBe(3)
    store().undo()
    expect(valueOf('A3')).toBeNull()
  })
})
