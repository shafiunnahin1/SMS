import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// QB.6 (D66): the Super Admin sets a price (a new row from now), adds a discount rule after trying the preview, and switches the
// rule off (it stays in the list). Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('QB.6 prices and a rule on the Super Admin page', async ({ page }) => {
  await loginSuper(page)
  await page.goto('/super-admin/qb/pricing')
  const amount = `0.${String(Date.now() % 90 + 10)}`

  await page.locator('[data-action="new-price"]').click()
  let form = page.locator('[data-testid="new-price"]')
  await form.locator('select[name="item_kind"]').selectOption('concept')
  await form.locator('input[name="amount"]').fill(amount)
  await form.locator('button[type="submit"]').click()
  await expect(form).toHaveCount(0)
  await expect(page.locator('[data-testid="qb-prices"]')).toContainText(amount)

  await page.locator('[data-action="new-rule"]').click()
  form = page.locator('[data-testid="new-rule"]')
  await form.locator('select[name="method"]').selectOption('percent_off')
  await form.locator('input[name="value"]').fill('25')
  await form.locator('input[name="note"]').fill(`e2e-${amount}`)
  await form.locator('input[name="samples"]').fill('concept:999999')              // the preview names an item that does not exist
  await form.locator('[data-action="preview"]').click()
  await expect(form.locator('input[name="samples"]')).toHaveAttribute('aria-invalid', 'true')
  await form.locator('input[name="samples"]').fill('')
  await form.locator('[data-action="save-rule"]').click()
  await expect(form).toHaveCount(0)
  const row = page.locator('[data-testid="qb-rules"]').getByText('25').first()
  await expect(row).toBeVisible()

  await page.locator('[data-testid="qb-rules"] [data-action="rule-off"]').first().click()
  await page.getByRole('alertdialog').getByRole('button').last().click()
  await expect(page.locator('[data-testid="qb-rules"] [data-action="rule-off"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="qb-rules"]')).toContainText('25')
})
