import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// R2.1.3 (D123): upload a JSON file with one good question and one of an unknown type -> the staging review shows the exact
// counts and the field-path error; quick edit fixes the type; "select all valid" + "import selected" makes two drafts, and a
// draft opens in the full editor with its LaTeX. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('R2.1.3 a JSON import is checked, fixed and imported as drafts', async ({ page }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/writer/imports')
  const subject = await page.evaluate(async () => {
    const r = await fetch('/api/v1/writer/curriculum', { headers: { Accept: 'application/json' }, credentials: 'include' })
    return (await r.json()).data.subjects[0].name_en
  })
  const file = JSON.stringify({ schema_version: 'exam-management.universal-content-json.v5', questions: [
    { question_type: 'mcq', question_text: `If \\(x^2 = 4\\) then x = ? ${tag}`, settings: { subject: { name: subject } },
      options: [{ label: 'A', text: '\\(\\pm 2\\)', is_correct: true }, { label: 'B', text: '4', is_correct: false }] },
    { question_type: 'riddle', question_text: `Name the largest planet. ${tag}`, answer_text: 'Jupiter', settings: { subject: { name: subject } } },
  ] })
  await page.locator('input[type="file"][name="files"]').setInputFiles({ name: `e2e-${tag}.json`, mimeType: 'application/json', buffer: Buffer.from(file) })
  await page.locator('[data-testid="qbi-upload"]').click()

  const review = page.locator('[data-testid="qb-import-review"]')
  await expect(review).toHaveAttribute('data-status', 'ready')
  await expect(review.locator('[data-count="total"] dd')).toHaveText(/2|২/)
  await expect(review.locator('[data-count="invalid"] dd')).toHaveText(/1|১/)
  const bad = review.locator('li[data-record="2"]')
  await expect(bad.locator('[data-testid="qbi-errors"]')).toContainText('question_type')

  await bad.locator('[data-testid="qbi-edit"]').click()
  await bad.locator('[data-testid="qbi-quick-edit"] select[name="type"]').selectOption('short')
  await bad.locator('[data-testid="qbi-save"]').click()
  await expect(review.locator('li[data-record="2"]')).toHaveAttribute('data-valid', '1')
  await expect(review.locator('[data-count="invalid"] dd')).toHaveText(/0|০/)

  await review.locator('[data-testid="qbi-select-valid"]').click()
  await expect(review.locator('li[data-record="1"] input[type="checkbox"]')).toBeChecked()
  await review.locator('[data-testid="qbi-finalize"]').click()
  await page.getByRole('alertdialog').locator('button').last().click()
  await expect(review.locator('[data-count="imported"] dd')).toHaveText(/2|২/)

  await review.locator('li[data-record="1"]').getByRole('link').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await expect(page.locator('body')).toContainText(tag)
})
