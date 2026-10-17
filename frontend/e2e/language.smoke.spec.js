import { test, expect } from '@playwright/test'
import { login, tenantOf } from './helpers.js'

// F5 (R1: bn <-> en; Arabic is a later release): the switch changes <html lang dir data-locale> and the menu WITHOUT a page load,
// sends the new language to the API, saves users.locale (it survives a reload) and switches back.
test('F5 language toggle without a reload, remembered for the user', async ({ page }, testInfo) => {
  const t = tenantOf(testInfo)
  await login(page, ...t.admin)
  const html = page.locator('html')
  const switcher = page.locator('[data-testid="language-switcher"] select')
  const pick = async (locale) => {
    await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible()
    // on the tab-bar layout the switcher sits in the "more" sheet; open it when the switcher is not on screen
    if (!(await switcher.first().isVisible())) await page.getByRole('button', { name: /আরও|More/ }).first().click()
    await switcher.first().selectOption(locale)
    await expect(html).toHaveAttribute('lang', locale)
  }
  await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible()
  if ((await html.getAttribute('lang')) !== 'bn') await pick('bn')          // a previous run may have stopped in English

  let loads = 0
  page.on('load', () => loads++)
  const saved = page.waitForRequest(r => r.url().endsWith('/api/v1/auth/locale') && r.method() === 'PUT')
  await pick('en')
  expect((await saved).postDataJSON()).toEqual({ locale: 'en' })
  await expect(html).toHaveAttribute('dir', 'ltr')
  await expect(html).toHaveAttribute('data-locale', 'en')
  expect(loads).toBe(0)

  await page.reload()
  await expect(page.locator('[data-testid="app-topbar"]')).toBeVisible()
  await expect(html).toHaveAttribute('lang', 'en')        // users.locale was saved on the server
  await pick('bn')
})
