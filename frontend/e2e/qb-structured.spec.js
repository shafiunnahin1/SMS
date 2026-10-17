import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// QB.4 on the central host: the Super Admin builds a matching, an ordering and a passage question in the editor, sees each in
// the preview, and sends each for review (the server accepts only complete structured parts). Runs once: playwright.config's
// testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

async function start(page, typeLabel, text) {
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: typeLabel })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(text)
  return form
}

async function saveAndSubmit(page) {
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.locator('[data-action="submit"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')
}

test('QB.4 structured types: matching, ordering, passage', async ({ page }) => {
  await loginSuper(page)
  const preview = page.locator('[data-testid="qb-structured-preview"]')

  let form = await start(page, 'ম্যাচিং', 'Match the cities with their countries.')
  for (const [i, [l, r]] of [['Dhaka', 'Bangladesh'], ['Delhi', 'India']].entries()) {
    await page.locator('[data-action="add-pairs"]').click()
    await form.locator(`input[name="structured.pairs.${i}.left"]`).fill(l)
    await form.locator(`input[name="structured.pairs.${i}.right"]`).fill(r)
  }
  await expect(preview).toContainText('Bangladesh')
  await saveAndSubmit(page)

  form = await start(page, 'পুনর্বিন্যাস', 'Rearrange the sentences.')
  for (const [i, s] of ['I woke up.', 'I brushed my teeth.', 'I went to school.'].entries()) {
    await page.locator('[data-action="add-steps"]').click()
    await form.locator(`input[name="structured.steps.${i}.text"]`).fill(s)
  }
  await expect(preview.locator('li')).toHaveCount(3)
  await saveAndSubmit(page)

  form = await start(page, 'সিন প্যাসেজ', 'Read the passage and answer.')
  await form.locator('textarea[name="structured.box"]').fill('Rahim lives in a village. He loves his school.')
  await page.locator('[data-action="add-subs"]').click()
  await form.locator('input[name="structured.subs.0.prompt"]').fill('Where does Rahim live?')
  await form.locator('input[name="structured.subs.0.answer"]').fill('In a village')
  await expect(preview).toContainText('Rahim lives in a village')
  await saveAndSubmit(page)
})

// QB.13 (D73): one seen passage mixes its parts - questions to answer, an MCQ, a true/false with its correction and an
// information-transfer table - each with its marks; the preview shows each kind, the server takes it for review.
test('QB.13 a seen passage mixes its parts', async ({ page }) => {
  await loginSuper(page)
  const preview = page.locator('[data-testid="qb-structured-preview"]')
  const form = await start(page, 'সিন প্যাসেজ', 'Read the passage and answer the questions.')
  await form.locator('textarea[name="structured.box"]').fill('Behula is a legendary heroine. She married Lakhindar.')
  await page.locator('[data-action="add-subs"]').click()
  await form.locator('input[name="structured.subs.0.prompt"]').fill('Who was Behula?')
  await form.locator('input[name="structured.subs.0.answer"]').fill('A legendary heroine.')
  await form.locator('input[name="structured.subs.0.marks"]').fill('2')
  for (const kind of ['gaps', 'mcqs', 'tfs', 'tables']) {
    await form.locator('select[data-action="add-part"]').selectOption(kind)
    await page.locator(`[data-action="add-${kind}"]`).click()
  }
  await form.locator('input[name="structured.gaps.0.prompt"]').fill('She ___ to the gods.')
  await form.locator('input[name="structured.gaps.0.hint"]').fill('go')
  await form.locator('input[name="structured.gaps.0.answers"]').fill('went')
  await form.locator('input[name="structured.gaps.0.marks"]').fill('1')
  await form.locator('input[name="structured.mcqs.0.prompt"]').fill('Behula married -')
  for (const [k, o] of ['Lakhindar', 'Chand', 'Manasa', 'Sayven'].entries()) await form.locator(`input[name="structured.mcqs.0.options.${k}"]`).fill(o)
  await form.locator('input[name="structured.mcqs.0.marks"]').fill('1')
  await form.locator('input[name="structured.tfs.0.prompt"]').fill('Behula married Chand.')
  await form.locator('select[name="structured.tfs.0.value"]').selectOption('false')
  await form.locator('input[name="structured.tfs.0.correction"]').fill('Behula married Lakhindar.')
  await form.locator('input[name="structured.tfs.0.marks"]').fill('1')
  await form.locator('input[name="structured.tables.0.columns"]').fill('Who, What')
  await form.locator('textarea[name="structured.tables.0.rows"]').fill('Behula | [a heroine]\nLakhindar | [her husband, husband]')
  await form.locator('input[name="structured.tables.0.marks"]').fill('2')
  await expect(preview).toContainText('Behula married Lakhindar.')
  await expect(preview).toContainText('went')
  await expect(preview.locator('table td')).toHaveCount(4)
  await expect(preview).toContainText('a heroine')
  await saveAndSubmit(page)
  await page.reload()
  await expect(form.locator('input[name="structured.gaps.0.prompt"]')).toHaveValue('She ___ to the gods.')
  await expect(form.locator('input[name="structured.gaps.0.hint"]')).toHaveValue('go')
  await expect(form.locator('input[name="structured.gaps.0.answers"]')).toHaveValue('went')
  await expect(form.locator('input[name="structured.gaps.0.marks"]')).toHaveValue('1.00')
  await expect(form.locator('input[name="structured.mcqs.0.prompt"]')).toHaveValue('Behula married -')
  await expect(form.locator('input[name="structured.mcqs.0.options.0"]')).toHaveValue('Lakhindar')
  await expect(form.locator('input[name="structured.mcqs.0.marks"]')).toHaveValue('1.00')
  await expect(form.locator('input[name="structured.subs.0.prompt"]')).toHaveValue('Who was Behula?')
  await expect(form.locator('input[name="structured.subs.0.answer"]')).toHaveValue('A legendary heroine.')
  await expect(form.locator('input[name="structured.subs.0.marks"]')).toHaveValue('2.00')
  await expect(form.locator('input[name="structured.tfs.0.prompt"]')).toHaveValue('Behula married Chand.')
  await expect(form.locator('select[name="structured.tfs.0.value"]')).toHaveValue('false')
  await expect(form.locator('input[name="structured.tfs.0.correction"]')).toHaveValue('Behula married Lakhindar.')
  await expect(form.locator('input[name="structured.tfs.0.marks"]')).toHaveValue('1.00')
  await expect(form.locator('textarea[name="structured.tables.0.rows"]')).toHaveValue('Behula | [a heroine]\nLakhindar | [her husband, husband]')
  await expect(form.locator('input[name="structured.tables.0.marks"]')).toHaveValue('2.00')
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status="published"]')).toBeVisible()
})
