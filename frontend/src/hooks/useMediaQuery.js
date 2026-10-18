import { useEffect, useState } from 'react'

export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [query])
  return matches
}
