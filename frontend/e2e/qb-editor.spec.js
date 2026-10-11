import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// QB.3 on the central host: the Super Admin (who may also write) builds an MCQ with maths from the mathlive dialog and a picture,
// sees the preview draw the formula and the picture, saves, then builds a creative question with its four parts. Runs once:
// playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })
// a 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('QB.3 editor: an MCQ with maths and a picture, a creative question, live preview', async ({ page }) => {
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  const preview = page.locator('[data-testid="qb-preview"]')

  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'বহুনির্বাচনী প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill('সমাধান করো: $x^2 = 4$ হলে x = ?')
  // the mathlive dialog adds a formula to the text
  await page.locator('[data-action="math"]').first().click()
  const mf = page.locator('[data-testid="math-field"]')
  await expect(mf).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('MATH-FIELD')   // the dialog focuses the formula field
  await page.keyboard.type('a+b')
  await page.locator('[data-action="math-insert"]').click()
  await expect(form.locator('textarea[name="question_text"]')).toHaveValue(/\$a\+b\$$/)

  // the four options come pre-labelled ক-ঘ, the first marked right
  for (const [i, text] of ['$2$', '$-2$', '$4$', '$0$'].entries()) await form.locator(`input[name="options.${i}.content_text"]`).fill(text)
  await form.locator('input[name="picture"]').setInputFiles({ name: 'graph.png', mimeType: 'image/png', buffer: PNG })
  await expect(form.locator('img')).toHaveCount(1)

  await expect(preview.locator('math-span').first()).toBeVisible()
  await expect(preview.locator('img')).toHaveCount(1)
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await expect(preview.locator('math-span')).toHaveCount(6)                     // x^2 = 4, a+b, and the four options
  await page.locator('[data-action="submit"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')

  // a creative question: the stimulus and the four parts ক-ঘ
  await page.goto('/writer/questions/new')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সৃজনশীল প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill('একটি গাড়ি ১০ সেকেন্ডে ১০০ মিটার যায়।')
  for (let i = 0; i < 4; i++) await form.locator(`textarea[name="creative_parts.${i}.question_text"]`).fill(`অংশ ${i + 1}`)
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await expect(preview.locator('ol li')).toHaveCount(4)
})
