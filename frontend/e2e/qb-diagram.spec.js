import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// R2.1.2 / D118: qbank's diagram tools in the SMS editor - the ribbon opens qbank's diagram picker (all of qbank's tools), the Venn
// editor's "Insert into question" puts qbank's [[qmx-diagram:...]] token into the field, the preview draws it with qbank's renderer
// as an image, and it is still drawn after saving and reopening. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('D118 qbank diagram: picker, Venn editor, insert, preview, save, reopen', async ({ page }) => {
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  const text = form.locator('textarea[name="question_text"]')
  await text.fill('নিচের ভেন চিত্রটি দেখো।')
  await text.click()
  await page.locator('[data-action="diagram"]').click()
  await page.locator('.qmx-diagram-launcher [data-view="all"]').click()
  await expect(page.locator('.qmx-diagram-tool')).toHaveCount(62)      // every qbank diagram tool
  await page.locator('.qmx-diagram-tool[data-tool="venn-diagram"]').click()
  await page.getByRole('button', { name: 'Two-set preset' }).click()
  await page.getByRole('button', { name: 'Insert into question' }).click()
  await expect(text).toHaveValue(/\[\[qmx-diagram:[A-Za-z0-9_-]{10,}\]\]/)

  const drawn = page.locator('[data-testid="qb-preview"] img[data-qb-graph="drawn"][data-kind="diagram"]')
  await expect(drawn).toHaveCount(1, { timeout: 20000 })
  await expect(drawn).toHaveAttribute('src', /^data:image\/svg\+xml/)

  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.reload()
  await expect(page.locator('[data-testid="qb-preview"] img[data-qb-graph="drawn"][data-kind="diagram"]')).toHaveCount(1, { timeout: 20000 })
})
