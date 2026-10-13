import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

// One worker runs every spec, and the API allows 5 logins a minute per user (throttle:login) - so after the first real login of a
// user on a host the next specs reuse that session's cookies; the login page sends a signed-in user to their dashboard.
// F1 passes { fresh: true } to test the form itself.
const sessions = new Map()

export async function login(page, identifier, password, { fresh = false } = {}) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')        // the login form re-renders once /bootstrap and the session check answer
  const key = `${new URL(page.url()).origin}|${identifier}`
  if (!fresh && sessions.has(key)) {
    await page.context().addCookies(sessions.get(key))        // after networkidle, so no late guest Set-Cookie overwrites them
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    if (!/\/login/.test(page.url())) return
    await page.context().clearCookies()
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
  }
  const fields = page.locator('form input')
  await fields.nth(0).fill(identifier)
  await fields.nth(1).fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/login/)
  sessions.set(key, await page.context().cookies())
}

// The Super Admin always signs in with a one-time code (in local/CI it only goes to the API's log, G17). /auth/verify-otp shares one
// 5-a-minute bucket per IP, so the central-host specs (QB.1-QB.3) sign the Super Admin in once and reuse that session like login().
const API_LOG = process.env.E2E_API_LOG ?? fileURLToPath(new URL('../../api/storage/logs/laravel.log', import.meta.url))
export const lastCode = (phone = '01700000000') => {
  let log = ''
  try { log = readFileSync(API_LOG, 'utf8') } catch { /* a fresh CI checkout has no log until the first line */ }
  return [...log.matchAll(new RegExp(`\\[dev sms\\] to ${phone.slice(0, 3)}\\*+${phone.slice(-2)}: \\D*(\\d{4,8})`, 'g'))].at(-1)?.[1]
}

export async function loginSuper(page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const key = `${new URL(page.url()).origin}|super`
  if (sessions.has(key)) {
    await page.context().addCookies(sessions.get(key))
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    if (!/\/login/.test(page.url())) return
    await page.context().clearCookies()
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
  }
  const before = lastCode()
  const fields = page.locator('form input')
  await fields.nth(0).fill('admin@schoolapp.com')
  await fields.nth(1).fill('Admin@1234')
  await page.locator('form button[type="submit"]').click()
  await expect.poll(() => lastCode()).not.toBe(before)
  await page.locator('form input').first().fill(lastCode())
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/super-admin\/dashboard/)
  sessions.set(key, await page.context().cookies())
}
