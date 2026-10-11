import { defineConfig, devices } from '@playwright/test'

// docs/E2E-TESTING.md, R1 scope (AGENT-PLAN-R1 3.8): the SMOKE subset only - F1 login, F2 admission -> fee -> receipt -> parent,
// F5 language toggle - on the three demo tenants (three themes / layouts), plus axe on the login page. The 12-combination matrix
// (bn/ar x mobile/desktop x 3 themes) and visual baselines come with Arabic in a later release.
// Hosts: <slug>.<E2E_BASE_DOMAIN>; lvh.me resolves to 127.0.0.1 publicly, the resolver rule covers machines without DNS.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
const host = (slug) => `http://${slug}.${BASE}`

export const TENANTS = {
  school:   { slug: 'dhanmondi-school', theme: 'classic-blue', layout: 'sidebar-classic', admin: ['principal@dhanmondischool.edu.bd', 'School@1234'], batch: 'Class 10 — A' },
  coaching: { slug: 'alokito-coaching', theme: 'modern-mint',  layout: 'sidebar-mini',    admin: ['admin@alokito.test', 'Coaching@1234'] },
  tutor:    { slug: 'rahim-sir',        theme: 'tutor-lite',   layout: 'mobile-compact',  admin: ['01911111111', 'Tutor@1234'] },
}

const launchOptions = { args: ['--host-resolver-rules=MAP *.lvh.me 127.0.0.1'] }

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                                       // the flows write to one shared demo database
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'e2e/results.xml' }]] : [['list']],
  use: { trace: 'on-first-retry', screenshot: 'only-on-failure', timezoneId: 'Asia/Dhaka', locale: 'bn-BD', launchOptions },
  projects: [
    { name: 'school-desktop',   use: { ...devices['Desktop Chrome'], baseURL: host(TENANTS.school.slug), launchOptions }, metadata: { tenant: 'school' } },
    { name: 'coaching-desktop', use: { ...devices['Desktop Chrome'], baseURL: host(TENANTS.coaching.slug), launchOptions }, testIgnore: /(slice|students|attendance-school|exams-school|panels-school|super)\.smoke|qb-curriculum\.spec|qb-writer\.spec|qb-editor\.spec|qb-structured\.spec/, metadata: { tenant: 'coaching' } },
    { name: 'tutor-mobile',     use: { ...devices['Pixel 5'], baseURL: host(TENANTS.tutor.slug), launchOptions }, testIgnore: /(slice|students|attendance-school|exams-school|panels-school|super)\.smoke|qb-curriculum\.spec|qb-writer\.spec|qb-editor\.spec|qb-structured\.spec/, metadata: { tenant: 'tutor' } },
  ],
})
