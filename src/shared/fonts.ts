/**
 * フォント名と、それを画面に描くときの CSS の font-family。
 *
 * Excel のフォント名をそのままモデルと xlsx に持ち、描くときだけ
 * 端末にありそうな同系統のフォントへ寄せる（Mac や Android に「游ゴシック」が無くても、
 * ゴシックはゴシック、明朝は明朝で出るように）。
 */

/** 画面の UI と同じ既定のフォント（styles.css の --font-sans と同じ順序） */
export const DEFAULT_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic UI", "Meiryo UI", "Hiragino Sans", "Noto Sans JP", sans-serif'

/** フォント名を省略したセルの表示名（Excel の既定と同じ） */
export const DEFAULT_FONT_NAME = '游ゴシック'

const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Noto Serif CJK JP", serif'
const MONO = '"Noto Sans Mono CJK JP", "Osaka-Mono", monospace'

/** リボンのフォント一覧。css は名前の後ろに続ける代わりのフォント */
export const FONTS: Array<{ name: string; css: string }> = [
  { name: '游ゴシック', css: `"Yu Gothic", YuGothic, ${DEFAULT_FONT_STACK}` },
  { name: 'メイリオ', css: `Meiryo, ${DEFAULT_FONT_STACK}` },
  { name: 'ＭＳ Ｐゴシック', css: `"MS PGothic", ${DEFAULT_FONT_STACK}` },
  { name: 'ＭＳ ゴシック', css: `"MS Gothic", ${MONO}` },
  { name: '游明朝', css: `"Yu Mincho", YuMincho, ${SERIF}` },
  { name: 'ＭＳ 明朝', css: `"MS Mincho", ${SERIF}` },
  { name: 'Arial', css: `Arial, Helvetica, ${DEFAULT_FONT_STACK}` },
  { name: 'Calibri', css: `Calibri, Carlito, ${DEFAULT_FONT_STACK}` },
  { name: 'Times New Roman', css: `"Times New Roman", Times, ${SERIF}` },
  { name: 'Courier New', css: `"Courier New", Courier, ${MONO}` },
]

/** リボンのフォントサイズ一覧（Excel と同じ） */
export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

/** 名前に含まれていたら明朝体として扱う語 */
const SERIF_HINTS = ['明朝', 'Mincho', 'Serif', 'Times', 'Georgia', 'Century']

/**
 * フォント名から Canvas に渡す font-family を作る。
 * 一覧に無い名前は、その名前を先頭に置いて既定（または明朝）へ落とす。
 */
export function fontFamilyOf(name: string | undefined): string {
  if (!name) return DEFAULT_FONT_STACK
  const known = FONTS.find((f) => f.name === name)
  if (known) return known.css
  // 引用符で囲むので、名前の中の引用符と \ は落とす（Canvas の font 指定が壊れないように）
  const safe = name.replace(/["\\]/g, '').trim()
  if (!safe) return DEFAULT_FONT_STACK
  const fallback = SERIF_HINTS.some((hint) => safe.includes(hint)) ? SERIF : DEFAULT_FONT_STACK
  return `"${safe}", ${fallback}`
}

/** 「フォントサイズの拡大／縮小」で次に進む大きさ。一覧の外なら近いものへ */
export function stepFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZES.find((s) => s > current) ?? current
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? current
}
