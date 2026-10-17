import { test, expect } from '@playwright/test'
import { login, loginSuper } from './helpers.js'
import { TENANTS } from '../playwright.config.js'

// QB.5 (D65): on the central host the Super Admin builds a topic, writes a concept and uploads a PDF book (page count read from
// the file, one preview page), sends both for review and publishes them; on the school's host the head teacher finds both in the
// library - titles and the preview page, but locked (nothing bought yet). Runs once: playwright.config's testIgnore keeps it to
// school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
function pdf(pages) {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(' ')
  const objs = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj', `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages} >> endobj`,
    ...Array.from({ length: pages }, (_, i) => `${3 + i} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj`)]
  return Buffer.from(`%PDF-1.4\n${objs.join('\n')}\ntrailer << /Root 1 0 R >>\n%%EOF\n`)
}

async function addNode(page, column, bn, en) {
  await page.locator(`[data-testid="${column}"] [data-action="add"]`).click()
  const form = page.locator('[data-testid="qb-node-form"]')
  await form.locator('input[name="name_bn"]').fill(bn)
  await form.locator('input[name="name_en"]').fill(en)
  await form.locator('button[type="submit"]').click()
  await expect(form).toHaveCount(0)
  await page.locator(`[data-testid="${column}"]`).getByRole('button', { name: bn, exact: true }).click()
}

async function place(form, tag) {
  await form.locator('select[name="qb_subject_id"]').selectOption({ label: `বিষয়-${tag}` })
  await form.locator('select[name="qb_chapter_id"]').selectOption({ label: `অধ্যায়-${tag}` })
  await form.locator('select[name="qb_topic_id"]').selectOption({ label: `টপিক-${tag}` })
}

async function submitAndPublish(page, kind) {
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(new RegExp(`/writer/${kind}/\\d+$`))
  await page.locator('[data-action="submit"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')
}

test('QB.5 a concept and a PDF go through review and show locked in the library', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await loginSuper(page)
  await page.goto('/super-admin/qb/curriculum')
  await addNode(page, 'col-class-levels', `শ্রেণি-${tag}`, `Class ${tag}`)
  await addNode(page, 'col-subjects', `বিষয়-${tag}`, `Subject ${tag}`)
  await addNode(page, 'col-chapters', `অধ্যায়-${tag}`, `Chapter ${tag}`)
  await page.locator('[data-testid="col-topics"] [data-action="add"]').click()
  const node = page.locator('[data-testid="qb-node-form"]')
  await node.locator('input[name="name_bn"]').fill(`টপিক-${tag}`)
  await node.locator('input[name="name_en"]').fill(`Topic ${tag}`)
  await node.locator('button[type="submit"]').click()
  await expect(page.locator('[data-testid="col-topics"]')).toContainText(`টপিক-${tag}`)

  // the concept, with maths in the preview
  await page.goto('/writer/concepts/new')
  let form = page.locator('#qb-concept-form')
  await place(form, tag)
  await form.locator('input[name="title_bn"]').fill(`বেগ-${tag}`)
  await form.locator('textarea[name="body_text"]').fill('বেগ = সরণ / সময়, $v = s/t$')
  await expect(page.locator('[data-testid="qb-preview"]')).toContainText(`বেগ-${tag}`)
  await submitAndPublish(page, 'concepts')

  // the book: a 3-page PDF (the page count comes from the file) and one preview page
  await page.goto('/writer/resources/new')
  form = page.locator('#qb-resource-form')
  await form.locator('select[name="kind"]').selectOption('book')
  await form.locator('input[name="title_bn"]').fill(`গতির বই-${tag}`)
  await place(form, tag)
  await form.locator('input[name="pdf"]').setInputFiles({ name: 'book.pdf', mimeType: 'application/pdf', buffer: pdf(3) })
  await expect(form.locator('input[name="page_count"]')).toHaveValue('3')
  await expect(page.locator('[data-testid="qb-pdf-link"]')).toBeVisible()
  // D68: with poppler on the server the first pages are drawn as previews by themselves (none without it); one is added by hand
  await expect(form.locator('input[name="page_count"]')).toHaveValue('3')
  const auto = await page.locator('[data-testid="qb-previews"] img').count()
  await form.locator('input[name="preview"]').setInputFiles({ name: 'page1.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('[data-testid="qb-previews"] img')).toHaveCount(auto + 1)
  await submitAndPublish(page, 'resources')

  // the school's head teacher: both are there, locked
  const school = await (await browser.newContext({ baseURL: `http://${TENANTS.school.slug}.${BASE}` })).newPage()
  await login(school, ...TENANTS.school.admin)
  await school.goto('/admin/question-bank')
  await school.locator('select[name="subject"]').selectOption({ label: `বিষয়-${tag}` })
  await school.locator('select[name="chapter"]').selectOption({ label: `অধ্যায়-${tag}` })
  await school.locator('select[name="topic"]').selectOption({ label: `টপিক-${tag}` })
  await school.getByRole('tab').nth(1).click()                                    // QB.7: the library opens on questions
  await school.locator('[data-testid="qb-library-list"]').getByText(`বেগ-${tag}`).click()
  await expect(school.locator('[data-testid="qb-locked"]')).toBeVisible()
  await expect(school.locator('[data-testid="qb-library-item"]')).not.toContainText('সরণ')
  await school.getByRole('tab').nth(2).click()
  await school.locator('[data-testid="qb-library-list"]').getByText(`গতির বই-${tag}`).click()
  await expect(school.locator('[data-testid="qb-library-item"] img')).toHaveCount(auto + 1)   // every preview page, the PDF itself locked
  await expect(school.locator('[data-testid="qb-locked"]')).toBeVisible()
  await expect(school.locator('[data-testid="qb-open-file"]')).toHaveCount(0)
})
