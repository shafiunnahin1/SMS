import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// D204 GAP.4 (school demo only - playwright.config.js keeps it off the other tenants): a teacher's approved leave leaves a period
// uncovered; the admin offers it to the demo teacher, who accepts it. The setup goes through the API with the admin's token (a new
// teacher with a period next week), so every run makes its own period and never depends on what earlier runs left behind.
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const TEACHER = ['teacher@dhanmondischool.edu.bd', 'Teacher@1234']

// The API calls run in Node, which has no browser resolver rule: *.lvh.me is 127.0.0.1 by definition, so call that address and
// name the tenant in the Host header (the API finds the institution from the Host only).
function target(baseURL) {
  const u = new URL(baseURL)
  return u.hostname.endsWith('lvh.me') ? { origin: `${u.protocol}//127.0.0.1:${u.port}`, host: u.host } : { origin: u.origin, host: null }
}

async function apiAs(request, baseURL, identifier, password) {
  const { origin, host } = target(baseURL)
  const hostHeader = host ? { Host: host } : {}
  const r = await request.post(`${origin}/api/v1/auth/login`, { data: { login: identifier, password }, headers: hostHeader })
  expect(r.ok(), await r.text()).toBeTruthy()
  const token = (await r.json()).data.token
  expect(token).toBeTruthy()
  const call = async (method, url, data) => {
    const res = await request.fetch(`${origin}/api/v1/${url}`, { method, data, headers: { ...hostHeader, Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    expect(res.ok(), `${method} ${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return (await res.json()).data
  }
  call.status = async (method, url, data) => (await request.fetch(`${origin}/api/v1/${url}`, { method, data, headers: { ...hostHeader, Authorization: `Bearer ${token}`, Accept: 'application/json' } })).status()
  return call
}

test('GAP.4 cover: the admin offers an uncovered period, the teacher accepts it', async ({ page, request, browser }, testInfo) => {
  const tenant = tenantOf(testInfo)
  const api = await apiAs(request, testInfo.project.use.baseURL, ...tenant.admin)
  const stamp = Date.now() % 1000000
  const list = (x) => (Array.isArray(x) ? x : x.data)
  const batches = list(await api('GET', 'batches'))
  const subjects = list(await api('GET', 'subjects'))
  const subject = subjects.find(sb => batches.some(b => String(b.program_id ?? b.program?.id) === String(sb.program_id)))
  expect(subject, 'a subject whose program has a batch').toBeTruthy()
  const programId = subject.program_id
  const batch = batches.find(b => String(b.program_id ?? b.program?.id) === String(programId))
  const away = await api('POST', 'teachers', { name: `E2E ছুটির শিক্ষক ${stamp}`, email: `e2e-leave-${stamp}@example.test` })
  const types = await api('GET', 'hr/leave-types')
  const type = list(types)[0] ?? await api('POST', 'hr/leave-types', { name: 'E2E ছুটি', max_days_per_year: 20, is_paid: true })
  const karim = list(await api('GET', 'teachers?per_page=100')).find(t => t.email === TEACHER[0])
  expect(karim, 'the demo teacher').toBeTruthy()
  // a day 8-30 days ahead on which the batch has no period at this run's time and the demo teacher is free (earlier runs or
  // demos may have used some days); the time differs per run: 05:MM-05:MM+7
  const mm = String(stamp % 50).padStart(2, '0'), end = String(stamp % 50 + 7).padStart(2, '0')
  const at = `05:${mm}`
  let date = null
  for (let n = 8; n <= 30 && !date; n++) {
    const day = new Date(Date.now() + n * 86400000)
    const d = day.toISOString().slice(0, 10)
    if (await api.status('POST', 'routines', { program_id: programId, batch_id: batch.id, subject_id: subject.id, teacher_id: away.id, day_of_week: DAYS[day.getUTCDay()], start_time: at, end_time: `05:${end}` }) !== 201) continue
    const leave = await api('POST', 'hr/leaves', { user_id: away.user_id, leave_type_id: type.id, from_date: d, to_date: d, reason: 'e2e' })
    await api('PATCH', `hr/leaves/${leave.id}/approve`)
    const slot = (await api('GET', `hr/leaves/${leave.id}/substitution-slots`)).slots.find(x => x.occurrence_date === d)
    if (slot && list(await api('GET', `hr/leaves/${leave.id}/substitution-slots/${slot.id}/candidates`)).some(c => c.id === karim.id)) date = d
  }
  expect(date, 'a day on which the demo teacher is free').toBeTruthy()

  // the admin offers the period to the demo teacher
  const noErrors = watchConsole(page)
  await login(page, ...tenant.admin)
  await page.goto('/admin/academic/substitutions')
  const card = page.locator('[data-testid="cover-slot"]', { hasText: at }).filter({ hasText: date }).first()
  await expect(card).toBeVisible({ timeout: 20000 })
  const pick = card.locator('select')
  await expect(pick.locator('option')).not.toHaveCount(1, { timeout: 15000 })
  await pick.selectOption(String(karim.id))
  await card.getByRole('button', { name: /প্রস্তাব দিন|^Offer$/ }).click()
  noErrors()

  // the teacher accepts it
  const teacher = await (await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'bn-BD', timezoneId: 'Asia/Dhaka' })).newPage()
  const teacherErrors = watchConsole(teacher)
  await login(teacher, ...TEACHER)
  await teacher.goto('/teacher/substitutions')
  const offer = teacher.locator('[data-testid="cover-slot"]', { hasText: at }).filter({ hasText: date }).first()
  await expect(offer).toBeVisible({ timeout: 20000 })
  await offer.getByRole('button', { name: /^গ্রহণ$|^Accept$/ }).click()
  await expect(teacher.locator('[data-testid="cover-slot"]', { hasText: at }).filter({ hasText: date }).first()).toContainText(/নিশ্চিত|Confirmed/, { timeout: 15000 })
  teacherErrors()
})
