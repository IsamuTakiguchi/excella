/**
 * セル入力欄へフォーカスを戻す。
 *
 * 入力欄は透明で常にマウントされているが、グリッドやツールバーをクリックすると
 * ブラウザの既定動作でフォーカスがクリック先（フォーカス不可なら body）へ移り、
 * その瞬間からキー入力がどこにも届かなくなる。マウス操作の後は必ずこれを呼ぶ。
 */
export function focusGrid(): void {
  document.querySelector<HTMLTextAreaElement>('[data-grid-input]')?.focus()
}

/** その要素がセル入力欄そのものか */
export function isGridInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.dataset.gridInput === 'true'
}
