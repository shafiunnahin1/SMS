import { test, expect } from '@playwright/test'
import { login, watchConsole } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// Step 4.2 flow (school): admission with the guardian's paper consent -> the profile (edit, enrollments, consents) -> a CSV import:
// upload, the columns are matched by name, check (one bad row), import, the bad row stays in the report.
test('4.2 students: admission, profile and an import', async ({ page }) => {
  const noErrors = watchConsole(page)
  const stamp = Date.now().toString().slice(-6)
  await login(page, ...TENANTS.school.admin)

  await page.goto('/admin/students/add')
  const form = page.locator('form')
  await form.locator('input[name="name"]').fill(`Profile ${stamp}`)
  await form.locator('input[name="guardian_phone"]').fill(`0181${stamp.padStart(7, '0')}`)
  await form.locator('select[name="batch_id"]').selectOption({ index: 1 })
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/admin\/students$/)

  await page.locator('input[type="search"]').fill(`Profile ${stamp}`)
  await page.locator('main table tbody tr', { hasText: `Profile ${stamp}` }).click()
  await expect(page).toHaveURL(/\/admin\/students\/\d+$/)
  await page.locator('input[name="address"]').fill('Dhanmondi 27')
  await page.locator('form button[type="submit"]').click()
  await page.getByRole('tab', { name: /ভর্তি|Enrollments/ }).click()
  await expect(page.locator('main')).toContainText(/প্রধান|active|সক্রিয়/)
  await page.getByRole('tab', { name: /সম্মতি|Consents/ }).click()
  await expect(page.locator('main [aria-pressed="true"]').first()).toBeVisible()      // the admission's paper consent shows as given

  // Step 8.1 (D27): anonymize after an erasure request - the button stays off until the name is typed exactly
  await page.locator('[data-action="anonymize"]').click()
  const dialog = page.locator('[data-testid="anonymize"]')
  await expect(dialog.locator('[data-action="confirm-anonymize"]')).toBeDisabled()
  await dialog.locator('input[name="confirm_name"]').fill(`Profile ${stamp}`)
  await dialog.locator('[data-action="confirm-anonymize"]').click()
  await expect(page.locator('[data-testid="page-header"]')).toContainText('Anonymized #')
  await expect(page.locator('[data-action="anonymize"]')).toHaveCount(0)

  await page.goto('/admin/settings/imports')
  const csv = `name,guardian_phone,batch\nImported A ${stamp},01911${stamp.padStart(6, '0')},Class 1 - A\nImported B ${stamp},12345,Class 1 - A\n`
  await page.locator('input[type="file"]').setInputFiles({ name: 'old.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('button', { name: /সংরক্ষণ করে পরীক্ষা|Save and check/ }).click()
  await page.getByRole('button', { name: /আমদানি করুন|Import 1/ }).click()
  await expect(page.locator('[data-testid="page-header"]')).toContainText(/সম্পন্ন|Done/, { timeout: 15000 })
  await expect(page.locator('main')).toContainText(`Imported B ${stamp}`)      // the bad row stays in the report
  noErrors()
})
