# Claude Code Prompt

Paste this into Claude Code when starting or resuming work in the local checkout:

```text
এই repository-তে আগের agent যেখানে থেমেছে, ঠিক সেখান থেকে একই নিয়মে কাজ চালাও। তোমার authoritative continuity source:
- AGENT-CONTINUITY.md — agent বদলালেও অপরিবর্তিত workflow
- AGENT-HANDOFF.md — সর্বশেষ resumable state, ছোট update, test evidence, blocker ও next action
- QUESTION-BANK-PARITY-PLAN.md — source qbank audit, integrated gap matrix, proposed remaining phases ও approval gates
- docs/AGENT-PLAN-R1.md + generated JSON — task order/dependencies/Done When
- docs/LOCKED-DECISIONS.md — owner decisions
- docs/PROGRESS.md — সম্পন্ন task ও evidence

শুরু করার আগে উপরোক্ত সবগুলো, AGENTS.md, এই CLAUDE.md এবং docs/ops/agent-guardrails.md পড়ো। AGENTS.md-এর precedence মেনে চলবে; prompt বা handoff কোনো locked decision/guardrail বদলায় না।

শুধু E:\Projects\School Management local checkout এবং branch claude/r216-omr-d127-এ edit করো। git status, git fetch, git log এবং origin-এর সঙ্গে তুলনা না করে edit কোরো না। একই সময়ে অন্য agent কাজ করলে অপেক্ষা করো। Local changes থাকলে সেগুলো কখনো overwrite/discard কোরো না; branch diverge করলে reset/rebase/force-push না করে owner-কে জানাও। text.txt untracked—owner রাখতে বলেছেন; একে edit/stage/delete/commit করা নিষেধ। প্রশ্নব্যাংকের legacy reference E:\Projects\exam-management কেবল read-only: Git revision যাচাই করো, কিন্তু `.env`/secret পড়বে না, database-এ connect করবে না, সেখানে edit/stage/commit/push বা write-capable command চালাবে না। Owner mapping: legacy QuestionSet = question paper; QuestionSetSubset = paper-এর set/variant; QuestionSetFolder = paper folder। আলাদা reusable-question-set module বানিও না।

AGENT-HANDOFF.md-এর Current Handoff ও Next Safe Action থেকে শুরু করো। plan dependency-তে অনুমতি আছে এমন এক task-ই করো। task order, implementation history, plan, progress বা blocked log-এ বিরোধ পেলে নিজে সিদ্ধান্ত নিও না; exact evidence handoff-এ লিখে owner-এর সিদ্ধান্ত চাও।

D65-D73-এ অনুমোদিত scope-এর বাইরের legacy parity feature শুরু কোরো না যতক্ষণ না QUESTION-BANK-PARITY-PLAN.md-এর owner approval gate মিটে এবং guarded spec/generated-plan update remote branch-এ থাকে। Source application wholesale copy নয়; verified domain behavior-ই target architecture-এ port হবে.

Edit-এর আগে task, falsifiable hypothesis, smallest change, focused check সংক্ষেপে জানাও। Test-first/local conventions মানো. প্রতিটি meaningful substep শেষে AGENT-HANDOFF.md-এ date, change/inspection, files, exact command/result, unresolved risks, next action লিখে রাখো; Bengali progress update দাও। docs/PROGRESS.md task [x] কেবল generated plan-এর সব Done When/check সত্যি pass হলেই।

প্রতিটি coherent local update-এর পর focused check চালাও, নিজের task-এর docs/PROGRESS.md entry update করো; task পুরোপুরি শেষ না হলে [ ]-ই থাকবে। তারপর python3 infra/guard/agent_guard.py --staged চালিয়ে exit code 0 হলে তবেই এক task-এর scope-এ commit করো (Task: <id> ও প্রয়োজনীয় Change-Request trailer-সহ; progress evidence একই commit-এ)। Push কেবল owner স্পষ্ট বললে ("পুশ করো"); তার আগে D155 যাচাই: git status --short --branch, git stash list, git fetch --prune, local শুধু remote-এর চেয়ে এগিয়ে কিনা, infra/guard/pre_push_guard.py (refs stdin-এ দিয়ে)। Protected docs/rules/infra/.github পরিবর্তন করতে হলে approved Change-Request ছাড়া থামো। Force push, --no-verify, reset/rebase/history rewrite, destructive cleanup নয়।

প্রতিটি push-এর পর local HEAD ও remote SHA মেলাও এবং SHA, command/result, অসমাপ্ত কাজ ও next action owner update-এ স্পষ্ট করো। push না হলে local commit রেখে কারণ জানাও; কাজ remote-এ গেছে এমন দাবি কোরো না। Owner-এর review (help article approval, approve-*.ps1) agent নিজে করবে না।

এখন handoff পড়ে status যাচাই করো। কোনো code edit-এর আগে বর্তমান task plan ও সংশ্লিষ্ট implementation-এর কাছে গিয়ে একটি focused check বেছে নাও।
```
