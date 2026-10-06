import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import i18n from '../i18n'

// docs/templates/react-core-files.md "src/api/axios.js". The tenant is resolved server-side from the Host; the base URL is relative.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['Accept-Language'] = i18n.language || 'bn'
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { addToast } = useUiStore.getState()
    const status = error.response?.status
    const code = error.response?.data?.error
    if (!error.response) addToast(i18n.t('errors.network'), 'error')
    else if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      useAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') window.location.assign('/login')
    } else if (status === 403 && code !== 'must_change_password') addToast(i18n.t('errors.forbidden'), 'error')
    else if (status === 429) addToast(i18n.t('errors.too_many'), 'warning')
    else if (status >= 500) addToast(i18n.t('errors.server'), 'error')
    return Promise.reject(error)
  },
)

export default api
