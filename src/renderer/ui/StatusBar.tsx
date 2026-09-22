import { useMemo } from 'react'
import { rangeToA1 } from '@shared/a1'
import { formatGeneral } from '@shared/numberFormat'
import { NARROW_WIDTH } from '../device'
import { MAX_ZOOM, MIN_ZOOM } from '../grid/geometry'
import { useStore } from '../store/workbookStore'
import { useMediaQuery } from '../useMediaQuery'

/** 選択範囲の平均・個数・合計を出す（Excel のステータスバーと同じ並び） */
export function StatusBar(): React.JSX.Element {
  const revision = useStore((s) => s.revision)
  const selection = useStore((s) => s.selection)
  const message = useStore((s) => s.statusMessage)
  const editing = useStore((s) => s.editing)
  const pointing = useStore((s) => s.pointing)
  const zoom = useStore((s) => s.zoom)
  const narrow = useMediaQuery(`(max-width: ${NARROW_WIDTH}px)`)
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

  // Excel と同じく、入力の状態を左端に出す（参照選択中だと分かるように）
  const modeLabel = (): string => {
    if (pointing) return '参照'
    if (!editing) return ''
    return editing.typing ? '入力' : '編集'
  }

  return (
    <div className="status-bar">
      <span className="ready">{modeLabel() || message || '準備完了'}</span>
      <span className="spacer" />
      {/* 狭い画面では合計だけ残す（平均と個数は場所を食うわりに使う場面が少ない） */}
      {!narrow && stats.numeric > 0 ? (
        <span>平均: {formatGeneral(stats.sum / stats.numeric)}</span>
      ) : null}
      {!narrow && stats.count > 0 ? <span>データの個数: {stats.count}</span> : null}
      {stats.numeric > 0 ? <span>合計: {formatGeneral(stats.sum)}</span> : null}
      <span className="sel" title={`R${selection.anchor.row + 1}C${selection.anchor.col + 1}`}>
        {rangeToA1(range)}
      </span>
      {/* 表示倍率。指で押す端末では既定から大きめに始まる */}
      <span className="zoom" onMouseDown={(e) => e.preventDefault()}>
        <button
          title="表示を小さく"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => useStore.getState().setZoom(zoom - 0.1)}
        >
          −
        </button>
        <button
          className="level"
          title="表示倍率を 100% に戻す"
          onClick={() => useStore.getState().setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          title="表示を大きく"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => useStore.getState().setZoom(zoom + 0.1)}
        >
          ＋
        </button>
      </span>
    </div>
  )
}
