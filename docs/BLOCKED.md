# BLOCKED (agent-maintained)

When a stop condition of `docs/ops/agent-guardrails.md` (G12) applies, STOP the task and add ONE entry here. Never work around a block. The owner answers (usually by writing a decision), then work resumes.

| Date | Task | What blocked me (exact error / spec conflict / missing input) | What I tried (max 3 attempts) | What I need from the owner |
|---|---|---|---|---|
| 2026-10-06 | S (S5c) → affects 4.4 / 4.5 / 4.8 (every Bengali PDF) | The installed PDF engine (dompdf 3.1) cannot shape Bengali or Arabic (measured, DECISIONS 2026-10-06 S5c); the engine that passes (headless Chromium) needs a new dependency and a server with Chromium - both are outside what an agent may add (G7) and a hosting choice. | 1) dompdf with Noto Sans Bengali embedded: conjuncts and vowel signs broken. 2) Same HTML in headless Chromium (Playwright, outside the repo): correct. 3) mPDF not tried - it is also a new package. | Choose the renderer and write it as a decision (`D<n>`, Change-Request): (a) Chromium via a bridge package such as `spatie/browsershot` (Node + Chromium on the server) or `chrome-php/chrome`, or a Gotenberg container; or (b) allow trying mPDF first. Also confirm the hosting (VPS/container, not shared hosting). |
