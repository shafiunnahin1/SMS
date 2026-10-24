# খসড়া সিদ্ধান্ত D157 — প্রশ্নপত্রের সেট মোছা (এক বা একাধিক)

> এজেন্টের খসড়া। মালিক অনুমোদন করলে `docs/LOCKED-DECISIONS.md`-এ নিচের সারিটি নিজে যোগ করবেন (আলাদা commit, trailer `Change-Request: D157`)। অনুমোদনের আগে সেট মোছার কোড বানানো হবে না।

## কেন সিদ্ধান্ত লাগছে
- মালিক চেয়েছেন: বহুনির্বাচনী প্রশ্নের সেট পরে মোছা যাবে, এক বা একাধিক সেট বেছে একসাথে।
- qbank-এ (revision 40f769c) subset শুধু তৈরি করা যায়, মোছার কোনো route বা বোতাম নেই। D110 বলে R2.1-এ "no new workflow", আর D126/D133-এ সেট মোছার কথা নেই। তাই এটা নতুন workflow, মালিকের লিখিত সিদ্ধান্ত লাগবে।
- সেট তৈরি করা (qbank-এর "create subsets") D126 (2) ও D133-এর মধ্যেই পড়ে, সেটা বানানো হয়ে গেছে।

## প্রস্তাবিত সারি (মালিকের পছন্দ 2026-10-24: নাম ক্রমানুসারে বসবে)
| D157 | Delete question-paper sets (amends D110, D126 (2), D133) | Owner approved (2026-10-24). (1) On a final paper's sets list the head teacher or the paper's teacher may select one or more sets and delete them together; the main set (the first set, A/ক) cannot be deleted. (2) No set can be deleted once any OMR sheet of the paper has been scanned (as D133). (3) After a deletion the remaining sets are renumbered in order and take the names of their new positions (e.g. deleting খ from ক, খ, গ, ঘ makes the old গ into খ and the old ঘ into গ); each remaining set's question order, option order and answer key stay unchanged, only its name changes; the confirm message shows the new names before deleting. (4) A generated OMR layout is unlocked and rebuilt with the new set count on the next "OMR". (5) The deletion is written to the audit log. No new table: rows of `qb_paper_variants` are deleted; the action uses the existing finalize route (D133 "create sets" is that action), so the route and permission contracts stay unchanged. |

## মালিককে যা করতে হবে
PowerShell-এ রিপোজিটরির ভিতরে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D157.ps1` — এটি সারিটি `docs/LOCKED-DECISIONS.md`-এ D155-এর পরে যোগ করে `Change-Request: D157` সহ commit করে ও push করে।
