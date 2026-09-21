/**
 * xlsx のファイル読み書き。main プロセスでのみ動く。
 * 変換そのものは src/shared/xlsx.ts にあり、ここでは fs との橋渡しだけをする。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { workbookFromXlsxBuffer, xlsxBufferFromWorkbook, type XlsxResults } from '../../shared/xlsx'
import type { WorkbookModel } from '../../shared/model'

export async function workbookFromXlsx(filePath: string): Promise<WorkbookModel> {
  return workbookFromXlsxBuffer(await readFile(filePath))
}

export async function xlsxFromWorkbook(
  filePath: string,
  model: WorkbookModel,
  results?: XlsxResults,
): Promise<void> {
  await writeFile(filePath, await xlsxBufferFromWorkbook(model, results))
}
