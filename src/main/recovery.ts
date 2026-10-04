/**
 * 自動回復の控えの読み書き（main プロセスでのみ動く）。
 *
 * 書く場所は userData の下の固定のファイル 1 つだけ。renderer からは中身しか渡せず、
 * 場所は選べない（任意のパスへ書ける API は作らない、という設計を崩さないため）。
 * 書くときは一時ファイルに書いてから置き換え、書きかけで落ちても壊れた控えが残らないようにする。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecoverySnapshot } from '../shared/ipc'

export function recoveryPath(dir: string): string {
  return join(dir, 'recovery', 'workbook.json')
}

export async function writeRecovery(dir: string, snapshot: RecoverySnapshot): Promise<void> {
  const file = recoveryPath(dir)
  await mkdir(join(dir, 'recovery'), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(snapshot), 'utf8')
  await rename(temp, file)
}

/** 控えを読む。無い・壊れている・形が違うときは null（復元を勧めない） */
export async function readRecovery(dir: string): Promise<RecoverySnapshot | null> {
  try {
    const parsed = JSON.parse(await readFile(recoveryPath(dir), 'utf8')) as RecoverySnapshot
    const sheets = parsed?.model?.sheets
    if (!Array.isArray(sheets) || sheets.length === 0 || typeof parsed.savedAt !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function clearRecovery(dir: string): Promise<void> {
  await rm(recoveryPath(dir), { force: true })
}
