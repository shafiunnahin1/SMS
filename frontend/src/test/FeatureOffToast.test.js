import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'

// D205: a 403 `feature_off` says the institution switched the feature off, not the generic "not allowed"
describe('feature_off message (D205)', () => {
  const reject = api.interceptors.response.handlers.find(h => h)?.rejected
  beforeEach(() => { i18n.changeLanguage('en'); useUiStore.setState({ toasts: [] }) })

  it('names the switch instead of a generic refusal', async () => {
    await expect(reject({ response: { status: 403, data: { error: 'feature_off' } }, config: {} })).rejects.toBeTruthy()
    await expect(reject({ response: { status: 403, data: { error: 'forbidden' } }, config: {} })).rejects.toBeTruthy()
    const texts = useUiStore.getState().toasts.map(t => t.message ?? t.text ?? t)
    expect(JSON.stringify(texts)).toContain('Your institution has switched this off for you')
    expect(JSON.stringify(texts)).toContain('You are not allowed to do this')
  })
})
