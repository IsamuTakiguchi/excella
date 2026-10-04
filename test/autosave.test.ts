import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoPersistence } from '../src/renderer/autosave'
import { useStore } from '../src/renderer/store/workbookStore'
import type { RecoverySnapshot } from '../src/shared/ipc'

const store = () => useStore.getState()

/** 保存 API の偽物。呼ばれた回数と最後の控えを覚える */
function fakeApi(canSave = true) {
  return {
    recovery: null as RecoverySnapshot | null,
    saves: 0,
    clears: 0,
    saveRecovery: vi.fn(async function (this: void, s: RecoverySnapshot) {
      api.recovery = s
    }),
    clearRecovery: vi.fn(async () => {
      api.clears++
      api.recovery = null
    }),
    canAutoSave: (path: string | null) => canSave && path !== null,
  }
}
let api = fakeApi()

/** saveCurrent と同じく、保存したときのモデルを markSaved に渡す */
const fakeSave = vi.fn(async () => {
  const model = store().model
  api.saves++
  store().markSaved('/tmp/book.xlsx', 'book.xlsx', { silent: true, model })
  return true
})

let persistence: ReturnType<typeof createAutoPersistence>

beforeEach(() => {
  vi.useFakeTimers()
  store().newWorkbook()
  api = fakeApi()
  fakeSave.mockClear()
  persistence = createAutoPersistence({
    api,
    store: useStore,
    save: fakeSave,
    recoveryDelay: 1000,
    autoSaveDelay: 2000,
  })
})

afterEach(() => {
  persistence.stop()
  vi.useRealTimers()
})

describe('自動回復', () => {
  it('変更から少し待って控えを書く（打鍵のたびには書かない）', async () => {
    store().setCellInput({ row: 0, col: 0 }, 'a')
    store().setCellInput({ row: 0, col: 1 }, 'b')
    await vi.advanceTimersByTimeAsync(900)
    expect(api.saveRecovery).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(api.saveRecovery).toHaveBeenCalledTimes(1)
    expect(api.recovery?.model.sheets[0].cells['B1']).toEqual({ v: 'b' })
  })

  it('保存されたら控えを消す', async () => {
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(1100)
    store().markSaved('/tmp/book.xlsx', 'book.xlsx')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.clearRecovery).toHaveBeenCalled()
    expect(api.recovery).toBeNull()
  })

  it('flush で待たずに書ける（画面を離れるとき用）', async () => {
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await persistence.flush()
    expect(api.saveRecovery).toHaveBeenCalledTimes(1)
  })
})

describe('自動保存', () => {
  /** 保存済みのファイルを開いて自動保存をオンにした状態 */
  const openSavedFile = async () => {
    store().markSaved('/tmp/book.xlsx', 'book.xlsx')
    store().setAutoSave(true)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('オフのあいだは保存しない', async () => {
    store().markSaved('/tmp/book.xlsx', 'book.xlsx')
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fakeSave).not.toHaveBeenCalled()
  })

  it('オンなら変更から少し待って上書きし、保存済みになる', async () => {
    await openSavedFile()
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(2100)
    expect(fakeSave).toHaveBeenCalledTimes(1)
    expect(store().dirty).toBe(false)
    expect(store().autoSaveState).toBe('saved')
  })

  it('セルの編集中は確定を待つ', async () => {
    await openSavedFile()
    store().setCellInput({ row: 0, col: 0 }, 'a')
    store().beginEdit({ row: 1, col: 0 }, 'x')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fakeSave).not.toHaveBeenCalled()
    store().commitEdit()
    await vi.advanceTimersByTimeAsync(2100)
    expect(fakeSave).toHaveBeenCalled()
    expect(store().dirty).toBe(false)
  })

  it('保存中に打った変更は、もう一度保存する', async () => {
    await openSavedFile()
    // 1 回目の保存の最中に編集が入る
    fakeSave.mockImplementationOnce(async () => {
      const model = store().model
      store().setCellInput({ row: 5, col: 5 }, '保存中の変更')
      store().markSaved('/tmp/book.xlsx', 'book.xlsx', { silent: true, model })
      return true
    })
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(2100)
    // 保存したのは編集前のモデルなので、まだ未保存
    expect(store().dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(2100)
    expect(fakeSave).toHaveBeenCalledTimes(2)
    expect(store().dirty).toBe(false)
  })

  it('保存に失敗したら自動保存をオフにして知らせる', async () => {
    await openSavedFile()
    fakeSave.mockImplementationOnce(async () => {
      throw new Error('書き込みできません')
    })
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(2100)
    expect(store().autoSave).toBe(false)
    expect(store().statusMessage).toContain('自動保存をオフ')
  })

  it('xlsx として保存していないブックには書かない', async () => {
    persistence.stop()
    api = fakeApi(false)
    persistence = createAutoPersistence({ api, store: useStore, save: fakeSave })
    store().setAutoSave(true)
    store().setCellInput({ row: 0, col: 0 }, 'a')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fakeSave).not.toHaveBeenCalled()
  })
})
