import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.9 (D65/D66/D68): the Super Admin publishes a short question and prices its answer for students; a seeded school student logs
// in (first login: a new password), lands on the question-bank portal, reads the question free and sees the answer locked with the
// student price on the buy button (the bKash step itself is covered by QbStudentTest). Runs once: playwright.config's testIgnore
// keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('QB.9 a student reads a question free and sees the answer priced', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`ত্বরণের একক কী? ${tag}`)
  await form.locator('textarea[name="answer_text"]').fill(`মিটার/সেকেন্ড² ${tag}`)
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  await page.goto('/super-admin/qb/pricing')
  await page.locator('[data-action="new-price"]').click()
  const price = page.locator('[data-testid="new-price"]')
  await price.locator('select[name="audience"]').selectOption('student')
  await price.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await price.locator('input[name="amount"]').fill('1.25')
  await price.locator('button[type="submit"]').click()
  await expect(price).toHaveCount(0)

  const student = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(student, 'DHA-2025-0010', 'DHA-2025-0010')
  await expect(student).toHaveURL(/\/change-password/)
  const pw = student.locator('form input[type="password"]')
  await pw.nth(0).fill('DHA-2025-0010')
  await pw.nth(1).fill('Student-pass-2026')
  await pw.nth(2).fill('Student-pass-2026')
  await student.locator('form button[type="submit"]').click()
  await expect(student).toHaveURL(/\/student\/question-bank/)

  await student.locator('[data-testid="qb-study-list"]').getByText(tag).first().click()
  const item = student.locator('[data-testid="qb-study-item"]')
  await expect(item).toContainText(`ত্বরণের একক কী? ${tag}`)
  await expect(item.locator('[data-testid="qb-answer"]')).toHaveCount(0)
  await expect(item.locator('[data-action="buy"]')).toContainText('1.25')
})
