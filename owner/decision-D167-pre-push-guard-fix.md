# খসড়া সিদ্ধান্ত D167: pre-push guard-এর ancestor-পরীক্ষা ঠিক করা

> এজেন্টের খসড়া; শুধু `infra/guard/pre_push_guard.py`-এর একটি ত্রুটি আর তার self-test। অনুমোদন করলে `owner\approve-D167.ps1` চালাবেন।
> এজেন্ট এটি চালাবে না, `infra/**` নিজে বদলাবে না, আর `--no-verify` দিয়ে push করবে না। D167 commit হয়ে guard স্বাভাবিক push পাস না করা পর্যন্ত এজেন্টের push বন্ধ।

## ১. ত্রুটি
- `pre_push_guard.py` লাইন ৫২: `if git('merge-base', '--is-ancestor', remote_oid, local_oid) != '': continue`
- `git merge-base --is-ancestor` কিছু ছাপে না, উত্তর দেয় শুধু **exit code** দিয়ে: `0` = remote-এর commit local-এর পূর্বপুরুষ (স্বাভাবিক fast-forward), `1` = নয়।
- ফলে: (ক) **স্বাভাবিক push সবসময় আটকে যায়** — output খালি, তাই শর্ত মেলে না, আর "remote branch has commits missing" বলে ব্যর্থ হয়; (খ) remote-এ সত্যিই বাড়তি commit থাকলে `git()` exit 1-এ RuntimeError দেয়, পরিষ্কার বার্তা নয়।
- বর্তমান self-test (D155 probe) শুধু remote == local অবস্থা দেখে, তাই ত্রুটি ধরা পড়েনি।

## ২. সংশোধন (শুধু এটুকু)
- `merge-base --is-ancestor`-এর exit code পরীক্ষা: `0` → পাস; `1` → আগের মতো "remote branch … has commits missing … fetch and resolve before pushing"; অন্য যেকোনো code → প্রকৃত Git error, exit code আর Git-এর stderr সহ ব্যর্থ।
- dirty worktree, untracked, staged ও branch-এর stash-এর আগের নিয়ম (D155) অপরিবর্তিত; stash কখনো মোছা/apply হয় না।
- `infra/guard/test_guard.py`-এর D155 probe-এ তিনটি নতুন অবস্থা: fast-forward push পাস; diverged remote ব্যর্থ ("has commits missing"); অজানা remote object → Git error বার্তা।
- পূর্ণ পরিবর্তন একটি patch-এ: `owner/d167/pre-push-guard-fix.patch` (দুটি ফাইল; স্ক্রিপ্ট `git apply --check` করে তবেই লাগায়)।

## ৩. যাচাই (এজেন্ট, অস্থায়ী worktree-তে; আসল `infra/**` অপরিবর্তিত)
- নতুন test + **পুরনো** guard: `WRONG D155 …` (ত্রুটি ধরা পড়ে)।
- নতুন test + নতুন guard: `guard self-test: 74 of 74 scenarios behaved as expected`, exit 0।

## ৪. সিদ্ধান্তের সারি
| D167 | pre-push guard: ancestor check by exit code (fixes D155) | Owner approved (2026-10-26). `infra/guard/pre_push_guard.py` decides `git merge-base --is-ancestor` by its exit code only: 0 = the remote tip is an ancestor of the pushed commit (allowed), 1 = it is not (rejected with the existing "has commits missing" message), any other code = a real Git error shown with its exit code and stderr. D155's clean-worktree and branch-stash rules are unchanged and stashes are never mutated. `infra/guard/test_guard.py` adds fast-forward, diverged and Git-error cases. No other guard change; agents still never push with `--no-verify`. |
