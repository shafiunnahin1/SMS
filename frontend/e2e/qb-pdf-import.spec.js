import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// R2.1.4 (D124): a PDF made in the browser (an MCQ and a short question on page 1, a blank page 2) is uploaded on the import
// page; the review shows the page range, the hybrid kind with page 2 unreadable, each question's source page, and a staged
// question can be rejected and brought back. Runs once: playwright.config's testIgnore keeps it to school-desktop.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('R2.1.4 a PDF is split into staged questions with their pages', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  const maker = await (await browser.newContext()).newPage()
  await maker.setContent(`<html><body style="font-family:sans-serif">
    <div style="page-break-after:always"><p>1. What is the capital of Bangladesh? ${tag}</p><p>A. Dhaka</p><p>B. Khulna</p><p>Answer: A</p>
    <p>2. Name the largest planet of the solar system. ${tag}</p><p>Answer: Jupiter</p></div><div><p>.</p></div></body></html>`)
  const pdf = await maker.pdf({ format: 'A4' })

  await loginSuper(page)
  await page.goto('/writer/imports')
  await page.locator('input[type="file"][name="files"]').setInputFiles({ name: `e2e-${tag}.pdf`, mimeType: 'application/pdf', buffer: pdf })
  await expect(page.locator('[data-testid="qbi-range"]')).toBeVisible()
  await page.locator('[data-testid="qbi-upload"]').click()

  const review = page.locator('[data-testid="qb-import-review"]')
  await expect(review).toHaveAttribute('data-status', 'ready')
  await expect(review.locator('[data-testid="qbi-pdf"]')).toHaveAttribute('data-kind', 'hybrid')
  await expect(review.locator('[data-count="total"] dd')).toHaveText(/2|২/)
  await expect(review.locator('li[data-record="1"] [data-testid="qbi-page"]')).toBeVisible()
  await expect(review.locator('li[data-record="1"]')).toContainText(tag)

  await review.locator('li[data-record="2"] [data-testid="qbi-reject"]').click()
  await expect(review.locator('li[data-record="2"]')).toHaveAttribute('data-rejected', '1')
  await review.locator('li[data-record="2"] [data-testid="qbi-reject"]').click()
  await expect(review.locator('li[data-record="2"]')).toHaveAttribute('data-rejected', '0')
})
