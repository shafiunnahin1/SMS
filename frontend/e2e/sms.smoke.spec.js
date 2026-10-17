import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.6 on all three demo tenants: the admin sees the SMS balance and this month's use, the SMS log and the credit ledger
test('4.6 sms: balance, log and ledger', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, ...tenantOf(testInfo).admin)
  await page.goto('/admin/sms')
  await expect(page.locator('[data-testid="sms-usage"]')).toBeVisible()
  await expect(page.locator('main')).toContainText(/পাঠানো SMS/)
  await page.getByRole('tab', { name: 'ক্রেডিটের হিসাব' }).click()
  await expect(page.locator('main')).toContainText(/ক্রেডিট/)
  noErrors()
})

// Step 5.3 (D59): the SMS settings page - the two switches, the route in use, the own key is never shown back
test('5.3 sms settings: switches and own API', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, ...tenantOf(testInfo).admin)
  await page.goto('/admin/settings/sms')
  await expect(page.locator('[data-testid="sms-effective"]')).toContainText('ইউনিভার্সাল API')
  await page.locator('[data-field="own_enabled"]').check()
  await page.locator('input[name="sender_id"]').fill('MYSENDER')
  await page.locator('input[name="api_key"]').fill('e2e-key-12345678')
  await page.locator('[data-action="save"]').click()
  await expect(page.locator('[data-testid="sms-effective"]')).toContainText('নিজস্ব API')
  await expect(page.locator('main')).toContainText('••••5678')
  await expect(page.locator('input[name="api_key"]')).toHaveValue('')
  await page.locator('[data-action="remove"]').click()
  await page.getByRole('alertdialog').getByRole('button', { name: /নিশ্চিত|মুছুন|Confirm/ }).last().click()
  await expect(page.locator('[data-testid="sms-effective"]')).toContainText('ইউনিভার্সাল API')
  noErrors()
})

// Step 5.3 (D58): bKash brings the admin back to /admin/sms?recharge=… - the page says what happened and forgets the flag
test('5.3 sms recharge: the return from bKash is announced', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, ...tenantOf(testInfo).admin)
  await page.goto('/admin/sms?recharge=success')
  await expect(page.getByText('SMS ওয়ালেট রিচার্জ হয়েছে')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/sms$/)
  await page.locator('[data-action="recharge"]').click()
  await expect(page.locator('[data-testid="recharge"]')).toBeVisible()
  noErrors()
})
