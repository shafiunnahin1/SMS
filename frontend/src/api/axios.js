import axios from 'axios'
import { useUiStore } from '../store/uiStore'
import i18n from '../i18n'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'

// docs/templates/react-core-files.md "src/api/axios.js". The tenant is resolved server-side from the Host; the base URL is relative.
// D51: the web is authenticated by its same-origin session cookie (sent automatically) + Sanctum's XSRF-TOKEN cookie, which axios echoes
// as X-XSRF-TOKEN on same-origin requests. The auth store is imported lazily (it imports this file) - no module cycle at load time.
let authStore = null
export const bindAuthStore = (store) => { authStore = store }
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = authStore?.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['Accept-Language'] = i18n.language || 'bn'
  // D169 STW.1 (D91): a staff member's request names the selected department; the API checks the duty key there
  const department = useStaffDepartmentStore.getState().department
  if (department && authStore?.getState().role === 'institution_staff') config.headers['X-Department-Id'] = String(department.id)
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { addToast } = useUiStore.getState()
    const status = error.response?.status
    const code = error.response?.data?.error
    if (!error.response) addToast(i18n.t('errors.network'), 'error')
    else if (status === 401 && !error.config?.skipAuthRedirect && !error.config?.url?.includes('/auth/login')) {
      authStore?.getState().clearAuth()                       // the session ended (logout elsewhere, idle limit, force-logout)
      if (window.location.pathname !== '/login') window.location.assign('/login')
    } else if (status === 419) addToast(i18n.t('errors.expired'), 'warning')         // CSRF token expired (D51)
    else if (status === 403 && code !== 'must_change_password') addToast(i18n.t('errors.forbidden'), 'error')
    else if (status === 429) addToast(i18n.t('errors.too_many'), 'warning')
    else if (status >= 500) addToast(i18n.t('errors.server'), 'error')
    return Promise.reject(error)
  },
)

export default api
