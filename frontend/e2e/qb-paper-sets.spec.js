import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// R2.1.5 (D126): the Super Admin publishes two short questions and writes a blueprint; the head teacher builds a paper from that
// blueprint (sections filled from it), saves (buying the questions), files it into a new folder, makes it final as 2 sets named
// ক/খ with the questions shuffled, and sees a print button for every set. Runs once: playwright.config keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('R2.1.5 a paper from a blueprint, in a folder, printed as two sets', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/super-admin/institutions')
  await page.getByText(TENANTS.school.slug).first().click()
  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('5')
  await wallet.locator('input[name="note"]').fill(`sets e2e ${tag}`)
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText(`sets e2e ${tag}`)

  for (const n of [1, 2]) {
    await page.goto('/writer/questions/new')
    const form = page.locator('#qb-question-form')
    await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
    await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
    await form.locator('textarea[name="question_text"]').fill(`সেট পরীক্ষা ${n} ${tag}`)
    await form.locator('textarea[name="answer_text"]').fill('উত্তর')
    await page.locator('[data-action="save"]').click()
    await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
    await page.locator('[data-action="submit"]').click()
    await page.locator('[data-action="publish"]').click()
    await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')
  }

  await page.goto('/super-admin/qb/blueprints')
  await page.locator('[data-action="new-blueprint"]').click()
  const bp = page.locator('[data-testid="blueprint-form"]')
  await bp.locator('input[name="name_bn"]').fill(`ব্লুপ্রিন্ট ${tag}`)
  await bp.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await bp.locator('input[name="rule-0-section"]').fill('ক-বিভাগ')
  await bp.locator('select[name="rule-0-type"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await bp.locator('input[name="rule-0-count"]').fill('2')
  await bp.locator('input[name="rule-0-marks"]').fill('2')
  await bp.locator('[data-action="save-blueprint"]').click()
  await expect(page.locator('[data-testid="qb-blueprints"]')).toContainText(`ব্লুপ্রিন্ট ${tag}`)

  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  // buy the two questions first through an ordinary paper, so the blueprint finds them eligible (bought)
  await school.goto('/admin/question-bank/papers/new')
  await school.locator('input[name="title"]').fill(`কেনা ${tag}`)
  await school.locator('input[name="section-0-title"]').fill('ক')
  await school.locator('[data-testid="paper-picker"] input[name="q"]').fill(tag)
  await expect(school.locator('[data-testid="paper-picker"] [data-action="add-question"]')).toHaveCount(2)
  await school.locator('[data-testid="paper-picker"] [data-action="add-question"]').nth(0).click()
  await school.locator('[data-testid="paper-picker"] [data-action="add-question"]').nth(1).click()
  await school.locator('[data-action="save"]').click()
  await school.getByRole('alertdialog').getByRole('button').last().click()
  await expect(school).toHaveURL(/\/admin\/question-bank\/papers\/\d+$/)

  await school.goto('/admin/question-bank/papers/new')
  const pick = school.locator('[data-testid="paper-blueprint"] select[name="blueprint"]')
  await pick.selectOption({ label: `ব্লুপ্রিন্ট ${tag} (4.00)` })
  await expect(school.locator('input[name="title"]')).toHaveValue(`ব্লুপ্রিন্ট ${tag}`)
  await expect(school.locator('[data-testid="paper-section-0"] li')).toHaveCount(2)
  await expect(school.locator('input[name="section-0-title"]')).toHaveValue('ক-বিভাগ')
  await school.locator('select[name="sets_count"]').selectOption('2')
  await school.locator('[data-action="save"]').click()
  await expect(school).toHaveURL(/\/admin\/question-bank\/papers\/\d+$/)
  const paperUrl = school.url()

  await school.locator('[data-testid="paper-set-options"] select[name="strategy"]').selectOption('serial')
  await school.locator('[data-testid="paper-set-options"] select[name="set_names"]').selectOption('bangla')
  await school.locator('[data-action="finalize"]').click()
  await expect(school.locator('[data-status="final"]')).toBeVisible()
  await expect(school.getByRole('button', { name: /সেট A প্রিন্ট|Print set A/ })).toBeVisible()
  await expect(school.getByRole('button', { name: /সেট B প্রিন্ট|Print set B/ })).toBeVisible()
  await expect(school.locator('input[name="columns"]')).toBeVisible()

  await school.goto('/admin/question-bank/papers')
  const folders = school.locator('[data-testid="qb-folders"]')
  await folders.locator('input[name="folder_name"]').fill(`ফোল্ডার ${tag}`)
  await folders.locator('[data-action="new-folder"]').click()
  await expect(folders).toContainText(`ফোল্ডার ${tag}`)
  const id = paperUrl.match(/(\d+)$/)[1]
  await school.locator(`select[name="folder-${id}"]`).selectOption({ label: `ফোল্ডার ${tag}` })
  await folders.getByText(`ফোল্ডার ${tag}`).click()
  await expect(school.locator('[data-testid="qb-papers"]')).toContainText(`ব্লুপ্রিন্ট ${tag}`)
  await expect(school.locator('[data-testid="qb-papers"]')).not.toContainText(`কেনা ${tag}`)
})
