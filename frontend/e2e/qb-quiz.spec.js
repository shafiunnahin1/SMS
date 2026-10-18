import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.10 (D66): the Super Admin publishes an MCQ and makes a public quiz of it; a visitor takes it on the public page without login
// (score and right / wrong, nothing saved); a seeded school student takes the same quiz, submits, and sees the score and the right
// answer marked by the server. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('QB.10 a public quiz: a visitor checks it, a student takes it and keeps the result', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'বহুনির্বাচনী প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`৩ + ১ = ? ${tag}`)
  for (const [i, text] of ['৪', '৫', '৬', '৭'].entries()) await form.locator(`input[name="options.${i}.content_text"]`).fill(text)   // the first is marked right
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  await page.goto('/super-admin/qb/quizzes')
  await page.locator('[data-action="new-quiz"]').click()
  const quiz = page.locator('[data-testid="new-quiz"]')
  await quiz.locator('input[name="title"]').fill(`যোগ কুইজ ${tag}`)
  await quiz.locator('select[name="access"]').selectOption('public')
  await quiz.locator('input[name="duration_minutes"]').fill('5')
  await quiz.locator('input[name="find"]').fill(tag)
  await quiz.locator('[data-action="pick"]').first().click()
  await quiz.locator('button[type="submit"]').click()
  await expect(quiz).toHaveCount(0)
  await expect(page.locator('[data-testid="qb-quiz-admin-list"]')).toContainText(`যোগ কুইজ ${tag}`)

  const visitor = await (await browser.newContext({ baseURL: `http://admin.${BASE}` })).newPage()
  await visitor.goto('/quizzes')
  await visitor.locator('[data-testid="public-quiz-list"]').getByText(tag).first().click()
  await visitor.locator('[data-testid="quiz-question"]').getByLabel('৪').check()
  await visitor.locator('[data-action="check-quiz"]').click()
  await expect(visitor.locator('[data-testid="public-quiz-score"]')).toContainText('1.00 / 1.00')
  await expect(visitor.locator('[data-testid="public-quiz-mark"]')).toHaveText('সঠিক')

  const student = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(student, 'DHA-2025-0009', 'DHA-2025-0009')
  await expect(student).toHaveURL(/\/change-password/)
  const pw = student.locator('form input[type="password"]')
  await pw.nth(0).fill('DHA-2025-0009')
  await pw.nth(1).fill('Student-pass-2026')
  await pw.nth(2).fill('Student-pass-2026')
  await student.locator('form button[type="submit"]').click()
  await expect(student).toHaveURL(/\/student\/question-bank/)
  await student.goto('/student/quizzes')
  await student.locator('[data-testid="qb-quiz-list"]').locator('tr, li', { hasText: tag }).first().locator('[data-action="start"]').click()
  await expect(student).toHaveURL(/\/student\/quizzes\/\d+$/)
  await expect(student.locator('[data-testid="quiz-timer"]')).toBeVisible()
  await student.locator('[data-testid="quiz-question"]').getByLabel('৪').check()
  await student.locator('[data-action="submit-quiz"]').click()
  await expect(student.locator('[data-testid="quiz-score"]')).toContainText('1.00 / 1.00')
  await expect(student.locator('[data-testid="quiz-right"]')).toContainText('ক')
})
