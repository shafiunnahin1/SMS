# খসড়া সিদ্ধান্ত D186: R2.1 প্ল্যান-চেকারে লাইন-ending নিরপেক্ষ হ্যাশ

> এজেন্টের খসড়া — কোনো কোড, guard বা স্পেক বদলানো হয়নি। অনুমোদন করলে `owner\approve-D186.ps1` চালাবেন (একটি commit: সিদ্ধান্তের সারি; push করে না)। guard-এ নতুন task লাগবে না — এটা D182-এর মতো শুধু planning/tooling বদল, `Change-Request: D186` trailer দিয়ে।

## ১. সমস্যা
`infra/spec-verify/gen_r21_plan.py --check` রুটের `RELEASE-2.1.md`-এর SHA-256 মিলিয়ে দেখে, `docs/release/r21-gap-map.json`-এর `imported_draft_sha256`-এর সঙ্গে। সংরক্ষিত হ্যাশটি ফাইলের **CRLF** (Windows) রূপের (`872d9ec3…`), অথচ রিপোজিটরিতে ফাইলটি **LF** (`8a8bac25…`)। তাই চেকটি Windows-এ (git CRLF-এ checkout করে) পাস করে, কিন্তু Linux-এ — ক্লাউড এজেন্ট বা Linux CI — "imported draft provenance" বলে ব্যর্থ হয়। ফাইলটির বিষয়বস্তু 2026-10-15 থেকে বদলায়নি; শুধু লাইন-ending ভিন্ন।

## ২. এজেন্টের প্রস্তাব (সবচেয়ে ছোট বদল)
- চেকার হ্যাশ করার আগে CRLF-কে LF করে নেবে (`read_bytes().replace(b'\r\n', b'\n')`) — একই বিষয়বস্তু যেকোনো OS-এ একই হ্যাশ দেবে; বিষয়বস্তু বদলালে চেক আগের মতোই ব্যর্থ হবে।
- `r21-gap-map.json`-এর `imported_draft_sha256` LF রূপের হ্যাশে (`8a8bac2526f9b60a1e70a82a3f96d12a285808d40d7af60a551fe3023d2619ce`) হালনাগাদ।
- এজেন্ট আগেই পরীক্ষা করেছে (অস্থায়ী কপিতে, পরে হুবহু ফেরত): এই দুই বদলে LF ও CRLF দুই রূপেই `--check` PASS, generated plan আবার বানাতে হয় না ("fresh" থাকে), `test_r21_plan.py` OK; `test_r21_plan.py`-এর provenance পরীক্ষা (ভুল হ্যাশ ধরা) অপরিবর্তিত ও সবুজ; Windows ও Linux দুই জায়গাতেই `--check` PASS।
- `RELEASE-2.1.md`-এর বিষয়বস্তু, অন্য কোনো চেক, কোনো R2.1 task-এর অবস্থা বা runtime switch বদলায় না।

## ৩. সিদ্ধান্তের সারি
| D186 | R2.1 plan check hashes the imported draft independent of line endings | Owner approved (2026-11-01). (1) `infra/spec-verify/gen_r21_plan.py` hashes `RELEASE-2.1.md` after turning CRLF into LF, and `docs/release/r21-gap-map.json` `imported_draft_sha256` is set to that LF hash, so `--check` gives the same result on Windows and Linux; any change to the draft's content still fails the check. (2) The generated R2.1 plan artifacts may be regenerated only as far as this requires; the provenance test in `test_r21_plan.py` keeps rejecting a wrong hash. (3) No other check, task status, R2.1 scope or runtime switch changes. Changes carry `Change-Request: D186` (planning/tooling only, no task). |
