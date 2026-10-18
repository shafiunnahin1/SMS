import { test, expect } from '@playwright/test'
import { login, watchConsole } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// Step 4.5 Done When (school): the admin creates an exam for Class 10 (its subjects come along); the demo teacher - Class 10's
// subject teacher - enters a mark and gets the server's grade; the admin publishes; the parent of "ছাত্র 1" sees the result.
// Only the school project runs this file (playwright.config.js testIgnore).
test('4.5 exam: create, teacher enters marks, publish, the parent sees it', async ({ page, browser }, testInfo) => {
  const noErrors = watchConsole(page)
  const name = `Exam ${Date.now().toString().slice(-6)}`
  await login(page, ...TENANTS.school.admin)
  await page.goto('/admin/exams')
  await page.getByRole('button', { name: 'নতুন পরীক্ষা' }).click()
  const form = page.locator('[role="dialog"] form')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('select[name="program_id"]').selectOption({ label: 'Class 10' })
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/admin\/exams\/\d+$/)
  await expect(page.locator('[data-testid="exam-subjects"] fieldset').first()).toBeVisible()
  const examUrl = page.url()

  const teacher = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  const teacherErrors = watchConsole(teacher)
  await login(teacher, 'teacher@dhanmondischool.edu.bd', 'Teacher@1234')
  await teacher.goto('/teacher/marks')
  await teacher.locator('[data-testid="teacher-exam"]', { hasText: name }).getByRole('link', { name: 'বাংলা' }).click()
  const row = teacher.locator('[data-row]').filter({ has: teacher.getByText('ছাত্র 1', { exact: true }) })
  await row.locator('input[type="number"]').fill('85')
  await teacher.locator('[data-action="save"]').click()
  await expect(row.locator('[data-testid="grade"]')).toHaveText('A+')
  teacherErrors()

  await page.goto(examUrl)
  await page.getByRole('button', { name: 'ফল প্রকাশ' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'ফল প্রকাশ' }).click()
  await expect(page.locator('[data-testid="page-header"]')).toContainText(/প্রকাশিত/)
  noErrors()

  const parent = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL })).newPage()
  const parentErrors = watchConsole(parent)
  await login(parent, '01900000001', 'Parent@1234')
  await parent.goto('/parent/results')
  await parent.getByRole('tab', { name: 'ছাত্র 1', exact: true }).click()
  await expect(parent.locator('[data-testid="parent-exam"]', { hasText: name })).toContainText('A+')
  parentErrors()
})
