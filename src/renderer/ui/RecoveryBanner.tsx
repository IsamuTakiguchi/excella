import type { RecoverySnapshot } from '@shared/ipc'

/**
 * 起動時の「保存されていない変更があります」の帯（Excel のドキュメントの回復に相当）。
 * 復元すると未保存のまま開くので、残したければ保存してもらう。
 */
export function RecoveryBanner({
  snapshot,
  onRestore,
  onDiscard,
}: {
  snapshot: RecoverySnapshot
  onRestore: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const when = new Date(snapshot.savedAt).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div className="recovery-banner" role="alert" onMouseDown={(e) => e.preventDefault()}>
      <span className="recovery-text">
        <strong>保存されていない変更が見つかりました。</strong>
        {snapshot.fileName}（{when} 時点）
      </span>
      <span className="recovery-actions">
        <button className="primary" onClick={onRestore}>
          復元する
        </button>
        <button onClick={onDiscard}>破棄</button>
      </span>
    </div>
  )
}
