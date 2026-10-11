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
