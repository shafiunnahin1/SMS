# Claude Code Prompt

Paste this into Claude Code when starting or resuming work in the local checkout:

```text
এই repository-তে আগের agent যেখানে থেমেছে, ঠিক সেখান থেকে একই নিয়মে কাজ চালাও। তোমার authoritative continuity source:
- AGENT-CONTINUITY.md — agent বদলালেও অপরিবর্তিত workflow
- AGENT-HANDOFF.md — সর্বশেষ resumable state, ছোট update, test evidence, blocker ও next action
- docs/AGENT-PLAN-R1.md + generated JSON — task order/dependencies/Done When
- docs/LOCKED-DECISIONS.md — owner decisions
- docs/PROGRESS.md — সম্পন্ন task ও evidence

শুরু করার আগে উপরোক্ত সবগুলো, AGENTS.md, এই CLAUDE.md এবং docs/ops/agent-guardrails.md পড়ো। AGENTS.md-এর precedence মেনে চলবে; prompt বা handoff কোনো locked decision/guardrail বদলায় না।

শুধু E:\Projects\School Management local checkout এবং branch claude/elegant-cori-gw2mw5 ব্যবহার করো। git status, git fetch, git log এবং origin-এর সঙ্গে তুলনা না করে edit কোরো না। একই সময়ে অন্য agent কাজ করলে অপেক্ষা করো। Local changes থাকলে সেগুলো কখনো overwrite/discard কোরো না; branch diverge করলে reset/rebase/force-push না করে owner-কে জানাও। text.txt untracked—owner রাখতে বলেছেন; একে edit/stage/delete/commit করা নিষেধ।

AGENT-HANDOFF.md-এর Current Handoff ও Next Safe Action থেকে শুরু করো। plan dependency-তে অনুমতি আছে এমন এক task-ই করো। task order, implementation history, plan, progress বা blocked log-এ বিরোধ পেলে নিজে সিদ্ধান্ত নিও না; exact evidence handoff-এ লিখে owner-এর সিদ্ধান্ত চাও।

Edit-এর আগে task, falsifiable hypothesis, smallest change, focused check সংক্ষেপে জানাও। Test-first/local conventions মানো. প্রতিটি meaningful substep শেষে AGENT-HANDOFF.md-এ date, change/inspection, files, exact command/result, unresolved risks, next action লিখে রাখো; Bengali progress update দাও। docs/PROGRESS.md task [x] কেবল generated plan-এর সব Done When/check সত্যি pass হলেই।

প্রতিটি coherent local update-এর পর focused check চালাও, নিজের task-এর docs/PROGRESS.md entry ও AGENT-HANDOFF.md update করো; task পুরোপুরি শেষ না হলে [ ]-ই থাকবে। তারপর python3 infra/guard/agent_guard.py --staged চালিয়ে এক task-এর scope-এ checkpoint commit করো (Task: <id> trailer-সহ; progress/handoff evidence একই commit-এ)। পরের local update-এর আগে remote fetch করে অগ্রসর হয়নি নিশ্চিত করে সঙ্গে সঙ্গে origin/claude/elegant-cori-gw2mw5-এ push করো। Broken বা test-না-করা intermediate state push নয়; একাধিক verified local update জমিয়ে পরে push নয়। Protected docs/rules/infra/.github পরিবর্তন করতে হলে approved Change-Request ছাড়া থামো। Force push, reset/rebase/history rewrite, destructive cleanup নয়।

প্রতিটি checkpoint commit-এর পর remote একই অবস্থায় আছে নিশ্চিত করে সঙ্গে সঙ্গে push করো, যদি GitHub authentication ইতিমধ্যে কাজ করে। কোনো secret চাইবে/দেখাবে না। প্রতিটি push-এর পর local HEAD ও remote SHA মেলাও এবং SHA, command/result, অসমাপ্ত কাজ ও next action handoff এবং owner update-এ স্পষ্ট করো। push সম্ভব না হলে local commit রেখে কারণ জানাও; কাজ হয়েছে বলে remote-এ গেছে এমন দাবি কোরো না।

এখন handoff পড়ে status যাচাই করো। কোনো code edit-এর আগে বর্তমান task plan ও সংশ্লিষ্ট implementation-এর কাছে গিয়ে একটি focused check বেছে নাও।
```
