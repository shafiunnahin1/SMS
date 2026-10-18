import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.8 (D66): the Super Admin tops up the school's wallet and publishes a priced question; the head teacher builds a paper,
// adds that not-yet-bought question, confirms buying it, saves, makes the paper final and downloads set A as a PDF.
// Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('QB.8 a question paper from a bought question, printed', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/super-admin/institutions')
  await page.getByText(TENANTS.school.slug).first().click()
  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('5')
  await wallet.locator('input[name="note"]').fill(`paper e2e ${tag}`)
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText(`paper e2e ${tag}`)

  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`ত্বরণ কাকে বলে? ${tag}`)
  await form.locator('textarea[name="answer_text"]').fill('বেগের পরিবর্তনের হার')
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
  await school.goto('/admin/question-bank/papers/new')
  await school.locator('input[name="title"]').fill(`অর্ধবার্ষিক ${tag}`)
  await school.locator('input[name="section-0-title"]').fill('ক-বিভাগ')
  await school.locator('[data-testid="paper-picker"] input[name="q"]').fill(tag)
  await school.locator('[data-testid="paper-picker"] [data-action="add-question"]').first().click()
  await expect(school.locator('[data-testid="paper-section-0"]')).toContainText(tag)
  await school.locator('[data-action="save"]').click()
  await expect(school.getByRole('alertdialog')).toContainText('0.50')                 // not bought yet: confirm the price
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(school).toHaveURL(/\/admin\/question-bank\/papers\/\d+$/)
  await school.locator('[data-action="finalize"]').click()
  await expect(school.locator('[data-status="final"]')).toBeVisible()

  const download = school.waitForEvent('download')
  await school.getByRole('button', { name: /সেট A প্রিন্ট|Print set A/ }).click()
  expect((await download).suggestedFilename()).toMatch(/paper-\d+-A\.pdf/)
  await school.goto('/admin/question-bank/papers')
  await expect(school.locator('[data-testid="qb-papers"]')).toContainText(`অর্ধবার্ষিক ${tag}`)
})
