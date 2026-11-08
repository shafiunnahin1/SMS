import { test, expect } from '@playwright/test'
import { login, loginSuper, watchConsole } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// D193 R1.1 features end to end on the school tenant (playwright.config.js testIgnore keeps it off coaching / tutor): NTC.1 notice -> the parent reads and acknowledges;
// RTN.1 a routine period, a clash refused, the teacher sees it; ADM.1 the admit-card print refuses an exam without its schedule and
// the ID cards open; SUP.1 a ticket, the Super Admin's answer, the institution reads it; MIG.1 a teacher file mapped, checked and
// imported; EXP.1 an export made and downloaded once.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'

const stamp = () => Date.now().toString().slice(-6)
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

test('NTC.1 notice: the admin publishes, the parent reads and acknowledges', async ({ page, browser }, testInfo) => {
  const noErrors = watchConsole(page)
  const title = `Notice ${stamp()}`
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/notices')
  await page.getByRole('button', { name: 'নতুন নোটিশ' }).click()
  const form = page.locator('[role="dialog"]:visible form')
  await form.locator('input[name="title"]').fill(title)
  await form.locator('textarea[name="content"]').fill('আগামীকাল ছুটি')
  await form.locator('input[name="published_at"]').fill(local(new Date(Date.now() - 60000)))
  await form.locator('input[name="require_ack"]').check()
  await form.locator('input[name="ack_deadline"]').fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))
  await form.locator('button[type="submit"]').click()
  await expect(page.getByText(title).first()).toBeVisible()
  noErrors()

  const parent = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  const parentErrors = watchConsole(parent)
  await login(parent, '01900000001', 'Parent@1234')
  await parent.goto('/notices')
  await parent.getByRole('button', { name: new RegExp(title) }).click()
  await expect(parent.getByText('আগামীকাল ছুটি')).toBeVisible()
  await parent.getByRole('button', { name: 'আমি পড়েছি' }).first().click()
  await expect(parent.getByText(/স্বীকার করেছেন/).first()).toBeVisible()
  parentErrors()
})

test('RTN.1 routine: a period, a refused clash, the teacher sees it', async ({ page, browser }, testInfo) => {
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/academic/routine')
  await page.locator('main select').first().selectOption({ label: 'Class 10' })
  const add = async (batch, start, end) => {
    await page.getByRole('button', { name: 'পিরিয়ড যোগ' }).click()
    const form = page.locator('[role="dialog"]:visible form')
    await form.locator('select[name="batch_id"]').selectOption({ label: batch })
    await form.locator('select[name="day_of_week"]').selectOption('thu')
    await form.locator('select[name="subject_id"]').selectOption({ label: 'গণিত' })
    await form.locator('select[name="teacher_id"]').selectOption({ label: 'মো: করিম উদ্দিন' })   // the demo teacher who logs in below
    await form.locator('input[name="start_time"]').fill(start)
    await form.locator('input[name="end_time"]').fill(end)
    await form.locator('button[type="submit"]').click()
  }
  const slot = `${String(10 + Number(stamp()) % 6).padStart(2, '0')}:05`
  const end = `${slot.slice(0, 2)}:50`
  await add('A', slot, end)
  await expect(page.getByText(`${slot}–${end}`).first()).toBeVisible()
  await add('B', slot, end)                                           // the same teacher at the same time
  await expect(page.getByText(/শিক্ষক এই সময়ে অন্য ক্লাসে আছেন/)).toBeVisible()

  const teacher = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  await login(teacher, 'teacher@dhanmondischool.edu.bd', 'Teacher@1234')
  await teacher.goto('/teacher/routine')
  await expect(teacher.getByText(`${slot}–${end}`).first()).toBeVisible()
})

