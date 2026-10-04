import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearRecovery, readRecovery, recoveryPath, writeRecovery } from '../src/main/recovery'
import { createWorkbook } from '../src/shared/model'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'excella-recovery-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const snapshot = () => ({
  model: createWorkbook(),
  fileName: 'book.xlsx',
  filePath: '/tmp/book.xlsx',
  savedAt: 1700000000000,
})

describe('自動回復の控え（デスクトップ）', () => {
  it('書いて読める', async () => {
    const s = snapshot()
    await writeRecovery(dir, s)
    expect(await readRecovery(dir)).toEqual(s)
  })

  it('無ければ null', async () => {
    expect(await readRecovery(dir)).toBeNull()
  })

  it('消すと null になり、2 回消しても失敗しない', async () => {
    await writeRecovery(dir, snapshot())
    await clearRecovery(dir)
    expect(await readRecovery(dir)).toBeNull()
    await clearRecovery(dir)
  })

  it('壊れた控えや形の違う控えは復元を勧めない', async () => {
    await mkdir(join(dir, 'recovery'), { recursive: true })
    await writeFile(recoveryPath(dir), '{ 書きかけ', 'utf8')
    expect(await readRecovery(dir)).toBeNull()
    await writeFile(recoveryPath(dir), JSON.stringify({ model: { sheets: [] }, savedAt: 1 }))
    expect(await readRecovery(dir)).toBeNull()
  })

  it('一時ファイルを残さない（置き換えで書く）', async () => {
    await writeRecovery(dir, snapshot())
    await writeRecovery(dir, snapshot())
    expect(await readdir(join(dir, 'recovery'))).toEqual(['workbook.json'])
  })
})
