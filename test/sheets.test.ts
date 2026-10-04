import { describe, expect, it } from 'vitest'
import {
  copySheetName,
  MAX_SHEET_NAME,
  moveTargetIndex,
  nearestVisibleIndex,
  sheetNameError,
} from '../src/shared/sheets'

describe('シート名の規則', () => {
  it('ふつうの名前は通す', () => {
    expect(sheetNameError('売上')).toBeNull()
    expect(sheetNameError('2024年 4月')).toBeNull()
  })

  it('空・長すぎる・使えない文字は理由を返す', () => {
    expect(sheetNameError('  ')).not.toBeNull()
    expect(sheetNameError('a'.repeat(MAX_SHEET_NAME + 1))).not.toBeNull()
    for (const ch of [':', '\\', '/', '?', '*', '[', ']']) {
      expect(sheetNameError(`a${ch}b`)).not.toBeNull()
    }
    expect(sheetNameError("'売上")).not.toBeNull()
  })
})

describe('コピーしたシートの名前', () => {
  it('Excel と同じく (2) (3) と付ける', () => {
    expect(copySheetName(['Sheet1'], 'Sheet1')).toBe('Sheet1 (2)')
    expect(copySheetName(['Sheet1', 'Sheet1 (2)'], 'Sheet1')).toBe('Sheet1 (3)')
  })

  it('コピーのコピーは元の名前に番号を振り直す', () => {
    expect(copySheetName(['Sheet1', 'Sheet1 (2)'], 'Sheet1 (2)')).toBe('Sheet1 (3)')
  })

  it('31 文字を超えないよう元の名前を詰める', () => {
    const long = 'あ'.repeat(MAX_SHEET_NAME)
    const name = copySheetName([long], long)
    expect(name.length).toBeLessThanOrEqual(MAX_SHEET_NAME)
    expect(name.endsWith(' (2)')).toBe(true)
  })
})

describe('代わりに表示するシート', () => {
  it('左隣を優先し、無ければ右隣', () => {
    expect(nearestVisibleIndex([false, false, false], 1)).toBe(0)
    expect(nearestVisibleIndex([false, false, false], 0)).toBe(1)
  })

  it('隠れているシートは飛ばす', () => {
    expect(nearestVisibleIndex([false, true, false], 2)).toBe(0)
    expect(nearestVisibleIndex([true, false, true, false], 0)).toBe(1)
  })

  it('表示中のシートが無ければ -1', () => {
    expect(nearestVisibleIndex([true, false, true], 1)).toBe(-1)
  })
})

describe('移動先の位置', () => {
  it('前へ動かすときはそのまま、後ろへ動かすときは 1 つずれる', () => {
    expect(moveTargetIndex(2, 0, 4)).toBe(0)
    expect(moveTargetIndex(0, 4, 4)).toBe(3) // 末尾へ
    expect(moveTargetIndex(0, 2, 4)).toBe(1) // 2 番目の前 = 移動後の 1 番
    expect(moveTargetIndex(1, 1, 4)).toBe(1) // 自分の前 = 動かない
    expect(moveTargetIndex(1, 2, 4)).toBe(1) // 自分の次の前 = 動かない
  })
})
