import { useMemo } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import ThemeProvider from './theme/ThemeProvider'
import { I18nProvider } from './ui/I18nProvider'
import { UIProvider } from './ui/UIProvider'
import { useInstitutionStore } from './store/institutionStore'
import { makeRouter } from './router'
import Loader from './components/Loader'
import Toaster from './components/Toaster'
import { ErrorState } from './components/StateViews'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

function Routes() {
  const { t } = useTranslation()
  const { ready, error, isCentral, loadBootstrap } = useInstitutionStore()
  const router = useMemo(() => (ready && !error ? makeRouter(isCentral) : null), [ready, error, isCentral])
  // Until /bootstrap answers (and there is no cached copy) a neutral page skeleton - never the default blue theme
  if (!ready) return <Loader type="page" fullScreen />
  if (error) return <div className="min-h-screen flex items-center justify-center"><ErrorState message={t('errors.bootstrap')} onRetry={loadBootstrap} /></div>
  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <UIProvider>
            <Routes />
            <Toaster />
          </UIProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
