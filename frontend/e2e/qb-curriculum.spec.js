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

// D139 (R2.1.2-language-curriculum): the Super Admin gives a new subject a syllabus version with Part → Text, then a writer on a
// 360px phone picks class → subject → the path by search and keyboard; the question type stays a separate field. The saved
// question reopens with the same breadcrumb, shows it in the preview and the list, and the page never scrolls sideways - in
// the normal left-to-right page and again with the document turned right-to-left (the RTL layout check for Arabic).
async function noSideScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
}

test('D139 writer places a question on a syllabus path at 360px, LTR and RTL', async ({ page }) => {
  const noErrors = watchConsole(page)
  await loginSuper(page)
  await page.goto('/super-admin/qb/curriculum')
  const tag = Date.now().toString(36)
  await addNode(page, 'col-class-levels', `ভাষা-শ্রেণি-${tag}`, `Lang class ${tag}`)
  await page.locator('[data-testid="col-class-levels"]').getByRole('button', { name: `ভাষা-শ্রেণি-${tag}`, exact: true }).click()
  await addNode(page, 'col-subjects', `বাংলা-${tag}`, `Bangla ${tag}`)
  await page.locator('[data-testid="col-subjects"]').getByRole('button', { name: `বাংলা-${tag}`, exact: true }).click()

  const lang = page.locator('[data-testid="qb-language-curriculum"]')
  await lang.getByRole('button', { name: 'যোগ করুন' }).first().click()
  await page.locator('[data-testid="qb-node-form"] button[type="submit"]').click()
  await expect(page.locator('[data-testid="qb-node-form"]')).toHaveCount(0)
  const version = lang.locator('[data-testid^="curriculum-version-"]')
  await version.getByRole('button', { name: 'মূল অংশ যোগ' }).click()
  let form = page.locator('[data-testid="qb-node-form"]')
  await form.locator('input[name="name_bn"]').fill(`গদ্য-${tag}`)
  await form.locator('input[name="name_en"]').fill(`Prose ${tag}`)
  await form.locator('button[type="submit"]').click()
  await expect(version).toContainText(`গদ্য-${tag}`)
  await version.getByRole('button', { name: 'উপ-অংশ যোগ' }).first().click()
  form = page.locator('[data-testid="qb-node-form"]')
  await form.locator('select[name="kind"]').selectOption('Text')
  await form.locator('input[name="name_bn"]').fill(`অপরিচিতা-${tag}`)
  await form.locator('input[name="name_en"]').fill(`Aparichita ${tag}`)
  await form.locator('button[type="submit"]').click()
  await expect(version).toContainText(`অপরিচিতা-${tag}`)

  await page.setViewportSize({ width: 360, height: 780 })
  for (const dir of ['ltr', 'rtl']) {
    await page.goto('/writer/questions/new')
    if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    const edit = page.locator('#qb-question-form')
    await edit.locator('[data-testid="qb-classes"]').getByLabel(`ভাষা-শ্রেণি-${tag}`).check()
    await expect(edit.locator('select[name="qb_subject_id"] option')).toHaveCount(2)   // placeholder + only this class's subject
    await edit.locator('select[name="qb_subject_id"]').selectOption({ label: `বাংলা-${tag}` })
    await expect(edit.locator('select[name="qb_chapter_id"]')).toHaveCount(0)          // a language paper uses the path, not chapter/topic
    const search = edit.locator('[data-testid="curriculum-picker"] [role="combobox"]')
    await search.fill(`গদ্য ${tag} অপরিচিতা`)
    await expect(edit.getByRole('listbox').getByRole('option')).toHaveCount(1)
    await search.press('Enter')
    await search.press('Escape')
    const crumb = edit.locator('[data-testid="curriculum-breadcrumb"]')
    await expect(crumb).toContainText(`গদ্য-${tag} › অপরিচিতা-${tag}`)
    await edit.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
    await edit.locator('textarea[name="question_text"]').fill(`লেখক কে? ${tag} ${dir}`)
    await edit.locator('textarea[name="answer_text"]').fill('রবীন্দ্রনাথ')
    await expect(page.locator('[data-testid="qb-preview-meta"]')).toContainText(`অপরিচিতা-${tag}`)
    await noSideScroll(page)
    await page.locator('[data-action="save"]').click()
    await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
    await page.reload()
    if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    await expect(page.locator('[data-testid="curriculum-breadcrumb"]')).toContainText(`অপরিচিতা-${tag}`)
    await noSideScroll(page)
  }
  await page.goto('/writer/questions')
  await expect(page.locator('[data-testid="row-curriculum"]').filter({ hasText: `অপরিচিতা-${tag}` })).toHaveCount(2)
  await noSideScroll(page)
  noErrors()
})
