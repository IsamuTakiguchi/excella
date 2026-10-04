import { useState } from 'react'
import { enableAutoSave } from '../autosave'
import { bridge } from '../bridge'
import { focusGrid } from '../grid/focus'
import { useStore } from '../store/workbookStore'

/**
 * Excel のタイトル帯にある「自動保存」のスイッチ。
 * オンにする段取り（保存先を決める・確認を出す・書き込みの許可をもらう）は enableAutoSave に任せる。
 */
export function AutoSaveSwitch(): React.JSX.Element {
  const on = useStore((s) => s.autoSave)
  const [busy, setBusy] = useState(false)
  const unsupported = !bridge.supportsAutoSave

  const title = unsupported
    ? 'このブラウザではファイルへの自動保存ができません（保存していない変更は自動回復で守られます）'
    : on
      ? '自動保存：オン（変更を自動でファイルに上書きします）'
      : '自動保存：オフ（押すとオンにします）'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`autosave-switch${on ? ' on' : ''}`}
      disabled={busy || unsupported}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={async () => {
        if (on) {
          useStore.getState().setAutoSave(false)
          focusGrid()
          return
        }
        setBusy(true)
        try {
          await enableAutoSave()
        } finally {
          setBusy(false)
          focusGrid()
        }
      }}
    >
      <span className="autosave-label">自動保存</span>
      <span className="autosave-track" aria-hidden="true">
        <span className="autosave-knob" />
      </span>
      <span className="autosave-state">{on ? 'オン' : 'オフ'}</span>
    </button>
  )
}
