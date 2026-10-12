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

Commit-এর আগে python3 infra/guard/agent_guard.py --staged চালাও। One task per commit, Task: <id> trailer, required progress/handoff update একই commit-এ। Protected docs/rules/infra/.github পরিবর্তন করতে হলে approved Change-Request ছাড়া থামো। Force push, history rewrite, destructive cleanup নয়।

পরীক্ষা পাস, guard পাস, branch-এ অন্য কোনো push নেই—সব নিশ্চিত হলে commit-টি origin/claude/elegant-cori-gw2mw5-এ push করো, যদি GitHub authentication ইতিমধ্যে কাজ করে। কোনো secret চাইবে/দেখাবে না। push হলে SHA, command/result, অসমাপ্ত কাজ এবং পরের agent-এর একমাত্র next action handoff ও owner update-এ স্পষ্ট করো। push সম্ভব না হলে commit/local state রেখে কারণ জানাও; কাজ হয়েছে বলে remote-এ গেছে এমন দাবি কোরো না।

এখন handoff পড়ে status যাচাই করো। কোনো code edit-এর আগে বর্তমান task plan ও সংশ্লিষ্ট implementation-এর কাছে গিয়ে একটি focused check বেছে নাও।
```
