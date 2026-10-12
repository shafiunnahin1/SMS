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

// QB.12 (D72): qbank's ribbon. Select a word, make it bold and a subscript, add a numbered list and a table; the live preview
// draws them, they survive the save, and a script typed into the text never reaches the page.
test('QB.12 ribbon: formatting is drawn, saved and kept safe', async ({ page }) => {
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  const preview = page.locator('[data-testid="qb-preview"]')
  await expect(page.locator('[data-testid="qb-sections"]')).toBeVisible()
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  const text = form.locator('textarea[name="question_text"]')
  await text.fill('H2O কী? <script>window.__x = 1</script>')
  await text.evaluate((el) => el.setSelectionRange(1, 2))                       // the "2"
  await text.dispatchEvent('select')
  await page.locator('[data-testid="qb-ribbon"] [data-format="subscript"]').click()
  await text.evaluate((el) => { const i = el.value.indexOf('কী'); el.setSelectionRange(i, i + 2) })
  await text.dispatchEvent('select')
  await page.locator('[data-testid="qb-ribbon"] [data-format="bold"]').click()
  await expect(text).toHaveValue(/H<sub>2<\/sub>O <strong>কী<\/strong>\?/)
  await text.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length))
  await text.dispatchEvent('select')
  await page.locator('[data-action="table"]').click()
  await page.locator('[data-action="table-insert"]').click()
  await expect(preview.locator('sub')).toHaveText('2')
  await expect(preview.locator('strong')).toHaveText('কী')
  await expect(preview.locator('table th')).toHaveCount(2)
  await expect(preview.locator('script')).toHaveCount(0)
  await form.locator('textarea[name="answer_text"]').fill('পানি')
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.reload()
  await expect(preview.locator('sub')).toHaveText('2')
  await expect(preview.locator('table')).toHaveCount(1)
  await expect(form.locator('textarea[name="question_text"]')).not.toHaveValue(/script/)
  expect(await page.evaluate(() => window.__x)).toBeUndefined()
})
