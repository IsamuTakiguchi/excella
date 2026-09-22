import { useEffect, useState } from 'react'

/**
 * CSS のメディアクエリを React から見る。
 *
 * 画面幅で「出し分け」ではなく「作りを変える」ところ（リボンをタブ式にするなど）は
 * CSS だけでは書けないので、JS 側でも同じ境目を見る。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange() // 初期値がずれている場合に合わせる（端末の回転など）
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
