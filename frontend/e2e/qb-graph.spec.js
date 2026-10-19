import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// R2.1.2 / D118: qbank's graph tool in the SMS editor - the ribbon opens qbank's Graph Builder, "Insert graph" puts qbank's
// [[qmx-graph:...]] token into the field, the preview draws it with qbank's renderer as an image, and it is still drawn after
// saving and reopening. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('D118 qbank graph: insert, preview, save, reopen', async ({ page }) => {
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  const text = form.locator('textarea[name="question_text"]')
  await text.fill('নিচের গ্রাফটি দেখো।')
  await text.click()
  await page.locator('[data-action="graph"]').click()
  const builder = page.locator('.swal2-popup')
  await expect(builder).toContainText('Graph Builder', { timeout: 20000 })
  await builder.locator('button').filter({ hasText: 'printed notation' }).first().click()   // qbank's formula family; its default is y = x^2
  await builder.locator('textarea:visible').first().fill('y = x^2')
  await builder.locator('svg').first().waitFor({ timeout: 20000 })   // qbank draws its live preview
  await builder.getByRole('button', { name: 'Insert graph' }).click()
  await expect(builder).toBeHidden()
  await expect(text).toHaveValue(/\[\[qmx-graph:[A-Za-z0-9_-]{10,}\]\]/)

  const drawn = page.locator('[data-testid="qb-preview"] img[data-qb-graph="drawn"]')
  await expect(drawn).toHaveCount(1, { timeout: 20000 })
  await expect(drawn).toHaveAttribute('src', /^data:image\/svg\+xml/)

  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.reload()
  await expect(page.locator('[data-testid="qb-preview"] img[data-qb-graph="drawn"]')).toHaveCount(1, { timeout: 20000 })
})
