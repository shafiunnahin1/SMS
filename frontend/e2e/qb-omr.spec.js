import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// R2.1.6 (D127): the Super Admin publishes an MCQ; the head teacher puts it in a final paper, sets up and locks its OMR form, sees
// the print button for the set, uploads a photo with no corner marks (kept for a person, never dropped), finds it in review with its
// reasons, cannot approve it, cancels it, and sees the results tab with its CSV. Runs once: playwright.config's testIgnore keeps it to
// school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })
const WHITE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAKUlEQVR4nO3MQREAAAwCIPuX1hD77SAA6VEEAoFAIBAIBAKBQCAQfA8Gpwvw4pr3blgAAAAASUVORK5CYII=', 'base64')   // a blank 64x64 page

test('R2.1.6 an OMR form for a final paper: lock, print, scan, review, results', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/super-admin/institutions')
  await page.getByText(TENANTS.school.slug).first().click()
  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('5')
  await wallet.locator('input[name="note"]').fill(`omr e2e ${tag}`)
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText(`omr e2e ${tag}`)

  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'বহুনির্বাচনী প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`৫ - ২ = ? ${tag}`)
  for (const [i, text] of ['৩', '২', '৭', '১'].entries()) await form.locator(`input[name="options.${i}.content_text"]`).fill(text)
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  await school.goto('/admin/question-bank/papers/new')
  await school.locator('input[name="title"]').fill(`OMR ${tag}`)
  await school.locator('input[name="section-0-title"]').fill('ক')
  await school.locator('[data-testid="paper-picker"] input[name="q"]').fill(tag)
  await school.locator('[data-testid="paper-picker"] [data-action="add-question"]').first().click()
  await school.locator('[data-action="save"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()      // buy the question
  await expect(school).toHaveURL(/\/admin\/question-bank\/papers\/\d+$/)
  await school.locator('[data-action="finalize"]').click()
  await expect(school.locator('[data-status="final"]')).toBeVisible()

  await school.locator('[data-action="omr"]').click()
  await expect(school).toHaveURL(/\/omr$/)
  const omr = school.locator('[data-testid="omr-form"]')
  await omr.locator('input[name="title"]').fill(`OMR ${tag}`)
  await omr.locator('[data-action="save-form"]').click()
  await omr.locator('[data-action="generate"]').click()
  await expect(omr.locator('[data-action="unlock"]')).toBeVisible()
  await expect(omr.getByRole('button', { name: /সেট A|set A/ })).toBeVisible()

  await school.getByRole('tab', { name: /স্ক্যান|Scan/ }).click()
  const scan = school.locator('[data-testid="omr-scan"]')
  await scan.locator('input[name="sheets"]').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: WHITE_PNG })
  await expect(scan.locator('[data-sheet-status="local"]')).toHaveCount(1)
  await scan.locator('[data-action="send"]').click()
  await expect(scan.locator('[data-sheet-status="saved"]')).toHaveCount(1)

  await school.getByRole('tab', { name: /যাচাই|Review/ }).click()
  const row = school.locator('[data-testid="omr-review"] [data-status="needs_review"]').first()
  await expect(row).toBeVisible()
  await row.click()
  const detail = school.locator('[data-testid="omr-scan-detail"]')
  await expect(detail.getByRole('alert')).toBeVisible()                           // its reasons are listed
  await expect(detail.locator('[data-action="approve"]')).toBeDisabled()          // nothing uncertain is scored
  await detail.locator('[data-action="cancel-scan"]').click()
  await expect(school.locator('[data-testid="omr-review"] [data-status="cancelled"]')).toHaveCount(1)

  await school.getByRole('tab', { name: /ফলাফল|Results/ }).click()
  const results = school.locator('[data-testid="omr-results"]')
  await expect(results.locator('[data-action="csv"]')).toBeVisible()
  await expect(results.locator('[data-total]')).toHaveAttribute('data-total', '0')
})
