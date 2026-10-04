import { useStore } from '../store/workbookStore'
import { AutoSaveSwitch } from './AutoSaveSwitch'
import { LogoIcon } from './Icons'

/**
 * Excel と同じ緑のタイトル帯。左に自動保存のスイッチ、真ん中にファイル名と保存の状態。
 * 「ファイル」はリボンの先頭のタブにある（Excel と同じ位置）。
 */
export function TitleBar(): React.JSX.Element {
  const fileName = useStore((s) => s.fileName)
  const dirty = useStore((s) => s.dirty)
  const autoSave = useStore((s) => s.autoSave)
  const autoSaveState = useStore((s) => s.autoSaveState)

  // 自動保存がオンのときは、Excel と同じく「保存中…」「保存済み」を出す
  let status = ''
  if (autoSave) {
    if (autoSaveState === 'saving') status = '保存中…'
    else if (!dirty) status = '保存済み'
  }

  return (
    <div className="title-bar">
      <span className="logo">
        <LogoIcon />
      </span>
      <AutoSaveSwitch />
      <span className="file">
        {fileName}
        {dirty && !autoSave ? ' *' : ''}
      </span>
      {status ? <span className="save-status">{status}</span> : null}
      <span className="app-name">Excella</span>
    </div>
  )
}
