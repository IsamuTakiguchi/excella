import type { MenuAction } from '@shared/ipc'

/**
 * renderer の中で完結するメニュー通知。
 *
 * デスクトップ版はネイティブメニュー（main → preload → renderer）から
 * アクションが届くが、ブラウザ／PWA にはネイティブメニューが無い。
 * そこで画面上の「ファイル」メニューはここへ流し、App が両方を購読する。
 */
type Handler = (action: MenuAction) => void

const handlers = new Set<Handler>()

export function emitMenu(action: MenuAction): void {
  for (const handler of handlers) handler(action)
}

/** 購読する。戻り値で解除 */
export function onLocalMenu(handler: Handler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
