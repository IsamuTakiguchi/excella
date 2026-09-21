import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store/workbookStore'
import './styles.css'

// 自動テスト・スモークテスト用のフック。追加の権限は持たない単なる参照。
;(window as unknown as Record<string, unknown>).__excellaStore = useStore

const container = document.getElementById('root')
if (!container) throw new Error('#root がありません')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
