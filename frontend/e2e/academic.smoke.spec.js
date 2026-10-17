import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.1 flow. School: a class (program) and a section (batch) with its teacher in charge and a subject teacher, then the section's
// page. Tutor (private batch): no program field, no teacher fields - the batch gets the default program.
test('4.1 programs, batches and teachers', async ({ page }, testInfo) => {
  const t = tenantOf(testInfo)
  const noErrors = watchConsole(page)
  const stamp = Date.now().toString().slice(-6)
  await login(page, ...t.admin)
  const modal = page.getByRole('dialog')

  if (testInfo.project.name === 'tutor-mobile') {
    await page.goto('/admin/batches')
    await page.getByRole('button', { name: /নতুন|New/ }).first().click()
    await expect(modal.locator('select').first()).not.toHaveAttribute('name', 'program_id')     // no program field
    await expect(modal.locator('[data-testid="subject-teachers"]')).toHaveCount(0)              // no teachers in a private batch
    await modal.locator('input[name="name"]').fill(`E2E ${stamp}`)
    await modal.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/admin\/batches\/\d+$/)
    await expect(page.locator('[data-testid="page-header"]')).toContainText(`E2E ${stamp}`)
    noErrors()
    return
  }

  // a teacher first (the batch form offers the teachers)
  await page.goto('/admin/teachers')
  await page.getByRole('button', { name: /নতুন শিক্ষক|New teacher/ }).click()
  await modal.locator('input[name="name"]').fill(`Teacher ${stamp}`)
  await modal.locator('input[name="phone"]').fill(`0171${stamp.padStart(7, '0')}`)
  await modal.locator('button[type="submit"]').click()
  await expect(modal).toHaveCount(0)
  await expect(page.locator('main')).toContainText(`Teacher ${stamp}`)

  await page.goto('/admin/academic/programs')
  await page.getByRole('button', { name: /নতুন|New/ }).click()
  await modal.locator('input[name="name"]').fill(`P ${stamp}`)
  await modal.locator('button[type="submit"]').click()
  await expect(modal).toHaveCount(0)
  await expect(page.locator('main')).toContainText(`P ${stamp}`)

  await page.goto('/admin/batches')
  await page.getByRole('button', { name: /নতুন|New/ }).click()
  await modal.locator('select[name="program_id"]').selectOption({ label: `P ${stamp}` })
  await modal.locator('input[name="name"]').fill(`B ${stamp}`)
  await modal.locator('select[name="teacher_id"]').selectOption({ label: `Teacher ${stamp}` })
  await modal.getByRole('button', { name: /সারি যোগ|Add row/ }).click()
  await modal.locator('select[name="subject_teachers.0.teacher_id"]').selectOption({ label: `Teacher ${stamp}` })
  await modal.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/admin\/batches\/\d+$/)
  await expect(page.locator('main')).toContainText(`Teacher ${stamp}`)
  noErrors()
})
