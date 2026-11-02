# খসড়া সিদ্ধান্ত D188 — স্পেক-যাচাই (`verify.py . --deep`) মেরামত

> এজেন্টের খসড়া (2026-11-02)। মালিক অনুমোদন করলে `owner/approve-D188.ps1` চালাবেন (নিচের সারি `docs/LOCKED-DECISIONS.md`-এ যোগ + guard-এ টাস্ক SVR.1)। এজেন্ট স্ক্রিপ্ট চালায় না।

## এখন কী ভাঙা (2026-11-02, branch claude/r216-omr-d127 @ cd9a276)
`python3 infra/spec-verify/verify.py . --deep` মাঝপথে থেমে যায়; থামার আগে ও পরে এই ব্যর্থতাগুলো পাওয়া গেছে (একটি অস্থায়ী কপিতে কারণ ১ ঠিক করে চালিয়ে দেখা):

1. **এজেন্টের ভুল (ST.2, commit b40e6d1):** `schema.sql`-এ তিনটি pivot টেবিলে (`qb_chapter_class_level`, `qb_question_class_level`, `qb_curriculum_version_class_level`) `FOREIGN KEY (qb_exam_batch_id)` ঢুকে গেছে, অথচ ওদের ওই কলামই নেই (একই লাইন খুঁজে বদলানোর সময় বেশি জায়গায় বসেছিল)। আসল migration-এ এই FK নেই; শুধু `schema.sql`-এর ভুল। এটিতেই যাচাই থেমে যায়।
2. **যাচাই-স্ক্রিপ্ট MySQL-এর `FULLTEXT INDEX ... WITH PARSER ngram` (D164) বোঝে না** — `ai_answer_bank`, `ai_help_articles` টেবিল ও ৪টি `ALTER TABLE ... ADD FULLTEXT INDEX` SQLite-এ চালাতে গিয়ে ব্যর্থ। স্কিমা ঠিক আছে; শুধু অনুবাদক (infra/spec-verify) এগুলো বাদ দিতে জানে না।
3. **migration-তালিকা পুরনো:** `docs/database/migrations.md` ও `docs/DATABASE.md`-এ R2.1 থেকে D187 পর্যন্ত বানানো ৩১টি টেবিল নেই (ai_*, qb_paper_*, qb_omr_*, exam_papers, learner_profiles, module_prices, … )।
4. **D12 নিয়ম ("tenant টেবিলে global UNIQUE নয়")** তিনটিতে লাগে: `exam_mark_submissions(exam_subject_id)`, `ai_reviews(ai_message_id)`, `learner_profiles(user_id)`। তিনটিই অন্য সারির id-র উপর unique — id নিজেই সারা প্ল্যাটফর্মে একক, তাই অন্য প্রতিষ্ঠানের সাথে সংঘাত সম্ভব নয়।
5. **`docs/AGENT-PLAN-R1.md`-এ `qb_student_unlocks`-এর পুরনো UNIQUE** (ST.2/D165 এটিকে সাধারণ index করেছে) — schema-parity guard একটি অমিল দেখায়।
6. **সিদ্ধান্ত-সারির ফাঁক:** `LOCKED-DECISIONS.md`-এ D140, D152, D156 নেই (D78 সংরক্ষিত, সেটি ঠিক আছে)। D140 ও D156-এর শুধু খসড়া (`owner/decision-D140-exam-pattern.md`, `owner/decision-D156-paper-question-edits.md`) আছে; D152 guard-এ একটি টাস্কের ট্রেইলার হিসেবে আছে।

## প্রস্তাবিত সারি
| D188 | Spec-verification repair (SVR.1) | Owner approved (2026-11-02). The agent may, in one task SVR.1 with `Change-Request: D188`: (1) remove from `docs/database/schema.sql` the three `FOREIGN KEY (qb_exam_batch_id)` lines wrongly added by ST.2 to `qb_chapter_class_level`, `qb_question_class_level` and `qb_curriculum_version_class_level` (the migrations never had them; no migration changes); (2) teach the SQLite translation in `infra/spec-verify/` to drop MySQL `FULLTEXT INDEX ... WITH PARSER ngram` (inline and `ALTER TABLE ... ADD FULLTEXT INDEX`) without changing any check's meaning; (3) add the deployed R2.1-D187 tables to the migration inventory in `docs/database/migrations.md` and the operational grouping in `docs/DATABASE.md`; (4) record in the D12 check that a UNIQUE on a column that references another row's global id (`exam_mark_submissions.exam_subject_id`, `ai_reviews.ai_message_id`, `learner_profiles.user_id`) is allowed - no schema change; (5) bring the `qb_student_unlocks` copy in the R1 plan source in line with `schema.sql` (index, not UNIQUE, D165) and regenerate `docs/AGENT-PLAN-R1.md` with its own generator. Missing decision rows D140, D152, D156 are NOT filled by the agent: the owner states separately whether each was approved. No test, golden number or check is weakened; `verify.py . --deep` must end with 0 FAIL except the decision-gap check until the owner settles (6). |

## মালিকের জন্য প্রশ্ন (কারণ ৬)
D140, D152, D156 — প্রতিটির জন্য বলুন: (ক) অনুমোদিত ছিল → সারি যোগ করুন (আমি খসড়া থেকে সারি তৈরি করে দিতে পারি), নাকি (খ) অনুমোদিত হয়নি → D80-এর D78-এর মতো "সংরক্ষিত, অনুমোদিত নয়" হিসেবে লেখা হোক।
