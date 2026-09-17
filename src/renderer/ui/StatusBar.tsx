import { useMemo } from 'react'
import { rangeToA1 } from '@shared/a1'
import { formatGeneral } from '@shared/numberFormat'
import { useStore } from '../store/workbookStore'

/** 選択範囲の合計・平均・データの個数を出す（Excel のステータスバー相当） */
export function StatusBar(): React.JSX.Element {
  const revision = useStore((s) => s.revision)
  const selection = useStore((s) => s.selection)
  const fileName = useStore((s) => s.fileName)
  const dirty = useStore((s) => s.dirty)
  const message = useStore((s) => s.statusMessage)
  const range = useStore((s) => s.selectionRange)()

  const stats = useMemo(() => {
    const engine = useStore.getState().engine
    const sheetId = useStore.getState().model.activeSheetId
    const values = engine.getRangeValues(sheetId, range)
    let sum = 0
    let numeric = 0
    let count = 0
    for (const row of values) {
      for (const value of row) {
        if (value === null || value === '') continue
        count++
        if (typeof value === 'number') {
          sum += value
          numeric++
        }
      }
    }
    return { sum, numeric, count }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, range.r0, range.c0, range.r1, range.c1])

  return (
    <div className="status-bar">
      <span className="file">
        {fileName}
        {dirty ? ' •' : ''}
      </span>
      <span className="sel">{rangeToA1(range)}</span>
      {stats.numeric > 0 ? (
        <>
          <span>合計: {formatGeneral(stats.sum)}</span>
          <span>平均: {formatGeneral(stats.sum / stats.numeric)}</span>
        </>
      ) : null}
      {stats.count > 0 ? <span>データの個数: {stats.count}</span> : null}
      <span className="spacer" />
      {message ? <span className="message">{message}</span> : null}
      <span className="cursor">
        R{selection.anchor.row + 1}C{selection.anchor.col + 1}
      </span>
    </div>
  )
}
