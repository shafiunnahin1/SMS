# VS Code Agent Prompt

Paste this into the VS Code coding agent when starting or resuming work:

```text
এই School Management repository-তে কাজ করো। ধারাবাহিকতা বাধ্যতামূলক:

1. প্রথমে AGENT-CONTINUITY.md এবং AGENT-HANDOFF.md সম্পূর্ণ পড়ো। প্রশ্নব্যাংকের কাজ হলে QUESTION-BANK-PARITY-PLAN.md-ও পড়ো। তারপর AGENTS.md, docs/ops/agent-guardrails.md, docs/LOCKED-DECISIONS.md, docs/AGENT-PLAN-R1.md-এর বর্তমান task, docs/PROGRESS.md এবং প্রাসঙ্গিক docs/BLOCKED.md পড়ো। এই নথিগুলোর priority ও guardrails মানবে; কোনো নির্দেশের দ্বন্দ্ব হলে থামবে।
2. E:\Projects\School Management local checkout-এ কাজ করো, branch claude/elegant-cori-gw2mw5-এই থাকো। git status/fetch/log দিয়ে branch ও local changes যাচাই না করে edit কোরো না। একই সময়ে অন্য agent কাজ করলে শুরু কোরো না।
3. text.txt untracked এবং owner সেটি রাখতে বলেছেন: কখনো edit, stage, delete বা commit কোরো না। অন্য user changes-ও অক্ষত রাখো।
4. প্রশ্নব্যাংকের legacy reference E:\Projects\exam-management: কেবল read-only। প্রতিবার তার Git revision recheck করো; `.env`/secret পড়বে না, database-এ connect করবে না, source project-এ edit/stage/commit/push বা write-capable command চালাবে না। Mapping স্থির: legacy QuestionSet = question paper; QuestionSetSubset = ওই paper-এর set/variant; QuestionSetFolder = paper folder। আলাদা reusable-question-set module বানাবে না। Legacy code সরাসরি কপি নয়; verified behavior SMS architecture-এ port করবে।
5. AGENT-HANDOFF.md-এর Current Handoff ও Next Safe Action থেকে শুরু করো। শুধু plan-এ dependency মেটানো পরবর্তী একটি task করো। plan/history/status না মিললে অনুমান বা reorder কোরো না; evidence handoff-এ লিখে owner-কে জিজ্ঞেস করো। D65-D73-এর বাইরের parity feature শুরু করার আগে parity plan-এ বর্ণিত owner-approved decision/spec/plan update লাগবে।
6. edit-এর আগে task, falsifiable hypothesis, ক্ষুদ্রতম পরিবর্তন এবং disconfirm করতে পারে এমন test বলো। প্রতিটি অর্থপূর্ণ কাজ শেষে AGENT-HANDOFF.md-এ কী বদলেছে, ফাইল, চালানো command ও ফল, বাকি ঝুঁকি এবং next action লিখো। Progress update বাংলায় দাও।
7. task-এর সব Done When ও required checks সত্যিই green না হওয়া পর্যন্ত docs/PROGRESS.md-এ [x] দেবে না। ব্যর্থ/না-চালানো check সৎভাবে জানাও এবং guardrail অনুযায়ী blocked হলে থামো।
8. প্রতিটি coherent local update-এর পর focused test চালাও, নিজের task-এর docs/PROGRESS.md entry ও AGENT-HANDOFF.md আপডেট করো; task অসম্পূর্ণ থাকলে [ ] রাখবে, [x] নয়। তারপর python3 infra/guard/agent_guard.py --staged চালিয়ে শুধু ওই checkpoint commit করো (Task: <id> trailer-সহ, এক task-এর scope-এ)। পরের local update শুরুর আগেই remote fetch করে অগ্রসর হয়নি নিশ্চিত করো এবং সঙ্গে সঙ্গে কেবল origin/claude/elegant-cori-gw2mw5-এ push করো। ভাঙা/test-না-করা intermediate state push কোরো না; unrelated cleanup নয়। কোনো অবস্থায় force push/reset/rebase/history rewrite কোরো না।
9. প্রতিটি push-এর পরে HEAD ও origin branch সমান কি না যাচাই করো। push/authentication ব্যর্থ হলে credentials চাইবে না বা গোপন তথ্য দেখাবে না; থেমে স্পষ্টভাবে জানাবে। প্রতিটি checkpoint-এর commit SHA ও test ফল owner-কে জানাও।

এখন শুধু repository status ও handoff যাচাই করে পরবর্তী অনুমোদিত task এবং প্রথম focused check জানাও। কোনো edit করার আগে সেই task-এর plan ও nearby implementation পড়বে।
```
