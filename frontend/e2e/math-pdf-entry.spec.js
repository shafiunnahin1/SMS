import { test, expect } from '@playwright/test'
import { loginSuper } from './helpers.js'

// Questions copied from Math.pdf (Grade 8, Mathematics, Set 4). Two are entered in the editor;
// the other two are imported through the writer's JSON import screen, as a school writer would.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

const questions = [
  {
    question_text: 'ক² − ১ = ২৪ হলে ক-এর মান কত?',
    answer: '৫',
    explanation: 'ক² = ২৫, তাই প্রদত্ত বিকল্পগুলোর মধ্যে ক = ৫।',
    options: ['৩', '৪', '৫', '৬'],
    correct: 2,
  },
  {
    question_text: 'একটি খোলা জলাধারের দৈর্ঘ্য, প্রস্থ ও উচ্চতা যথাক্রমে ২.৫ মিটার, ২ মিটার এবং ১০০ সেমি। জলাধারটিতে কত কেজি পানি ধরে?',
    answer: '৫০০০ কেজি',
    explanation: '১০০ সেমি = ১ মিটার। আয়তন = ২.৫ × ২ × ১ = ৫ ঘনমিটার; প্রতি ঘনমিটার পানির ভর ১০০০ কেজি, তাই মোট ৫০০০ কেজি।',
    options: ['৫ কেজি', '৫০০ কেজি', '৫০০০ কেজি', '৫০০০০ কেজি'],
    correct: 2,
  },
  {
    question_text: '০ এবং ১/(a + b) এর গুণফল কত?',
    answer: '০',
    explanation: 'শূন্যের সঙ্গে যেকোনো সংখ্যার গুণফল শূন্য।',
    options: ['১/(a + b)', 'a + b', '০', '(a + b)/১'],
    correct: 2,
  },
  {
    question_text: '(x + ৭) ও (x − ৮) এর গুণফল নিচের কোনটি?',
    answer: 'x² − x − ৫৬',
    explanation: '(x + ৭)(x − ৮) = x² − ৮x + ৭x − ৫৬ = x² − x − ৫৬।',
    options: ['x² − x − ৫৬', 'x² − ১৫x + ৫৬', 'x² + ১৫x − ৫৬', 'x² − x + ৫৬'],
    correct: 0,
  },
]

async function curriculum(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/writer/curriculum', { headers: { Accept: 'application/json' }, credentials: 'include' })
    if (!response.ok) throw new Error(`Curriculum request failed: ${response.status}`)
    return (await response.json()).data
  })
}

async function publish(page, url) {
  await page.goto(url)
  await page.locator('[data-action="submit"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'review')
  await page.locator('[data-action="publish"]').click()
  await expect(page.locator('[data-status]').first()).toHaveAttribute('data-status', 'published')
}

test('Grade 8 mathematics questions from the PDF are entered in the editor and imported from JSON', async ({ page }) => {
  test.setTimeout(180_000)
  await loginSuper(page)
  const tree = await curriculum(page)
  const subject = tree.subjects.find(item => /math/i.test(item.name_en ?? '') || /গণিত/.test(item.name_bn ?? ''))
  const classLevel = tree.class_levels.find(item => /8/.test(item.name_en ?? '') || /অষ্টম|৮/.test(item.name_bn ?? ''))
  expect(subject, 'Grade 8 Mathematics subject should exist in the writer curriculum').toBeTruthy()
  expect(classLevel, 'Grade 8 should exist in the writer curriculum').toBeTruthy()

  // Ordinary form workflow: select type, subject and class, enter the question and options, then submit it.
  for (const question of questions.slice(0, 2)) {
    await page.goto('/writer/questions/new')
    const form = page.locator('#qb-question-form')
    await form.locator('select[name="qb_question_type_id"]').selectOption({ label: 'বহুনির্বাচনী প্রশ্ন' })
    await form.locator('select[name="qb_subject_id"]').selectOption(String(subject.id))
    await form.locator(`input[name="class_level_ids"][value="${classLevel.id}"]`).check()
    await form.locator('textarea[name="question_text"]').fill(question.question_text)
    await form.locator('textarea[name="explanation_text"]').fill(question.explanation)
    for (const [index, option] of question.options.entries()) {
      await form.locator(`input[name="options.${index}.content_text"]`).fill(option)
      const correct = form.locator(`input[name="options.${index}.is_correct"]`)
      if (index === question.correct) await correct.check()
      else if (await correct.isChecked()) await correct.uncheck()
    }
    await page.locator('[data-action="save"]').click()
    await expect(page).toHaveURL(/\/writer\/questions\/\d+$/)
    await expect(page.locator('[data-testid="qb-preview"]')).toContainText(question.question_text)
    await publish(page, page.url())
  }

  // JSON workflow: upload the remaining questions, review and import them as drafts, then publish in the editor.
  const json = JSON.stringify({
    schema_version: 'exam-management.universal-content-json.v5',
    document: { title: 'অষ্টম শ্রেণির গণিত — মডেল টেস্ট সেট ৪', language: 'bn' },
    questions: questions.slice(2).map(question => ({
      question_type: 'mcq',
      question_text: question.question_text,
      answer_text: question.answer,
      explanation_text: question.explanation,
      marks: 1,
      difficulty: 2,
      options: question.options.map((text, index) => ({ label: ['ক', 'খ', 'গ', 'ঘ'][index], text, is_correct: index === question.correct })),
      settings: { subject: { name: subject.name_en }, class_levels: [{ name: classLevel.name_en }] },
    })),
  })

  await page.goto('/writer/imports')
  await page.locator('input[type="file"][name="files"]').setInputFiles({
    name: 'grade-8-mathematics-set-4.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await page.locator('[data-testid="qbi-upload"]').click()
  const review = page.locator('[data-testid="qb-import-review"]')
  await expect(review).toHaveAttribute('data-status', 'ready')
  await expect(review.locator('[data-count="invalid"] dd')).toHaveText(/0|০/)
  await expect(review.locator('[data-count="total"] dd')).toHaveText(/2|২/)
  await review.locator('[data-testid="qbi-select-valid"]').click()
  await review.locator('[data-testid="qbi-finalize"]').click()
  await page.getByRole('alertdialog').locator('button').last().click()
  await expect(review.locator('[data-count="imported"] dd')).toHaveText(/2|২/)

  const importedLinks = review.locator('li[data-record] a[href^="/writer/questions/"]')
  await expect(importedLinks).toHaveCount(2)
  const importedUrls = await importedLinks.evaluateAll(links => links.map(link => link.getAttribute('href')))
  for (const url of importedUrls) await publish(page, url)

})
