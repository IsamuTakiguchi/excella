import { isTouchDevice } from '../device'
import { useStore } from '../store/workbookStore'

/**
 * セル入力欄へフォーカスを戻す。
 *
 * 入力欄は透明で常にマウントされているが、グリッドやツールバーをクリックすると
 * ブラウザの既定動作でフォーカスがクリック先（フォーカス不可なら body）へ移り、
 * その瞬間からキー入力がどこにも届かなくなる。マウス操作の後は必ずこれを呼ぶ。
 *
 * タッチ端末では入力欄にフォーカスするとソフトキーボードが出てしまうので、
 * 編集中でなければ何もしない（編集開始時に CellInput 自身がフォーカスする）。
 */
export function focusGrid(): void {
  if (isTouchDevice() && !useStore.getState().editing) return
  gridInput()?.focus()
}

/** セル入力欄の要素。キャレット位置を読むのにも使う */
export function gridInput(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('[data-grid-input]')
}

/** その要素がセル入力欄そのものか */
export function isGridInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.dataset.gridInput === 'true'
}
