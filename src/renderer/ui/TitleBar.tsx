import { useStore } from '../store/workbookStore'
import { FileMenu } from './FileMenu'
import { LogoIcon } from './Icons'

/** Excel と同じ緑のタイトル帯。開いているファイル名と未保存の印を出す */
export function TitleBar(): React.JSX.Element {
  const fileName = useStore((s) => s.fileName)
  const dirty = useStore((s) => s.dirty)
  return (
    <div className="title-bar">
      <span className="logo">
        <LogoIcon />
      </span>
      <FileMenu />
      <span className="file">
        {fileName}
        {dirty ? ' *' : ''}
      </span>
      <span className="app-name">Excella</span>
    </div>
  )
}
