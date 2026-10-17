import { lazy, Suspense, useMemo } from 'react'
import { useUI } from './UIProvider'
import { DEFAULT_VIEWS } from './defaultViews'
import Loader from '../components/Loader'

// docs/UI-PACKS.md section 4: the page passes the hook's { state, data, actions }; the pack decides the presentation
export default function PageSlot({ name, ...hook }) {
  const { views } = useUI()
  const Default = DEFAULT_VIEWS[name]
  const Alt = useMemo(() => (views[name] ? lazy(views[name]) : null), [views, name])
  const View = Alt ?? Default
  return <Suspense fallback={<Loader type="skeleton" rows={6} />}><View {...hook} /></Suspense>
}
