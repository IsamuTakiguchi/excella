/**
 * フィルハンドル（選択範囲の右下をドラッグして値を伸ばす操作）の中身。
 *
 * Excel の挙動に寄せる:
 * - 数値が 2 つ以上あり等差なら、その差で連番を続ける
 * - 数値が 1 つだけならコピー（Excel の既定と同じ）
 * - 「第 1 週」のように数字を含む文字列は、いちばん右の数字を増やす
 * - それ以外は元の並びを繰り返す
 */

import type { CellData } from './model'
import { adjustFormula } from './refAdjust'

/**
 * いちばん右にある数字を取り出す。Excel と同じく末尾に限らない。
 * '第 1 週' → { prefix: '第 ', n: 1, suffix: ' 週' }
 */
function splitLastNumber(
  text: string,
): { prefix: string; n: number; width: number; suffix: string } | null {
  // 前半は「非数字で終わるか空」に限定しないと、貪欲に数字まで飲み込んで
  // 'No.008' の桁数を取り違える
  const m = /^(.*\D|)(\d+)(\D*)$/.exec(text)
  if (!m) return null
  return { prefix: m[1], n: Number(m[2]), width: m[2].length, suffix: m[3] }
}

/** 元の並びが等差数列なら、その公差を返す */
function arithmeticStep(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length !== values.length || nums.length < 2) return null
  const step = nums[1] - nums[0]
  for (let i = 2; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] !== step) return null
  }
  return step
}

/**
 * 元データ（source）を count 個ぶん伸ばした結果を返す。
 * `offsetOf(i)` は i 番目の出力が元データの何マスぶん先かを表し、
 * 数式の相対参照を補正するのに使う。
 */
export function fillSeries(
  source: Array<CellData | null>,
  count: number,
  offsetAxis: 'row' | 'col',
  /** 出力の i 番目が、元データの先頭から何マス離れているか */
  distanceOf: (i: number) => number,
): Array<CellData | null> {
  const out: Array<CellData | null> = []
  const len = source.length
  if (len === 0) return out

  const numbers = source.map((cell) =>
    cell && cell.f === undefined && typeof cell.v === 'number' ? cell.v : null,
  )
  const step = arithmeticStep(numbers)
  const last = numbers[len - 1]

  for (let i = 0; i < count; i++) {
    const src = source[i % len]
    const round = Math.floor(i / len) + 1

    // 数式は相対参照をずらしてコピー
    if (src?.f !== undefined) {
      const distance = distanceOf(i)
      const dRow = offsetAxis === 'row' ? distance : 0
      const dCol = offsetAxis === 'col' ? distance : 0
      out.push({ f: adjustFormula(src.f, dRow, dCol) })
      continue
    }

    // 等差の数値なら続きを作る
    if (step !== null && last !== null) {
      out.push({ v: last + step * (i + 1) })
      continue
    }

    // 数字を含む文字列なら、その数字を増やす
    if (src && typeof src.v === 'string') {
      const parts = splitLastNumber(src.v)
      if (parts) {
        const next = parts.n + round
        const digits = String(next).padStart(parts.width, '0')
        out.push({ v: `${parts.prefix}${digits}${parts.suffix}` })
        continue
      }
    }

    out.push(src ? { ...src } : null)
  }
  return out
}
