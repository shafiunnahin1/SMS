# খসড়া সিদ্ধান্ত D172: আগে থেকে ব্যর্থ ৭টি backend test মেরামত (STIM.1 সবুজ করার জন্য)

> এজেন্টের খসড়া — কোনো কোড, test বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D172.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ BASE.1 → BASE.2 → BASE.3, তারপর STIM.2 এগুলোর পরে; push করে না)।
> মালিকের বাছাই (2026-10-27): **ক** — আলাদা অনুমোদিত টাস্কে ৭টি ঠিক করা।

## ১. কারণ (base commit `1aa2408`-এও একই ব্যর্থতা; STIM.1-এর কারণে নয়)
| # | Test | কারণ | কোথায় ঠিক হবে |
|---|---|---|---|
| 1 | `RoleMatrixContractTest` (২টি) | `POST writer/imports/{id}/records/{record}/open-editor` route-টি (D153) `tests/Fixtures/role-matrix.php`-এ নেই | fixture-এ একটি সারি (route যেমন আছে তেমন role) |
| 2 | `DepartmentRouteInventoryTest` | `POST writer/qb/{kind}` (D141, লেখকের পাঠ্যক্রম-আইটেম) কোনো শ্রেণিতে নেই | `DepartmentRouteCatalog`-এ classification যোগ (প্রতিষ্ঠানের staff-এর জন্য নয়; লেখক-panel route) |
| 3 | `QbImportAcceptanceTest` | D154-এর `qb.import.submitted` audit লগে actor নেই (login ছাড়া service চালালে `user_id` null) | কোড: যিনি import করছেন তাকেই actor হিসেবে লেখা |
| 4 | `QbPdfImportTest` | test এখনো `draft` আশা করে, অথচ D154 অনুযায়ী PDF import-ও সরাসরি `review`-এ যায় | test-এর প্রত্যাশা D154-এর সাথে মেলানো (`review`) — **test বদল, তাই আপনার অনুমোদন লাগে** |
| 5 | `QbJsonToonImportTest` (২টি) | MySQL JSON কলাম key-এর ক্রম নিজে বদলে ফেলে (দৈর্ঘ্য অনুযায়ী); test হুবহু ক্রম মেলায় | নিচের প্রশ্ন ২ |
| 6 | `QbOmrFormTest` | একই — `settings_json`-এর key-ক্রম | নিচের প্রশ্ন ২ |

## ২. মালিকের কাছে প্রশ্ন
1. **#4:** D154 অনুযায়ী PDF import `review`-এ যাবে, তাই test-এর প্রত্যাশা `draft` → `review` করা ঠিক? (সুপারিশ: হ্যাঁ — কোড ঠিক আছে, test পুরনো।)
2. **#5, #6 (key-এর ক্রম):**
   - ক) কোড ঠিক করা: এই JSON ঘরগুলো পড়ার সময় key-গুলো নির্দিষ্ট ক্রমে সাজিয়ে দেওয়া (test অপরিবর্তিত);
   - খ) test-এ শুধু মান ও key মেলানো, ক্রম নয় (`assertEquals` + key সাজানো) — test বদল।
   - (সুপারিশ: **ক** — test অক্ষত থাকে, আর API-র উত্তরও সব ডেটাবেসে একই ক্রমে আসে।)

## ৩. সিদ্ধান্তের সারি
| D172 | Repair of seven backend tests that already failed before STIM.1 (base 1aa2408) | Owner approved (2026-10-27). (1) BASE.1 — route registration: add `POST api/v1/writer/imports/{id}/records/{record}/open-editor` (D153) to `tests/Fixtures/role-matrix.php` with the roles the live route already admits, and classify `POST api/v1/writer/qb/{kind}` (D141) in `DepartmentRouteCatalog` as a platform writer route that no institution staff may use; no route, role or middleware changes. (2) BASE.2 — import moderation: the `qb.import.submitted` audit row (D154) records the importing user as its actor even without a logged-in request; `QbPdfImportTest`'s expectation changes from `draft` to `review`, because D154 sends PDF imports to moderation too (the only test expectation this decision changes). (3) BASE.3 — JSON key order: an import record's occurrences and an OMR form's `settings_json` are returned with their keys in a fixed field order, whatever order the database stores; the tests stay as they are. (4) No new table, column, route or package; D123/D127/D141/D153/D154 otherwise unchanged. (5) Tasks in order BASE.1, BASE.2, BASE.3 after STIM.1's code (`652c6d3`); once the full suite is green STIM.1 is checked off, then STIM.2 follows; commits carry `Change-Request: D172`. |

## ৪. মালিকের উত্তর
(অনুমোদনের আগে এখানে লিখুন: 1 হ্যাঁ/না, 2 ক/খ। সারিটি ধরে নিয়েছে 1 = হ্যাঁ, 2 = ক; অন্য উত্তর হলে এজেন্টকে বলুন, সারি বদলে দেবে।)
