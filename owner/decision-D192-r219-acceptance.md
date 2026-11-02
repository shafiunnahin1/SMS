# খসড়া সিদ্ধান্ত D192 — R2.1.9: R2.1-এর চূড়ান্ত গ্রহণ (রিলিজ-লেবেল বদল ছাড়া)

> এজেন্টের খসড়া (2026-11-02)। `owner/approve-D192.ps1` মালিক চালাবেন (এজেন্ট নয়): সারি যোগ + guard-এ R2.1.9 অনুমোদন। দুই commit; পুশ নয়।

## মূল কথা (সহজ ভাষায়)
- R2.1-এর সব ফিচার (প্রশ্নব্যাংক আমদানি, প্রশ্নপত্র, সেট, OMR, পরীক্ষা-পেপার, শিক্ষার্থী-পোর্টাল) **ইতিমধ্যে চলছে** — কারণ `question_bank`, `quiz` মডিউল R3-এর তালিকায় আগে থেকেই আছে। তাই "রিলিজ চালু করা" মানে নতুন কিছু খোলা নয়।
- `config/release.php`-এর `id` 'R3' থেকে 'R2.1'-এ বদলানো **উচিত নয়**: ক্রম R1 < R1.1 < R2 < R3 — 'R2.1' লিখলে মেনুর `since:'R2'`/`'R3'` চিহ্নিত ১৫+টি আইটেম অপ্রত্যাশিতভাবে লুকাতে বা দেখাতে পারে। তাই প্রস্তাব: লেবেল R3-ই থাকবে; R2.1 "R3 runtime-এর ভিতরে গৃহীত" বলে গণ্য হবে।
- গ্রহণ = নিচের পরীক্ষার তালিকা সবুজ + আপনার লিখিত সম্মতি।

## পরীক্ষার তালিকা (R2.1.9-এর Done-When)
1. `php artisan test` (পুরো backend; tenancy, নিরাপত্তা-চুক্তি, OMR, আমদানি, পরীক্ষা-পেপার টেস্ট এর ভিতরে) — 0 ব্যর্থ।
2. `npx vitest run`, `npm run lint:theme`, `npm run build` — 0 ব্যর্থ।
3. Playwright e2e: `frontend/e2e/qb-*.spec.js` (পোর্টাল, আমদানি, প্রশ্নপত্র, সেট, OMR, কুইজ, কেনা, লেখকের আয়) ও `*.smoke.spec.js` (তিন ধরনের demo প্রতিষ্ঠান) — 0 ব্যর্থ।
4. `php artisan qb:import-acceptance --count=10000` (JSON+TOON মিশ্র ১০ হাজার প্রশ্ন, rollback) — পাস।
5. `php artisan qb:reconcile` তিন demo প্রতিষ্ঠানে (`migrate:fresh --seed`, আলাদা স্ক্র্যাচ ডেটাবেস) — 0 গরমিল।
6. `python3 infra/spec-verify/verify.py . --deep` — ALL CHECKS PASSED; `infra/scripts/mysql-smoke.sh` আসল MySQL-এ — 0 failed।
প্রতিটির কমান্ড ও ফল PROGRESS-এ; একটিও লাল থাকলে `[x]` নয় (G11)।

## প্রস্তাবিত সারি
| D192 | R2.1.9 refined: acceptance inside runtime R3, no release-label switch | Owner approved (2026-11-02). R2.1's features already run under runtime R3 (modules `question_bank`, `quiz` in `api/config/release.php`); R2.1 is accepted inside R3 and `config/release.php` `id` stays 'R3' (no runtime switch: the `since` ordering R1 < R1.1 < R2 < R3 has no R2.1 step). R2.1.9 becomes executable after R2.1.8 with `Change-Request: D192`; its Done-When is this registry, every command run and its result written to `docs/PROGRESS.md`: (1) `php artisan test`; (2) `npx vitest run`, `npm run lint:theme`, `npm run build`; (3) Playwright `frontend/e2e/qb-*.spec.js` and `*.smoke.spec.js`; (4) `php artisan qb:import-acceptance --count=10000`; (5) `php artisan qb:reconcile` on a fresh seeded scratch database of the three demo tenants; (6) `python3 infra/spec-verify/verify.py . --deep` and `infra/scripts/mysql-smoke.sh` on MySQL - all green, 0 failed. The agent may fix defects these runs find (within the existing specs, no new table/route/package) and may update only `docs/release/r21-scope.json` / the generated R2.1 plan to mark R2.1.0-R2.1.9 accepted with this decision as the runtime note. A red run is reported in `docs/BLOCKED.md`, never skipped. |
