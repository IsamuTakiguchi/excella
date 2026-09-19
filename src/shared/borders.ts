/**
 * 罫線の適用ロジック。
 *
 * Excel のツールバーと同じく「外枠」「格子」「下だけ」…といったプリセットで
 * 範囲に対してまとめて引く。どの辺を引くかは範囲内での位置によって決まるので、
 * その判定だけをここに純粋関数として切り出している。
 */

import type { Range } from './a1'
import type { BorderSide, BorderWeight, CellBorders } from './model'

export type BorderPreset =
  | 'all' // 格子（内側も外側も）
  | 'outer' // 外枠だけ
  | 'inner' // 内側だけ
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'none' // 罫線を消す

export const BORDER_PRESETS: Array<{ preset: BorderPreset; label: string; icon: string }> = [
  { preset: 'all', label: '格子', icon: '⊞' },
  { preset: 'outer', label: '外枠', icon: '▢' },
  { preset: 'inner', label: '内側', icon: '⊹' },
  { preset: 'top', label: '上罫線', icon: '⎺' },
  { preset: 'bottom', label: '下罫線', icon: '⎽' },
  { preset: 'left', label: '左罫線', icon: '▏' },
  { preset: 'right', label: '右罫線', icon: '▕' },
  { preset: 'none', label: '罫線なし', icon: '⌀' },
]

export const BORDER_WEIGHTS: Array<{ weight: BorderWeight; label: string }> = [
  { weight: 'thin', label: '細線' },
  { weight: 'medium', label: '中線' },
  { weight: 'thick', label: '太線' },
]

type Position = {
  /** 範囲内での位置 */
  isTop: boolean
  isBottom: boolean
  isLeft: boolean
  isRight: boolean
}

/**
 * プリセットに応じて、そのセルの四辺をどう変えるかを返す。
 * 値が `undefined` の辺は「変更しない」、`null` は「消す」を意味する。
 */
export function sidesForPreset(
  preset: BorderPreset,
  pos: Position,
): Record<keyof CellBorders, BorderSide | null | undefined> {
  const on = (yes: boolean): BorderSide | null | undefined => (yes ? ({} as BorderSide) : undefined)

  switch (preset) {
    case 'all':
      return { top: on(true), right: on(true), bottom: on(true), left: on(true) }
    case 'outer':
      return {
        top: on(pos.isTop),
        right: on(pos.isRight),
        bottom: on(pos.isBottom),
        left: on(pos.isLeft),
      }
    case 'inner':
      return {
        top: on(!pos.isTop),
        right: on(!pos.isRight),
        bottom: on(!pos.isBottom),
        left: on(!pos.isLeft),
      }
    case 'top':
      return { top: on(pos.isTop), right: undefined, bottom: undefined, left: undefined }
    case 'bottom':
      return { top: undefined, right: undefined, bottom: on(pos.isBottom), left: undefined }
    case 'left':
      return { top: undefined, right: undefined, bottom: undefined, left: on(pos.isLeft) }
    case 'right':
      return { top: undefined, right: on(pos.isRight), bottom: undefined, left: undefined }
    case 'none':
      return { top: null, right: null, bottom: null, left: null }
  }
}

/** 範囲内での位置を求める */
export function positionIn(range: Range, row: number, col: number): Position {
  return {
    isTop: row === range.r0,
    isBottom: row === range.r1,
    isLeft: col === range.c0,
    isRight: col === range.c1,
  }
}

/**
 * 既存の罫線にプリセットを重ねた結果を返す。
 * 引数は変更せず、新しいオブジェクトを返す。
 */
export function applyPreset(
  current: CellBorders | undefined,
  preset: BorderPreset,
  pos: Position,
  side: BorderSide,
): CellBorders {
  const next: CellBorders = { ...current }
  const changes = sidesForPreset(preset, pos)
  for (const key of ['top', 'right', 'bottom', 'left'] as Array<keyof CellBorders>) {
    const change = changes[key]
    if (change === undefined) continue // 触らない
    if (change === null) delete next[key]
    else next[key] = { ...side }
  }
  return next
}
