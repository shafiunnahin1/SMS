import { render, screen, act, cleanup } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { I18nProvider, useLocale } from '../ui/I18nProvider'
import { useInstitutionStore } from '../store/institutionStore'
import { useAuthStore } from '../store/authStore'
import api from '../api/axios'

// docs/I18N.md section 14 "I18nProviderTest": lang, dir and data-locale land on <html>; a language that is not enabled falls back to
// the default; switching needs no reload (i18next changes in place) and is remembered; the axios layer sends the language.
function Probe() {
  const { locale, setLocale } = useLocale()
  const { t } = useTranslation()
  return <><span data-testid="loc">{locale}</span><button type="button" onClick={() => setLocale('en')}>en</button><span>{t('common.save')}</span></>
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* no storage */ }
  useAuthStore.setState({ user: null, isAuthenticated: false })
  useInstitutionStore.setState({ locales: { default: 'bn', enabled: ['bn', 'en'] } })
})
afterEach(cleanup)

it('puts lang, dir and data-locale on <html> and switches without a reload', async () => {
  render(<I18nProvider><Probe /></I18nProvider>)
  expect(document.documentElement.lang).toBe('bn')
  expect(document.documentElement.dir).toBe('ltr')
  expect(document.documentElement.dataset.locale).toBe('bn')
  expect(screen.getByText('সংরক্ষণ')).toBeInTheDocument()

  await act(async () => screen.getByRole('button', { name: 'en' }).click())
  expect(screen.getByTestId('loc')).toHaveTextContent('en')
  expect(document.documentElement.lang).toBe('en')
  expect(screen.getByText('Save')).toBeInTheDocument()
  expect(localStorage.getItem('locale')).toBe('en')
})

it('a remembered language the institution switched off falls back to the default', () => {
  localStorage.setItem('locale', 'en')
  useInstitutionStore.setState({ locales: { default: 'bn', enabled: ['bn'] } })
  render(<I18nProvider><Probe /></I18nProvider>)
  expect(screen.getByTestId('loc')).toHaveTextContent('bn')
  expect(document.documentElement.lang).toBe('bn')
})

it('a signed-in user switching saves users.locale on the server', async () => {
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })
  useAuthStore.setState({ user: { id: 1, locale: 'bn' }, isAuthenticated: true })
  render(<I18nProvider><Probe /></I18nProvider>)
  await act(async () => screen.getByRole('button', { name: 'en' }).click())
  expect(put).toHaveBeenCalledWith('/auth/locale', { locale: 'en' })
  expect(useAuthStore.getState().user.locale).toBe('en')
  put.mockRestore()
})

it('every API request carries the current language as a bare code (D53)', async () => {
  await i18n.changeLanguage('en')
  const config = await api.interceptors.request.handlers[0].fulfilled({ headers: {} })
  expect(config.headers['Accept-Language']).toBe('en')
  await i18n.changeLanguage('bn')
})
