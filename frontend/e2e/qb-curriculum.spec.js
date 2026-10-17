import { test, expect } from '@playwright/test'
import { loginSuper, watchConsole } from './helpers.js'

// QB.1 on the central host (admin.<base>): the Super Admin builds class → subject → chapter → topic, deletes a leaf, and is
// refused when deleting a class that is still in use. Runs once: playwright.config's testIgnore keeps it to school-desktop, like super.smoke.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

async function addNode(page, column, bn, en) {
  await page.locator(`[data-testid="${column}"] [data-action="add"]`).click()
  const form = page.locator('[data-testid="qb-node-form"]')
  await form.locator('input[name="name_bn"]').fill(bn)
  await form.locator('input[name="name_en"]').fill(en)
  await form.locator('button[type="submit"]').click()
  await expect(form).toHaveCount(0)
  await expect(page.locator(`[data-testid="${column}"]`)).toContainText(bn)
}

test('QB.1 super admin builds the question-bank curriculum', async ({ page }) => {
  const noErrors = watchConsole(page)
  await loginSuper(page)
  await page.goto('/super-admin/qb/curriculum')
  const tag = Date.now().toString(36)

  await addNode(page, 'col-class-levels', `শ্রেণি-${tag}`, `Class ${tag}`)
  await page.locator('[data-testid="col-class-levels"]').getByRole('button', { name: `শ্রেণি-${tag}`, exact: true }).click()
  await addNode(page, 'col-subjects', `বিষয়-${tag}`, `Subject ${tag}`)               // the picked class is ticked for the new subject
  await page.locator('[data-testid="col-subjects"]').getByRole('button', { name: `বিষয়-${tag}`, exact: true }).click()
  await addNode(page, 'col-chapters', `অধ্যায়-${tag}`, `Chapter ${tag}`)
  await page.locator('[data-testid="col-chapters"]').getByRole('button', { name: `অধ্যায়-${tag}`, exact: true }).click()
  await addNode(page, 'col-topics', `টপিক-${tag}`, `Topic ${tag}`)

  // a leaf can go
  await page.locator('[data-testid="col-topics"]').getByRole('button', { name: new RegExp(`টপিক-${tag}$`) }).last().click()
  await page.getByRole('alertdialog').getByRole('button').last().click()
  await expect(page.locator('[data-testid="col-topics"]')).not.toContainText(`টপিক-${tag}`)
  noErrors()

  // a class with a subject is in use: the server refuses (422 qb_in_use) and the page says why
  await page.locator('[data-testid="col-class-levels"]').getByRole('button', { name: new RegExp(`শ্রেণি-${tag}$`) }).last().click()
  await page.getByRole('alertdialog').getByRole('button').last().click()
  await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: /মোছা যাবে না|cannot be deleted/ }).first()).toBeVisible()
  await expect(page.locator('[data-testid="col-class-levels"]')).toContainText(`শ্রেণি-${tag}`)
})
