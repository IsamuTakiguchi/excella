import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Addr } from '@shared/a1'
import { useStore, type Editing } from '../store/workbookStore'
import { isTouchDevice } from './focus'

type Props = {
  editing: Editing
  left: number
  top: number
  width: number
  height: number
}

/**
 * セルの入力欄。**常にマウントされていて、常にフォーカスを持つ**のが要点。
 *
 * 日本語入力（IME）は編集可能な要素にフォーカスが無いと変換が始まらない。
 * 編集開始時に初めて textarea を作る方式だと、
 *   - セルを選んでいきなり「あ」と打っても何も起きない
 *   - 変換を確定する Enter でセルまで確定してしまう
 * という 2 つの問題が起きる。そこで透明な textarea を常に置いておき、
 * 入力や変換開始をきっかけに編集モードへ移る。
 *
 * value は React で制御しない（uncontrolled）。変換中に value を書き戻すと
 * IME の未確定文字列が壊れるため、同期は composition の外でだけ行う。
 */
export function CellInput({ editing, left, top, width, height }: Props): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)

  // ストア側の内容を入力欄へ反映する（変換中は触らない）
  useEffect(() => {
    const el = ref.current
    if (!el || composing.current) return
    const next = editing ? editing.text : ''
    if (el.value !== next) {
      el.value = next
      el.setSelectionRange(next.length, next.length)
    }
  }, [editing])

  // 入力欄は常にフォーカスを持たせておく（IME の変換がここで始まる）。
  // ただしタッチ端末ではフォーカス＝ソフトキーボード表示なので、編集中だけにする
  useEffect(() => {
    if (!isTouchDevice()) ref.current?.focus()
  }, [])

  // タッチ端末：編集開始でキーボードを出し、終了で引っ込める。
  // iOS はユーザー操作と同じタスク内の focus() しか受け付けないので layout effect で行う
  useLayoutEffect(() => {
    if (!isTouchDevice()) return
    const el = ref.current
    if (!el) return
    if (editing) el.focus()
    else if (document.activeElement === el) el.blur()
  }, [editing])

  const store = () => useStore.getState()
  /** 編集を始めるセル。props では再描画前の古い値になりうるので毎回ストアから読む */
  const activeAddr = (): Addr => useStore.getState().selection.anchor

  /** 入力欄の現在値をストアへ送ってから確定する */
  const commit = (move?: { dRow: number; dCol: number }) => {
    const el = ref.current
    if (el) store().updateEdit(el.value)
    store().commitEdit(move)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 変換中のキーは IME のもの。ここで横取りするとセルまで確定してしまう
    if (e.nativeEvent.isComposing || composing.current) {
      e.stopPropagation()
      return
    }
    if (!editing) return // 編集していないときの移動キーは親が処理する

    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      commit({ dRow: 1, dCol: 0 })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'Tab') {
      commit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'Escape') {
      store().cancelEdit()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // 直接入力で始まった編集は矢印キーで確定する（Excel と同じ挙動）
    if (editing.typing && e.key.startsWith('Arrow')) {
      const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      commit({ dRow, dCol })
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const text = e.currentTarget.value
    if (editing) store().updateEdit(text)
    else store().beginEdit(activeAddr(), text) // 直接入力で編集を開始
  }

  return (
    <textarea
      ref={ref}
      data-grid-input="true"
      className={editing ? 'cell-input editing' : 'cell-input'}
      spellCheck={false}
      autoComplete="off"
      onInput={onInput}
      onKeyDown={onKeyDown}
      onCompositionStart={() => {
        composing.current = true
        // 変換が始まった時点で編集モードへ。textarea 自体は作り直さないので
        // 変換は途切れない
        if (!useStore.getState().editing) store().beginEdit(activeAddr(), '')
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        store().updateEdit(e.currentTarget.value)
      }}
      onBlur={(e) => {
        if (useStore.getState().editing) commit()
        // フォーカスの行き先が無い（body に落ちた）なら取り戻す。
        // 他の入力欄やボタンへ移ったときは邪魔しない。
        // タッチ端末ではキーボードを閉じたいので取り戻さない
        if (e.relatedTarget === null && !isTouchDevice()) {
          const el = e.currentTarget
          setTimeout(() => {
            if (document.activeElement === document.body) el.focus()
          }, 0)
        }
      }}
      style={
        editing
          ? { left, top, minWidth: width, minHeight: height }
          : { left, top, width: 1, height: 1 }
      }
    />
  )
}
