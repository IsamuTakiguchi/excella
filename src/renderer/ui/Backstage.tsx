import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { MenuAction } from '@shared/ipc'
import { isElectron } from '../bridge'
import { emitMenu } from '../menuBus'
import { useStore } from '../store/workbookStore'
import { AutoSaveSwitch } from './AutoSaveSwitch'

/**
 * 「ファイル」タブで開く全画面のメニュー（Excel の Backstage ビュー）。
 * 左に操作を並べ、右にブックの情報を出す。Esc か「←」で閉じる。
 */
export function Backstage({ onClose }: { onClose: () => void }): React.JSX.Element {
  const fileName = useStore((s) => s.fileName)
  const filePath = useStore((s) => s.filePath)
  const dirty = useStore((s) => s.dirty)
  const sheets = useStore((s) => s.model.sheets)
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // 開いている間はセル入力欄からフォーカスを外す（裏のセルに文字が入らないように）
    back.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const run = (action: MenuAction) => {
    onClose()
    emitMenu(action)
  }

  const hidden = sheets.filter((s) => s.hidden).length
  // ブラウザ版の path は上書き保存用の内部の鍵なので、場所としては見せない
  const location = isElectron ? (filePath ?? 'まだ保存されていません') : 'このブラウザ'

  // body 直下に出す。ツールバーの中に置くと、ツールバー用のボタンの見た目が漏れてくる
  return createPortal(
    <div className="backstage" role="dialog" aria-modal="true" aria-label="ファイル">
      <nav className="backstage-nav">
        <button ref={back} className="backstage-back" title="戻る (Esc)" onClick={onClose}>
          ←
        </button>
        <button className="active">情報</button>
        <button onClick={() => run('new')}>新規</button>
        <button onClick={() => run('open')}>開く</button>
        <hr />
        <button onClick={() => run('save')}>上書き保存</button>
        <button onClick={() => run('save-as')}>名前を付けて保存</button>
        <button onClick={() => run('export-csv')}>エクスポート（CSV）</button>
      </nav>

      <main className="backstage-main">
        <h1>情報</h1>
        <p className="backstage-file">{fileName}</p>

        <dl className="backstage-props">
          <dt>保存場所</dt>
          <dd>{location}</dd>
          <dt>シート</dt>
          <dd>
            {sheets.length} 枚{hidden > 0 ? `（うち非表示 ${hidden} 枚）` : ''}
          </dd>
          <dt>未保存の変更</dt>
          <dd>{dirty ? 'あり' : 'なし'}</dd>
        </dl>

        <section className="backstage-card">
          <h2>自動保存</h2>
          <AutoSaveSwitch />
          <p>
            オンにすると、変更を数秒ごとに開いているファイルへ上書きします。 Excella
            が対応していない要素（グラフ・ピボットテーブル・条件付き書式など）は、 上書きすると
            Excel のファイルから失われます。
          </p>
          <p>
            自動保存がオフでも、保存していない変更は自動回復用に控えてあり、
            アプリが不意に閉じても次に開いたときに戻せます。
          </p>
        </section>
      </main>
    </div>,
    document.body,
  )
}
