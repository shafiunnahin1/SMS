import { test, expect } from '@playwright/test'
import { lastCode, login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// R2.1.1 (D111 (4), D110): the writer's and the moderator's portals are separate on the central host - each lands on qbank's
// dashboard and sees only its own menu (a writer: earnings, a "new question" button; a moderator: review items, no earnings, no
// authoring) - and a school's admin cannot reach either portal from the school's own host. Runs on school-desktop only.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
const central = `http://admin.${BASE}`

async function addPerson(page, name, role, phone) {
  await page.locator('[data-action="new"]').click()
  const form = page.locator('[data-testid="new-writer"]')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('select[name="role"]').selectOption(role)
  await form.locator('input[name="phone"]').fill(phone)
  await form.locator('input[name="password"]').fill('First-pass-2026')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('[data-testid="qb-writers"]')).toContainText(name)
}

async function firstSignIn(browser, phone) {
  const page = await (await browser.newContext({ baseURL: central })).newPage()
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const before = lastCode(phone)
  const fields = page.locator('form input')
  await fields.nth(0).fill(phone)
  await fields.nth(1).fill('First-pass-2026')
  await page.locator('form button[type="submit"]').click()
  await expect.poll(() => lastCode(phone)).not.toBe(before)
  await page.locator('form input').first().fill(lastCode(phone))
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/change-password/)
  const pw = page.locator('form input[type="password"]')
  await pw.nth(0).fill('First-pass-2026')
  await pw.nth(1).fill('Portal-pass-2027')
  await pw.nth(2).fill('Portal-pass-2027')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/writer\/dashboard/)
  await expect(page.locator('[data-testid="qb-dashboard"]')).toBeVisible()
  return page
}

const menu = (page, path) => page.locator(`nav a[href="${path}"]`).first()

test('R2.1.1 writer and moderator portals are separate; a school admin reaches neither', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6)
  const wPhone = `016${tag}00`.slice(0, 11)
  const mPhone = `015${tag}00`.slice(0, 11)
  const sup = await (await browser.newContext({ baseURL: central })).newPage()
  await loginSuper(sup)
  await sup.goto('/super-admin/qb/writers')
  await addPerson(sup, `Portal W ${tag}`, 'content_writer', wPhone)
  await addPerson(sup, `Portal M ${tag}`, 'content_moderator', mPhone)

  const writer = await firstSignIn(browser, wPhone)
  await expect(menu(writer, '/writer/dashboard')).toBeVisible()
  await expect(menu(writer, '/writer/earnings')).toBeVisible()
  await writer.goto('/writer/questions')
  await expect(writer.locator('[data-action="new"]')).toBeVisible()

  const moderator = await firstSignIn(browser, mPhone)
  await expect(menu(moderator, '/writer/dashboard')).toBeVisible()
  await expect(menu(moderator, '/writer/questions')).toBeVisible()
  await expect(moderator.locator('nav a[href="/writer/earnings"]')).toHaveCount(0)
  await moderator.goto('/writer/questions')
  await expect(moderator.locator('[data-testid="qb-questions"]')).toBeVisible()
  await expect(moderator.locator('[data-action="new"]')).toHaveCount(0)

  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  await school.goto('/writer/dashboard')
  await expect(school).not.toHaveURL(/\/writer\//)
  await expect(school.locator('[data-testid="qb-dashboard"]')).toHaveCount(0)
})
