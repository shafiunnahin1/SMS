# E2E, Visual & Accessibility Testing (Playwright) — Revision 12

> কেন আলাদা ফাইল: থিম × UI-Pack × লেআউট × তিন ভাষা × RTL — এই ম্যাট্রিক্স হাতে বা unit-test-এ ধরা যায় না। এখন পর্যন্ত **কোনো browser-পরীক্ষা চালানো হয়নি** (এই পরিবেশে Playwright ও ইন্টারনেট নেই); নিচের কনফিগ কেবল সিনট্যাক্স-পার্স করা। এটি পর্যায় C (UI-Pack পাতা-সাজ, `docs/UI-PACKS.md`) ও আরবি-RTL-এর **পূর্বশর্ত** (`docs/ROADMAP.md`)।
> বাস্তবায়ন-ধাপ: `docs/BUILD-SEQUENCE.md` Step 3.8 (harness) → প্রতিটি মডিউল-Step-এ নিজের flow।

## ১. কী ধরা পড়বে, কী মার্জ আটকাবে
| স্তর | কী | কখন | মার্জ আটকায়? |
|---|---|---|---|
| **Smoke flows** | প্রধান ব্যবহারকারী-যাত্রা (§৩) | প্রতি PR | হ্যাঁ |
| **Layout/RTL assertions** | `<html lang dir data-locale>`, sidebar/tab-bar পাশ, দিক-সূচক আইকন আয়না | প্রতি PR (ছোট সেট) | হ্যাঁ |
| **a11y (axe)** | গুরুতর/serious লঙ্ঘন শূন্য, ৮টি মূল পাতা × ১২ কম্বিনেশন | প্রতি PR (সংক্ষিপ্ত) + nightly (পূর্ণ) | serious/critical হলে হ্যাঁ |
| **Visual regression** | মূল পাতার স্ক্রিনশট × ১২ কম্বিনেশন | nightly + `visual` লেবেল দেওয়া PR | হ্যাঁ (সম্মতি ছাড়া baseline বদলায় না) |
| **Pack contract (UI)** | `data-action` সেট ltr/rtl | Vitest-এ (`PackContractTest`) — E2E-তে নয় | Vitest-এ হ্যাঁ |
| **PDF সারাংশ** | রসিদ/marksheet ডাউনলোড হয়, পাঠ্যে নম্বর আছে | nightly | না (সতর্কতা); চূড়ান্ত engine বাছাই S5c-তে |

