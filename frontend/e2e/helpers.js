import { expect } from '@playwright/test'
import { TENANTS } from '../playwright.config.js'

export const tenantOf = (testInfo) => TENANTS[testInfo.project.metadata.tenant]

// Not app errors: the Vite DEV server's hot-reload socket (absent from a build), and the browser's own line for a failed request -
// failed requests are judged below by URL instead, because the line carries no URL.
const IGNORED = [/WebSocket connection to 'ws:\/\/[^']+' failed/, /\[vite\]/, /^Failed to load resource/]
// Expected answers: the signed-out session probe on the login page (D51: GET /auth/me says 401 until someone logs in)
const EXPECTED_HTTP = [{ method: 'GET', path: '/api/v1/auth/me', status: 401 }]

/** Fails the test on a console error, an uncaught page error or an unexpected 4xx/5xx API answer (E2E-TESTING.md F1) */
export function watchConsole(page) {
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !IGNORED.some(re => re.test(m.text()))) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => {
    const url = new URL(r.url())
    if (r.status() < 400 || !url.pathname.startsWith('/api/')) return
    const ok = EXPECTED_HTTP.some(e => e.method === r.request().method() && e.path === url.pathname && e.status === r.status())
    if (!ok) errors.push(`${r.request().method()} ${url.pathname} -> ${r.status()}`)
  })
  return () => expect(errors, errors.join('\n')).toEqual([])
}

export async function login(page, identifier, password) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')        // the login form re-renders once /bootstrap and the session check answer
  const fields = page.locator('form input')
  await fields.nth(0).fill(identifier)
  await fields.nth(1).fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/login/)
}
