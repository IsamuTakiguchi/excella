import { useState } from 'react'
import { useStore } from '../store/workbookStore'

export function SheetTabs(): React.JSX.Element {
  const model = useStore((s) => s.model)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const store = () => useStore.getState()

  return (
    <div className="sheet-tabs">
      <button className="add-sheet" title="シートを追加" onClick={() => store().addSheet()}>
        ＋
      </button>
      {model.sheets.map((sheet) => {
        const active = sheet.id === model.activeSheetId
        if (renaming === sheet.id) {
          return (
            <input
              key={sheet.id}
              className="sheet-rename"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  store().renameSheet(sheet.id, draft)
                  setRenaming(null)
                }
                if (e.key === 'Escape') setRenaming(null)
              }}
              onBlur={() => {
                store().renameSheet(sheet.id, draft)
                setRenaming(null)
              }}
            />
          )
        }
        return (
          <div
            key={sheet.id}
            className={`sheet-tab${active ? ' active' : ''}`}
            onClick={() => store().setActiveSheet(sheet.id)}
            onDoubleClick={() => {
              setRenaming(sheet.id)
              setDraft(sheet.name)
            }}
            title="ダブルクリックで名前を変更"
          >
            <span>{sheet.name}</span>
            {model.sheets.length > 1 ? (
              <button
                className="close"
                title="シートを削除"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`シート「${sheet.name}」を削除しますか？`)) {
                    store().removeSheet(sheet.id)
                  }
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