## ২. কম্বিনেশন-ম্যাট্রিক্স
থিম ৩ (`classic-blue`, `modern-mint`, `tutor-lite`) × ভাষা-দিক ২ (`bn` LTR, `ar` RTL) × ভিউপোর্ট ২ (মোবাইল ৩৬০×৭৪০, ডেস্কটপ ১২৮০×৮০০) = **১২ প্রজেক্ট**। `en` একটি অতিরিক্ত সংক্ষিপ্ত smoke। `font_scale 1.5` ও `high_contrast` (`quick-wins.md` §৩) আলাদা ৩-থিম × RTL × মোবাইল সেট।
```js
// playwright.config.js   (parsed for syntax only - NOT executed; the exact option names must be checked against the Playwright version you install)
import { defineConfig, devices } from '@playwright/test'

const THEMES = [
  { key: 'classic-blue', host: 'dhanmondi-school.test' },   // layout sidebar-classic, school
  { key: 'modern-mint',  host: 'alokito-coaching.test' },   // layout sidebar-mini, coaching
  { key: 'tutor-lite',   host: 'rahim-sir.test' },          // layout mobile-compact, private_batch
]
const LOCALES   = [{ locale: 'bn', dir: 'ltr' }, { locale: 'ar', dir: 'rtl' }]
const VIEWPORTS = [{ name: 'mobile', width: 360, height: 740 }, { name: 'desktop', width: 1280, height: 800 }]

const matrix = []
for (const t of THEMES) for (const l of LOCALES) for (const v of VIEWPORTS) {
  matrix.push({
    name: `${t.key}-${l.locale}-${v.name}`,
    testMatch: /.*\.(visual|a11y|layout)\.spec\.js/,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: v.width, height: v.height },
      baseURL: `https://${t.host}`,
      locale: l.locale === 'ar' ? 'ar' : 'bn-BD',
      timezoneId: 'Asia/Dhaka',
      storageState: `e2e/.auth/${t.key}-admin.json`,
      extraHTTPHeaders: { 'x-e2e-locale': l.locale },
    },
    metadata: { themeKey: t.key, locale: l.locale, dir: l.dir, viewport: v.name },
  })
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' } },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [['html', { open: 'never' }], ['junit', { outputFile: 'e2e/results.xml' }]],
  use: { trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'smoke-desktop', testMatch: /.*\.smoke\.spec\.js/, use: { ...devices['Desktop Chrome'], baseURL: 'https://dhanmondi-school.test' } },
    { name: 'smoke-mobile',  testMatch: /.*\.smoke\.spec\.js/, use: { ...devices['Pixel 5'],       baseURL: 'https://rahim-sir.test' } },
    ...matrix,
  ],
})
```
**বাস্তব সংরক্ষণ:** `*.test` host-গুলো CI-তে hosts-ফাইল/Caddy-তে বাঁধা; ফন্ট অ্যাপের সাথে bundle (সিস্টেম-ফন্ট নির্ভরতা নেই — নইলে স্ক্রিনশট মেশিনভেদে ভিন্ন); Chromium-সংস্করণ ও Playwright-সংস্করণ pin।

## ৩. Smoke flows (প্রতি PR)
| # | Flow | মূল assertion |
|---|---|---|
| F1 | Admin লগইন → ড্যাশবোর্ড | থিম-রঙ/লেআউট প্রত্যাশিত; কনসোলে ত্রুটি নেই |
| F2 | ভর্তি → ফি আদায় (নগদ) → রসিদ ডাউনলোড → অভিভাবক-লগইনে একই রসিদ | **Walking skeleton** (`docs/spike/walking-skeleton.md`) |
| F3 | হাজিরা নেওয়া (ডেস্কটপ গ্রিড; মোবাইলে সেগমেন্টেড/কার্ড) | সবাই-উপস্থিত → সংরক্ষণ → অনুপস্থিতদের SMS-কিউ |
| F4 | অনলাইন ফি-পেমেন্ট (sandbox/`FakeQrGateway`) | সফল ⇒ রসিদ, ব্যর্থ ⇒ `review` নয় `failed`, টাকা-কাটা-ব্যর্থ ⇒ `review` |
| F5 | ভাষা-টগল bn→en→ar | `<html lang dir>` বদলায়, রিলোড ছাড়া; `users.locale` সংরক্ষিত |
| F6 | থিম/pack বদল (Pro+) | অসঙ্গত layout+pack ⇒ 422 বার্তা; সঙ্গত ⇒ তাৎক্ষণিক |
| F7 | পাবলিক সাইট → ভর্তি-আবেদন → আবেদন-ফি | লিড তৈরি, ফি-অবস্থা; পাবলিক এন্ডপয়েন্টে ছাত্র-ডেটা নেই |
| F8 | নোটিশ `require_ack` → অভিভাবক স্বীকার → Admin-রিপোর্ট | অস্বীকৃতি-তালিকা |
| F9 | Payroll run (ড্রাফট→অনুমোদন (দুই ব্যবহারকারী)→পরিশোধ) | সংখ্যা golden ফিক্সচারের সাথে; নিজের-অনুমোদন নিষিদ্ধ |
| F10 | Impersonation (সাপোর্ট-টিকিট grant সহ) | ব্যানার, read-only; payroll route 403 `sensitive_scope` |
| F11 | সনদ ইস্যু → QR যাচাই-পাতা | "বৈধ"; বাতিলে "বাতিল" |
| F12 | RTL মোবাইল: লগইন → হাজিরা → রসিদ | sidebar/tab-bar পাশ, তীর-আইকন আয়না, ফোন/ID `dir=ltr` |
| F13 | অ্যাক্সেসিবিলিটি: `font_scale 1.5` + high-contrast | কোনো ওভারফ্লো নেই; বাটন ≥৪৪px |
| F14 | ডেটা-মাইগ্রেশন (ছোট ফাইল) dry-run → run → rollback | সংখ্যা মেলে |

## ৪. Visual regression — নিয়ম
- **একটিই baseline-পরিবেশ:** স্ক্রিনশট শুধু CI-র pinned কনটেইনারে বানানো; লোকাল মেশিনের স্ক্রিনশট baseline হয় না।
- **অস্থিরতা বাদ:** তারিখ/সময়/র‍্যান্ডম id/চার্ট-অ্যানিমেশন `mask`; ঘড়ি স্থির (Playwright-এর clock API অথবা `addInitScript` দিয়ে `Date` mock — সংস্করণ অনুযায়ী); seed-ডেটা নির্ধারিত।
- **baseline বদল = স্পষ্ট অনুমোদন:** PR-এ `visual-update` লেবেল + রিভিউয়ার দুটি ছবি পাশাপাশি দেখে অনুমোদন; স্বয়ংক্রিয় আপডেট নেই।
- **পাতার তালিকা (৮):** লগইন · ড্যাশবোর্ড · ছাত্র-তালিকা · হাজিরা · ফি-আদায় · রসিদ (HTML-দৃশ্য) · ফলাফল · নোটিশ।
- সীমা `maxDiffPixelRatio` ০.২% (শুরুর প্রস্তাব — Spike-এ প্রকৃত ঝুঁকি দেখে সমন্বয়)।

## ৫. a11y ও RTL assertions — নমুনা
```js
// e2e/a11y.a11y.spec.js   (illustrative - package names/versions to be verified when installed)
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGES = ['/login', '/admin', '/admin/students', '/admin/attendance', '/admin/fees/collect', '/admin/notices', '/admin/exams']

