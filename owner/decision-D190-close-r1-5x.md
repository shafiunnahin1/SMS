# খসড়া সিদ্ধান্ত D190 — R1-এর 5.1 ও 5.2 "প্রতিস্থাপিত" হিসেবে বন্ধ

> এজেন্টের খসড়া (2026-11-02), মালিক "ঠিক আছে" বলেছেন। `owner/approve-D190.ps1` মালিক চালাবেন (এজেন্ট নয়): সারি যোগ + guard-এ টাস্ক R1-SUP। দুই commit; পুশ নয়।

## কেন
R1-এর 5.1 (সাইন-আপ ও অনবোর্ডিং) আর 5.2 (সাবস্ক্রিপশন ও বিলিং) D47 থেকে "BLOCKED"। এদের plan-ভিত্তিক নকশা বাতিল; যা দরকার ছিল তা অন্য সিদ্ধান্তে বানানো হয়ে গেছে:
- **5.1:** প্রকাশ্য সাইন-আপ, যোগাযোগ যাচাই ও Super Admin অনুমোদন (D90, `POST public/institutions`), প্রতিষ্ঠানের ধরন অনুযায়ী অনবোর্ডিং (বিদ্যমান), আর plan বাছাইয়ের বদলে সব মডিউলে ৩০ দিনের ট্রায়াল (D187, SUB.1)।
- **5.2:** মডিউল-ভিত্তিক দাম, ট্রায়াল/গ্রেস/read-only, বিল, prorate, কুপন, bKash, ইনভয়েস ও পাতা (D187, SUB.1–SUB.3); SMS-ক্রেডিট কেনা (D58, Step 5.3)। SSLCommerz-এর বদলে bKash (D187 (4)); কর 0 (OD-4)।
তাই এগুলো আর কখনো বানানো হবে না; খোলা `[ ]` দেখে পরের এজেন্ট বিভ্রান্ত হতে পারে।

## প্রস্তাবিত সারি
| D190 | R1 tasks 5.1 and 5.2 closed as superseded | Owner approved (2026-11-02). R1 tasks 5.1 (signup & onboarding) and 5.2 (subscription & billing) are closed without implementation: their plan-based design was withdrawn by D47 and what they were for is built under D90 (public signup, contact verification, Super Admin approval), D187 SUB.1-SUB.3 (module trial, prices, grace/read-only, billing, coupons, bKash, invoices, screens) and D58 (SMS credit purchase). They stay blocked for code; nobody builds them. In one task R1-SUP (`Change-Request: D190`) the agent may: replace the two `d47_blocked` notes in `docs/release/r1-scope.json` with a "superseded by D190" note naming those decisions, regenerate `docs/AGENT-PLAN-R1.md` / `r1-plan.json` with their generator, and add under the open 5.1 and 5.2 lines in `docs/PROGRESS.md` one indented line each saying "superseded by D190 - closed, not built" (the `[ ]` lines are neither removed nor checked). `verify.py . --deep` stays ALL CHECKS PASSED. |
