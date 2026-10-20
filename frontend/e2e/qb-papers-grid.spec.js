import { test, expect } from '@playwright/test'
import { login } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('question paper grid creates, moves, opens and deletes folders and a draft', async ({ browser }) => {
  test.setTimeout(90_000)
  const tag = Date.now().toString(36)
  const folderName = `Exam ${tag}`
  const childName = `Term ${tag}`
  const paperTitle = `Draft ${tag}`
  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)

  await school.goto('/admin/question-bank/papers')
  await school.locator('input[name="folder_name"]').fill(folderName)
  await school.locator('[data-action="new-folder"]').click()
  const folder = school.locator('[data-testid="qb-paper-folder-card"]').filter({ hasText: folderName })
  await expect(folder).toBeVisible()

  await folder.locator('[data-action="open-folder"]').click()
  await expect(school.locator('[data-testid="qb-paper-breadcrumb"]')).toContainText(folderName)
  await school.locator('input[name="folder_name"]').fill(childName)
  await school.locator('[data-action="new-folder"]').click()
  const child = school.locator('[data-testid="qb-paper-folder-card"]').filter({ hasText: childName })
  await expect(child).toBeVisible()
  await child.locator('[data-action="folder-menu"]').click()
  await child.locator('select[name^="move-folder-"]').selectOption({ label: 'প্রধান ফোল্ডার' })
  await expect(child).toHaveCount(0)

  await school.locator('[data-action="back"]').click()
  const rootChild = school.locator('[data-testid="qb-paper-folder-card"]').filter({ hasText: childName })
  await expect(rootChild).toBeVisible()
  await rootChild.locator('[data-action="folder-menu"]').click()
  await rootChild.locator('[data-action="delete-folder"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(rootChild).toHaveCount(0)

  await school.goto('/admin/question-bank/papers/new')
  await school.locator('input[name="title"]').fill(paperTitle)
  await school.locator('input[name="section-0-title"]').fill('ক-বিভাগ')
  await school.locator('[data-action="save"]').click()
  await expect(school).toHaveURL(/\/admin\/question-bank\/papers\/\d+$/)
  await school.goto('/admin/question-bank/papers')

  const paper = school.locator('[data-testid="qb-paper-card"]').filter({ hasText: paperTitle })
  await expect(paper).toBeVisible()
  await paper.locator('[data-action="paper-menu"]').click()
  await paper.locator('select[name^="move-paper-"]').selectOption({ label: folderName })
  await expect(paper).toHaveCount(0)

  await folder.locator('[data-action="open-folder"]').click()
  await expect(school.locator('[data-testid="qb-paper-breadcrumb"]')).toContainText(folderName)
  const filedPaper = school.locator('[data-testid="qb-paper-card"]').filter({ hasText: paperTitle })
  await expect(filedPaper).toBeVisible()
  await filedPaper.locator('[data-action="paper-menu"]').click()
  await filedPaper.locator('[data-action="delete-paper"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(filedPaper).toHaveCount(0)

  await school.locator('[data-action="back"]').click()
  await folder.locator('[data-action="folder-menu"]').click()
  await folder.locator('[data-action="delete-folder"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(folder).toHaveCount(0)
})
