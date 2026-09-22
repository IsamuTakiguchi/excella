/**
 * 実行している端末の性質を見る小さなモジュール。
 *
 * ストアからもグリッドからも使うので、どちらにも依存しないところに置く
 * （`focus.ts` に置くとストアとの循環参照になる）。
 */

/** スマホ幅と判断する境目（px）。余白や表示項目を削る */
export const NARROW_WIDTH = 720

/**
 * リボンをタブ式に切り替える条件。
 *
 * 幅 1280px でちょうど 1 段に収まることを実測したので、それ未満はタブにする。
 * 横向きのスマホのように縦が短いときも、3 段のリボンで画面を埋めないようタブにする。
 */
export const COMPACT_RIBBON = '(max-width: 1279px), (max-height: 500px)'

let touchDevice: boolean | null = null

function media(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  )
}

/**
 * 主な入力がタッチ（スマホ・タブレット）か。
 * マウスのある PC ではタッチ画面付きでも false になる（pointer: coarse は「主な」入力を見る）。
 */
export function isTouchDevice(): boolean {
  if (touchDevice === null) touchDevice = media('(pointer: coarse)')
  return touchDevice
}

/** テスト・スモーク用：判定を上書きする */
export function setTouchDeviceForTest(value: boolean | null): void {
  touchDevice = value
}

/**
 * 初期の表示倍率。指で押せる大きさにしたいので、タッチ端末は少し大きく始める。
 * 以後はユーザーがステータスバーから変えられる。
 */
export function defaultZoom(): number {
  return isTouchDevice() ? 1.3 : 1
}
