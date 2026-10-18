import { test, expect } from '@playwright/test'
import { lastCode, loginSuper } from './helpers.js'

// QB.2 on the central host (admin.<base>): the Super Admin adds a writer and a moderator; the writer signs in with a one-time
// code, changes the first password, writes a question and sends it for review; the moderator returns it with a reason; the writer
// fixes it and sends it again; the moderator publishes it. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

async function signIn(page, login, password, phone) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const before = lastCode(phone)
  const fields = page.locator('form input')
  await fields.nth(0).fill(login)
  await fields.nth(1).fill(password)
  await page.locator('form button[type="submit"]').click()
  await expect.poll(() => lastCode(phone)).not.toBe(before)
  await page.locator('form input').first().fill(lastCode(phone))
  await page.locator('form button[type="submit"]').click()
}

async function firstPassword(page, oldPass, newPass) {
  await expect(page).toHaveURL(/\/change-password/)
  const f = page.locator('form input[type="password"]')
  await f.nth(0).fill(oldPass)
  await f.nth(1).fill(newPass)
  await f.nth(2).fill(newPass)
  await page.locator('form button[type="submit"]').click()
  // R2.1.1 (D110): writers and moderators land on qbank's dashboard, then open the question list
  await expect(page).toHaveURL(/\/writer\/dashboard/)
  await expect(page.locator('[data-testid="qb-dashboard"]')).toBeVisible()
  await page.goto('/writer/questions')
}

async function addPerson(page, name, role, phone) {
  await page.locator('[data-action="new"]').click()
  const form = page.locator('[data-testid="new-writer"]')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('select[name="role"]').selectOption(role)
  await form.locator('input[name="phone"]').fill(phone)
  await form.locator('input[name="password"]').fill('First-pass-2026')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('[data-testid="qb-writers"]')).toContainText(name)
}

test('QB.2 writer drafts and submits, moderator returns then publishes', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6)
  const wPhone = `018${tag}00`.slice(0, 11)
  const mPhone = `019${tag}00`.slice(0, 11)

  // the Super Admin adds both (a curriculum subject and a question type come from the demo seed)
  const superPage = await (await browser.newContext({ baseURL: `http://admin.${BASE}` })).newPage()
  await loginSuper(superPage)
  await superPage.goto('/super-admin/qb/writers')
  await addPerson(superPage, `Lekhok ${tag}`, 'content_writer', wPhone)
  await addPerson(superPage, `Moderator ${tag}`, 'content_moderator', mPhone)

  // the writer: code, first password, a draft, sent for review
  const writer = await (await browser.newContext()).newPage()
  await signIn(writer, wPhone, 'First-pass-2026', wPhone)
  await firstPassword(writer, 'First-pass-2026', 'Writer-pass-2027')
  await writer.locator('[data-action="new"]').click()
  const form = writer.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })   // QB.3: a short question needs an answer before review
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(`গতি কাকে বলে? ${tag}`)
  await form.locator('textarea[name="answer_text"]').fill('সময়ের সাথে অবস্থানের পরিবর্তন')
  await writer.locator('[data-action="save"]').click()
  await expect(writer).toHaveURL(/\/writer\/questions\/\d+$/)
  const url = writer.url()
  await writer.locator('[data-action="submit"]').click()
  await expect(writer.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')

  // the moderator: returns it with a reason
  const moderator = await (await browser.newContext()).newPage()
  await signIn(moderator, mPhone, 'First-pass-2026', mPhone)
  await firstPassword(moderator, 'First-pass-2026', 'Moderator-pass-2027')
  await expect(moderator.locator('[data-testid="qb-questions"]')).toContainText(tag)
  await moderator.goto(new URL(url).pathname)
  await moderator.locator('textarea[name="reason"]').fill('একক (unit) লিখুন')
  await moderator.locator('[data-action="reject"]').click()
  await expect(moderator.locator('[data-status]').first()).toHaveAttribute('data-status', 'rejected')

  // the writer sees why, fixes it, sends it again; the moderator publishes
  await writer.reload()
  await expect(writer.locator('[data-testid="review-note"]')).toContainText('একক')
  await form.locator('textarea[name="answer_text"]').fill('একক সময়ে অতিক্রান্ত দূরত্ব (মিটার/সেকেন্ড)')
  await writer.locator('[data-action="save"]').click()
  await writer.locator('[data-action="submit"]').click()
  await expect(writer.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')
  await moderator.reload()
  await moderator.locator('[data-action="publish"]').click()
  await expect(moderator.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')
})
