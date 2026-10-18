import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.7 (D66): the Super Admin tops up the school's wallet, publishes a short question and prices its answer; the school's head
// teacher finds it locked, buys it from the wallet (the confirmation shows the server's price) and sees the answer; the spending
// page shows the purchase. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('QB.7 a school buys an answer from its wallet', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/super-admin/institutions')
  await page.getByText(TENANTS.school.slug).first().click()
  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('5')
  await wallet.locator('input[name="note"]').fill(`qb e2e ${tag}`)
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText(`qb e2e ${tag}`)

  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`বেগের একক কী? ${tag}`)
  await form.locator('textarea[name="answer_text"]').fill(`মিটার/সেকেন্ড ${tag}`)
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  await page.goto('/super-admin/qb/pricing')
  await page.locator('[data-action="new-price"]').click()
  const price = page.locator('[data-testid="new-price"]')
  await price.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await price.locator('input[name="amount"]').fill('0.50')
  await price.locator('button[type="submit"]').click()
  await expect(price).toHaveCount(0)

  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  await school.goto('/admin/question-bank')
  await school.locator('[data-testid="qb-library-list"]').getByText(tag).first().click()
  const view = school.locator('[data-testid="qb-question-view"]')
  await expect(view).not.toContainText('মিটার/সেকেন্ড')
  await view.locator('[data-action="buy"]').click()
  await expect(school.getByRole('alertdialog')).toContainText('0.50')
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(view.locator('[data-testid="qb-answer"]')).toContainText(`মিটার/সেকেন্ড ${tag}`)

  await school.goto('/admin/question-bank/spending')
  await expect(school.locator('[data-testid="qb-spending"]')).toContainText('0.50')
})
