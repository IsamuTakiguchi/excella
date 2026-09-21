import { useMemo } from 'react'
import { rangeToA1 } from '@shared/a1'
import { formatGeneral } from '@shared/numberFormat'
import { useStore } from '../store/workbookStore'

/** 選択範囲の平均・個数・合計を出す（Excel のステータスバーと同じ並び） */
export function StatusBar(): React.JSX.Element {
  const revision = useStore((s) => s.revision)
  const selection = useStore((s) => s.selection)
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
      <span className="ready">{message || '準備完了'}</span>
      <span className="spacer" />
      {stats.numeric > 0 ? <span>平均: {formatGeneral(stats.sum / stats.numeric)}</span> : null}
      {stats.count > 0 ? <span>データの個数: {stats.count}</span> : null}
      {stats.numeric > 0 ? <span>合計: {formatGeneral(stats.sum)}</span> : null}
      <span className="sel" title={`R${selection.anchor.row + 1}C${selection.anchor.col + 1}`}>
        {rangeToA1(range)}
      </span>
    </div>
  )
}
