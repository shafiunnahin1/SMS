import { test, expect } from '@playwright/test'
import { lastCode, login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.10b (D66 §৪.৫): the Super Admin sets the writers' share (50%), adds a writer, prices short answers; the writer writes a
// question, the Super Admin publishes it; a school buys it from its wallet; the writer sees the share, asks to withdraw it (held);
// the Super Admin pays it with a bank transaction id; the writer's balance drops once. Runs once: school-desktop only.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

async function signIn(page, phone, password) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const before = lastCode(phone)
  const fields = page.locator('form input')
  await fields.nth(0).fill(phone)
  await fields.nth(1).fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect.poll(() => lastCode(phone)).not.toBe(before)
  await page.locator('form input').first().fill(lastCode(phone))
  await page.locator('form button[type="submit"]').click()
}

test('QB.10b a sale pays the writer, who withdraws it', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  const phone = `017${String(Date.now()).slice(-8)}`
  await loginSuper(page)
  await page.goto('/super-admin/qb/withdrawals')
  const settings = page.locator('[data-testid="writer-settings"]')
  await settings.locator('input[name="share_percent"]').fill('50')
  await settings.locator('input[name="min_withdrawal"]').fill('0.10')
  await Promise.all([page.waitForResponse(r => r.url().includes('/super/qb/writer-settings') && r.request().method() === 'PUT' && r.ok()),
    settings.locator('button[type="submit"]').click()])
  await page.reload()
  await expect(page.locator('[data-testid="writer-settings"] input[name="share_percent"]')).toHaveValue('50.00')

  await page.goto('/super-admin/institutions')
  await page.getByText(TENANTS.school.slug).first().click()
  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('5')
  await wallet.locator('input[name="note"]').fill(`earn e2e ${tag}`)
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText(`earn e2e ${tag}`)

  await page.goto('/super-admin/qb/pricing')
  await page.locator('[data-action="new-price"]').click()
  const price = page.locator('[data-testid="new-price"]')
  await price.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await price.locator('input[name="amount"]').fill('1.00')
  await price.locator('button[type="submit"]').click()
  await expect(price).toHaveCount(0)

  await page.goto('/super-admin/qb/writers')
  await page.locator('[data-action="new"]').click()
  const add = page.locator('[data-testid="new-writer"]')
  await add.locator('input[name="name"]').fill(`Lekhok ${tag}`)
  await add.locator('select[name="role"]').selectOption('content_writer')
  await add.locator('input[name="phone"]').fill(phone)
  await add.locator('input[name="password"]').fill('First-pass-2026')
  await add.locator('button[type="submit"]').click()
  await expect(page.locator('[data-testid="qb-writers"]')).toContainText(`Lekhok ${tag}`)

  const writer = await (await browser.newContext({ baseURL: `http://admin.${BASE}` })).newPage()
  await signIn(writer, phone, 'First-pass-2026')
  await expect(writer).toHaveURL(/\/change-password/)
  const pw = writer.locator('form input[type="password"]')
  await pw.nth(0).fill('First-pass-2026')
  await pw.nth(1).fill('Writer-pass-2027')
  await pw.nth(2).fill('Writer-pass-2027')
  await writer.locator('form button[type="submit"]').click()
  await expect(writer).toHaveURL(/\/writer\/dashboard/)   // R2.1.1 (D110): writers land on qbank's dashboard
  await writer.goto('/writer/questions')
  await writer.locator('[data-action="new"]').click()
  const form = writer.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`বল কাকে বলে? ${tag}`)
  await form.locator('textarea[name="answer_text"]').fill(`যা গতির অবস্থা বদলায় ${tag}`)
  await writer.locator('[data-action="save"]').click()
  await expect(writer).toHaveURL(/\/writer\/questions\/\d+$/)
  await writer.locator('[data-action="submit"]').click()
  await expect(writer.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')

  await page.goto(new URL(writer.url()).pathname)
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  await school.goto('/admin/question-bank')
  await school.locator('[data-testid="qb-library-list"]').getByText(tag).first().click()
  await school.locator('[data-testid="qb-question-view"] [data-action="buy"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(school.locator('[data-testid="qb-answer"]')).toContainText(tag)

  await writer.goto('/writer/earnings')
  await expect(writer.locator('[data-testid="earnings-balance"]')).toHaveText('৳0.50')
  await writer.locator('[data-action="withdraw"]').click()
  const req = writer.locator('[data-testid="withdraw-form"]')
  await req.locator('input[name="payout_account"]').fill('01711111111')
  await req.locator('button[type="submit"]').click()
  await expect(req).toHaveCount(0)
  await expect(writer.locator('[data-testid="earnings-held"]')).toHaveText('৳0.50')
  await expect(writer.locator('[data-testid="earnings-available"]')).toHaveText('৳0.00')

  await page.goto('/super-admin/qb/withdrawals')
  const row = page.locator('[data-testid="withdrawal-queue"]').locator('tr, li', { hasText: `Lekhok ${tag}` }).first()
  await row.locator('[data-action="pay"]').click()
  const pay = page.locator('[data-testid="process-form"]')
  await pay.locator('input[name="bank_transaction_id"]').fill(`BK${tag}`)
  await pay.locator('button[type="submit"]').click()
  await expect(pay).toHaveCount(0)
  await expect(page.locator('[data-testid="withdrawal-queue"]')).toContainText(`BK${tag}`)

  await writer.reload()
  await expect(writer.locator('[data-testid="earnings-balance"]')).toHaveText('৳0.00')
  await expect(writer.locator('[data-testid="withdrawal-list"] [data-status="paid"]').first()).toBeVisible()
})