test('ADM.1 admit cards need the schedule; ID cards open as a PDF', async ({ page }) => {
  const name = `Admit ${stamp()}`
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/exams')
  await page.getByRole('button', { name: 'নতুন পরীক্ষা' }).click()
  const form = page.locator('[role="dialog"]:visible form')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('select[name="program_id"]').selectOption({ label: 'Class 10' })
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/admin\/exams\/\d+$/)

  await page.goto('/admin/exams/admit-cards')
  const exam = page.locator('main select').first()
  await expect(exam.locator('option', { hasText: name })).toHaveCount(1)
  await exam.selectOption(await exam.locator('option', { hasText: name }).getAttribute('value'))
  await page.getByRole('button', { name: 'প্রবেশপত্র প্রিন্ট' }).click()
  await expect(page.getByText(/পরীক্ষার সময়সূচি সম্পূর্ণ করুন/)).toBeVisible()

  await page.goto('/admin/students/id-cards')
  await page.locator('main select').first().selectOption({ label: 'Class 10' })
  const pdf = page.waitForResponse(r => r.url().includes('/students/id-cards/bulk') && r.status() === 200)
  const popup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'আইডি কার্ড প্রিন্ট' }).click()
  expect((await pdf).headers()['content-type']).toContain('application/pdf')
  await (await popup).close()
})

test('SUP.1 a ticket, the Super Admin answers, the institution reads it', async ({ page, browser }) => {
  const subject = `SMS ${stamp()}`
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/support')
  await page.getByRole('button', { name: 'নতুন টিকিট' }).click()
  const form = page.locator('[role="dialog"]:visible form')
  await form.locator('input[name="subject"]').fill(subject)
  await form.locator('select[name="category"]').selectOption('sms')
  await form.locator('textarea[name="body"]').fill('আজ SMS যায়নি')
  await form.locator('button[type="submit"]').click()
  await expect(page.getByText(subject).first()).toBeVisible()

  const sa = await (await browser.newContext({ baseURL: `http://admin.${BASE}` })).newPage()
  await loginSuper(sa)
  await sa.goto('/super-admin/support')
  const row = sa.locator('tr, li, [role="row"]').filter({ hasText: subject }).first()
  await row.getByRole('button', { name: 'খুলুন' }).click()
  await sa.locator('[role="dialog"] textarea').fill('Sender ID দেখুন')
  await sa.locator('[role="dialog"]').getByRole('button', { name: 'পাঠান' }).click()
  await expect(sa.locator('[role="dialog"]').getByText('Sender ID দেখুন')).toBeVisible()

  await page.reload()
  await page.locator('tr, li, [role="row"]').filter({ hasText: subject }).first().getByRole('button', { name: 'খুলুন' }).click()
  await expect(page.locator('[role="dialog"]').getByText('Sender ID দেখুন')).toBeVisible()
  await expect(page.locator('[role="dialog"]').getByText(/আপনার উত্তরের অপেক্ষায়/)).toBeVisible()
})

test('MIG.1 a teacher file: map, check, import', async ({ page }) => {
  const n = stamp()
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/settings/imports')
  await page.getByLabel('কী আমদানি করবেন').selectOption('teachers')
  const csv = `Name,Mobile,Employee\nE2E Teacher ${n},0171${n.padStart(7, '0')},E2E-${n}\nBad,123,E2E-X${n}\n`
  await page.locator('input[type="file"]').setInputFiles({ name: 'teachers.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByLabel('ফোন *')).toBeVisible()
  await page.getByRole('button', { name: /সংরক্ষণ|যাচাই|ড্রাই/ }).first().click()
  await expect(page.getByText('ফোন-এর বিন্যাস সঠিক নয়।').first()).toBeVisible()
  await page.getByRole('button', { name: '1টি সারি আমদানি করুন' }).click()
  await expect(page.getByText(/সম্পন্ন/).first()).toBeVisible()
  await page.goto('/admin/teachers')
  await expect(page.getByText(`E2E Teacher ${n}`).first()).toBeVisible()
})

test('EXP.1 the admin makes an export and downloads it once', async ({ page }) => {
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/settings/exports')
  await page.locator('input[name="password"]').fill(TENANTS.school.admin[1])
  await page.locator('input[name="passphrase"]').fill('correct horse battery')
  await page.locator('input[name="passphrase_confirmation"]').fill('correct horse battery')
  await page.getByRole('button', { name: 'export ফাইল তৈরি করুন' }).click()
  const get = page.getByRole('button', { name: 'নামান (একবার)' }).first()
  await expect(get).toBeVisible({ timeout: 30000 })
  const download = page.waitForEvent('download')
  await get.click()
  expect((await download).suggestedFilename()).toMatch(/^export-\d+\.edux$/)
  await expect(page.getByText('নামানো হয়েছে / মেয়াদ শেষ').first()).toBeVisible()
})
