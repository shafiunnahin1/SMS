// infra/loadtest/peak-hour.k6.mjs - the PEAK HOUR, not the average hour: every teacher saves attendance in the same 15 minutes, parents check, the fee counter is busy.
//   k6 run -e BASE_URL=http://demo.lvh.me:8000/api/v1 -e INPUT=infra/loadtest/inputs.json infra/loadtest/peak-hour.k6.mjs
// NOT RUN anywhere yet (k6 and the application do not exist in the specification environment) - it was syntax-parsed only. Endpoint shapes come from docs/API.md and the
// routes template; the login body field names are the least certain part (see docs/AUTHORIZATION.md) and are configurable below.
// WARNING: it WRITES (attendance, fee receipts). Point it at a disposable database, never at production.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { SharedArray } from 'k6/data'

const BASE = __ENV.BASE_URL || 'http://demo.lvh.me:8000/api/v1'            // the tenant is chosen by the Host name (D8: the tenant comes from the request Host), so use that tenant's own host
const DATE = __ENV.DATE || '2027-03-02'
const SCALE = Number(__ENV.SCALE || 1)                                      // multiplies every arrival rate; 1 = the profile below
const input = new SharedArray('input', () => [JSON.parse(open(__ENV.INPUT || './inputs.example.json'))])[0]

// peak profile for ONE tenant host (an arrival rate is per second). Placeholders until you know your real morning curve - derive them from analytics, do not trust these.
export const options = {
  scenarios: {
    teachers_save_attendance: { executor: 'ramping-arrival-rate', exec: 'teacherSaves', startRate: 1, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 400,
      stages: [{ target: 3 * SCALE, duration: '2m' }, { target: 12 * SCALE, duration: '5m' }, { target: 12 * SCALE, duration: '10m' }, { target: 0, duration: '1m' }] },
    parents_browse:           { executor: 'constant-arrival-rate', exec: 'parentBrowses', rate: 20 * SCALE, timeUnit: '1s', duration: '18m', preAllocatedVUs: 50, maxVUs: 400 },
    fee_counter:              { executor: 'constant-arrival-rate', exec: 'counterCollects', rate: 2 * SCALE, timeUnit: '1s', duration: '18m', preAllocatedVUs: 10, maxVUs: 60 },
    admin_lists:              { executor: 'constant-arrival-rate', exec: 'adminLists', rate: 3 * SCALE, timeUnit: '1s', duration: '18m', preAllocatedVUs: 10, maxVUs: 60 },
  },
  thresholds: {                                   // the targets of docs/ops/performance-benchmarks.md; they are PLACEHOLDERS until measured on target hardware
    'http_req_duration{scenario:teachers_save_attendance}': ['p(95)<1000'],     // bulk save is allowed to be slower than a read
    'http_req_duration{scenario:parents_browse}': ['p(95)<500'],
    'http_req_duration{scenario:fee_counter}': ['p(95)<800'],
    'http_req_duration{scenario:admin_lists}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

function login(who) {
  // Field names per docs/AUTHORIZATION.md ("identifier" = email | phone | username). Change here if the implemented API differs.
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ identifier: who.identifier, password: who.password }), { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, tags: { name: 'login' } })
  check(r, { 'login 200': (x) => x.status === 200 })
  return r.json('token') || r.json('data.token')
}
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' } })
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

export function setup() {                          // log everyone in ONCE: a login per iteration would measure bcrypt, not the application
  return {
    teachers: input.teachers.map((t) => ({ ...t, token: login(t) })),
    parents: input.parents.map((p) => ({ ...p, token: login(p) })),
    accountant: { ...input.accountant, token: login(input.accountant) },
    admin: { ...input.admin, token: login(input.admin) },
  }
}

export function teacherSaves(d) {                  // GET the sheet, then POST the whole batch - the screen's real two calls
  const t = pick(d.teachers)
  const g = http.get(`${BASE}/attendance?batch_id=${t.batch_id}&date=${DATE}`, { ...auth(t.token), tags: { name: 'attendance_get' } })
  check(g, { 'attendance sheet 200': (x) => x.status === 200 })
  const records = t.student_ids.map((id, i) => ({ student_id: id, status: i % 12 === 0 ? 'absent' : 'present' }))
  const p = http.post(`${BASE}/attendance`, JSON.stringify({ batch_id: t.batch_id, date: DATE, records }), { ...auth(t.token), tags: { name: 'attendance_post' } })
  check(p, { 'attendance saved 2xx': (x) => x.status >= 200 && x.status < 300 })
  sleep(1)
}

export function parentBrowses(d) {
  const p = pick(d.parents)
  const a = http.get(`${BASE}/student/attendance`, { ...auth(p.token), tags: { name: 'parent_attendance' } })
  const f = http.get(`${BASE}/fees/dues?student_id=${p.student_id}`, { ...auth(p.token), tags: { name: 'parent_dues' } })
  check(a, { 'parent attendance 200': (x) => x.status === 200 }); check(f, { 'parent dues 200': (x) => x.status === 200 })
  sleep(2)
}

export function counterCollects(d) {               // dues, then a cash collection of the first due line
  const sid = pick(input.accountant.student_ids)
  const du = http.get(`${BASE}/fees/dues?student_id=${sid}`, { ...auth(d.accountant.token), tags: { name: 'counter_dues' } })
  check(du, { 'dues 200': (x) => x.status === 200 })
  const lines = (du.json('lines') || du.json('data.lines') || []).slice(0, 1).map((l) => ({ key: l.key }))
  if (lines.length) {
    const c = http.post(`${BASE}/fees/collect`, JSON.stringify({ student_id: sid, lines, payment_method: 'cash' }), { ...auth(d.accountant.token), tags: { name: 'counter_collect' } })
    check(c, { 'collect 2xx': (x) => x.status >= 200 && x.status < 300 })
  }
  sleep(1)
}

export function adminLists(d) {
  const page = 1 + Math.floor(Math.random() * 20)
  const r = http.get(`${BASE}/students?page=${page}`, { ...auth(d.admin.token), tags: { name: 'admin_students' } })
  check(r, { 'students 200': (x) => x.status === 200 })
  sleep(1)
}