for (const path of PAGES) {
  test(`axe: ${path}`, async ({ page }, testInfo) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    expect(bad, bad.map(v => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
}

test('RTL: html attributes and sidebar side', async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.dir !== 'rtl')
  await page.goto('/admin')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  const nav = page.locator('[data-testid="app-nav"]')
  const box = await nav.boundingBox()
  const vw = page.viewportSize().width
  expect(box.x + box.width / 2).toBeGreaterThan(vw / 2)       // the navigation sits on the right in RTL
})
```
(`data-testid` নাম স্থির চুক্তি: `app-nav`, `app-topbar`, `language-switcher`, `page-header`; layout-ফাইল এগুলো দেয়।)

## ৬. ডেটা ও পরিবেশ
- তিন demo tenant (`docs/database/seeders.md`) + `php artisan e2e:reset` (শুধু `APP_ENV=testing`, প্রোডাকশনে বিদ্যমানই নয়) প্রতি spec-ফাইলের আগে ডেটা পুনঃস্থাপন; `storageState` লগইন একবার।
- বাইরের সেবা stub: SMS (লগে লেখে), পেমেন্ট `FakeQrGateway` (dev-only, D24), PDF — আসল engine; ইমেইল — লগ।
- সময়-বাজেট: smoke ≤ ১০ মিনিট (প্রতি PR), পূর্ণ ম্যাট্রিক্স nightly। বাজেট-সংখ্যা Spike-এ মেপে বসবে — **অনুমান নয়**।
- ফ্লেকি নীতি: retry ১; দুবার ব্যর্থ ⇒ quarantine-ট্যাগ + issue; quarantine > ৫টি হলে নতুন ফিচার-মার্জ বন্ধ।

## ৭. Done When (Step 3.8)
- [ ] F1, F2, F5, F12 তিন থিমে পাস; ১২-কম্বিনেশনের লগইন-পাতা স্ক্রিনশট baseline তৈরি ও দ্বিতীয় রানে সবুজ
- [ ] axe: ৮ পাতা × ১২ কম্বিনেশনে serious/critical = ০ (বা প্রতিটি ব্যতিক্রম লিখিত কারণসহ)
- [ ] ইচ্ছাকৃত RTL-ভাঙা (একটি `ml-4`) ও কনট্রাস্ট-ভাঙা CSS-এ পরীক্ষা ব্যর্থ হয় (mutation-পরীক্ষা, `docs/reports/VERIFICATION-R10.md` §৪-এর নীতিতে)
