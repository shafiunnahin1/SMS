import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// R2.1.2 (D114 (3)): the Super Admin publishes a question, then finds it on /writer/finder by pasting its text - the
// question is the top, recommended result with qbank's "high match" label. Runs once: playwright.config's testIgnore keeps it
// to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('R2.1.2 a published question is found from its text', async ({ page }) => {
  const tag = Date.now().toString(36)
  const text = `সালোকসংশ্লেষণে কোন গ্যাস নির্গত হয় ${tag}`
  await loginSuper(page)
  await page.goto('/writer/questions/new')
  const form = page.locator('#qb-question-form')
  await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'সংক্ষিপ্ত প্রশ্ন' })
  await form.locator('select[name="qb_subject_id"]').selectOption({ index: 1 })
  await form.locator('textarea[name="question_text"]').fill(text)
  await form.locator('textarea[name="answer_text"]').fill('অক্সিজেন')
  await page.locator('[data-action="save"]').click()
  await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
  const id = page.url().match(/(\d+)$/)[1]
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')

  await page.goto('/writer/finder')
  const finder = page.locator('[data-testid="qb-finder"]')
  await expect(finder.locator('[data-testid="qbf-search"]')).toBeDisabled()
  await finder.locator('textarea[name="text"]').fill(text)
  await finder.locator('[data-testid="qbf-search"]').click()
  const results = page.locator('[data-testid="qbf-results"]')
  await expect(results).toHaveAttribute('data-decision', 'recommended')
  const top = results.locator('li').first()
  await expect(top).toHaveAttribute('data-question', id)
  await expect(top).toHaveAttribute('data-confidence', 'high')
  await expect(top.locator('[data-testid="qbf-recommended"]')).toBeVisible()
  await expect(results).not.toContainText('অক্সিজেন')
})

// D121: step 1 - a question photo is read in the browser with SMS's own tesseract.js copy; the text lands in step 2 for checking,
// and nothing is fetched from another host (no CDN, no language-data server).
test('R2.1.2 a question photo is read locally into the text box', async ({ page, browser }) => {
  const shot = await (await browser.newContext({ viewport: { width: 900, height: 160 } })).newPage()
  await shot.setContent('<body style="margin:0;background:#fff"><p style="font:48px Arial;color:#000;padding:30px">Which gas is released in photosynthesis?</p></body>')
  const photo = await shot.screenshot()
  const outside = []   // the theme's Google Fonts are D52's; anything else from another host would break D121
  const fonts = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (/^https?:$/.test(url.protocol) && !url.hostname.endsWith(BASE.split(':')[0]) && !fonts.test(url.hostname)) outside.push(req.url())
  })
  await loginSuper(page)
  await page.goto('/writer/finder')
  await page.locator('[data-testid="qbf-photo"] input[type="file"]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: photo })
  await expect(page.locator('textarea[name="text"]')).toHaveValue(/photosynthesis/i, { timeout: 90_000 })
  await expect(page.locator('[data-testid="qbf-search"]')).toBeEnabled()
  expect(outside).toEqual([])
})
