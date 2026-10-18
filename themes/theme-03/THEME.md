# theme-03 — Tutor Lite

| | |
|---|---|
| **প্রিসেট key** | `tutor-lite` |
| **Layout** | `mobile-compact` — নিচে স্থির tab bar (৪টি প্রধান + "আরও"); কনটেন্ট `max-w-md` কেন্দ্রে (ডেস্কটপেও অ্যাপের মতো) |
| **কার জন্য** | `private_batch` (ডিফল্ট), `coaching` (বিকল্প) — `allowed_types` = `["private_batch","coaching"]` (school/college বাছতে পারে না) |
| **প্ল্যান** | বিনামূল্যে প্রিসেট |
| **চরিত্র** | মোবাইল-প্রথম, বড় টাচ-লক্ষ্য, এক-হাতে ব্যবহার — একজন শিক্ষক ফোনে ব্যাচ, হাজিরা, ফি চালান |
| **রঙ** | primary `#7C3AED` (বেগুনি) · secondary `#4C1D95` (গাঢ় বেগুনি) · accent `#F97316` (কমলা) |
| **UI Pack** | `mobile` — `modal=sheet · stat_card=compact · list=cards` (পর্যায় B); page view: `dashboard`, `students.list`, `students.quickAdd`, `attendance.take`, `fees.collect` (পর্যায় C)। শুধু `mobile-compact` layout-এর সাথে নির্বাচনযোগ্য |
| **Token (বেসলাইন থেকে আলাদা)** | `radius=xl`, `density=spacious`, `dashboard_variant=compact` |
| **স্থিতি** | Release 1-এ আবশ্যক (`private_batch` এর একমাত্র পূর্ণ-যোগ্য থিম) |

## কেন এই থিম
প্রাইভেট শিক্ষক ডেস্কটপ খুলে বসেন না; ক্লাসের মধ্যে ফোনে হাজিরা তোলেন, ক্লাস শেষে বকেয়ায় SMS পাঠান। তাই অ্যাপ-সদৃশ কাঠামো: বুড়ো আঙুলের নাগালে tab bar, একটি স্ক্রিনে "আজকের কাজ", বড় বাটন, কম মেনু। একই কারণে student/parent প্যানেল <১০২৪px-এ প্রতিষ্ঠানের layout যা-ই হোক এই কাঠামো পায় (`docs/THEMING.md`)।

## ব্যবহার করবে না
- বড় মেনু (৪০+ আইটেম) — "আরও" পাতা তখন লম্বা তালিকা; school/college-এর জন্য `theme-01` (এ কারণেই `allowed_types` সীমিত)।
- ডেটা-ঘন ডেস্কটপ কাজ (বড় টেবিলে ফি-রিপোর্ট) — এই থিমে টেবিল কার্ড-তালিকা হয়ে যায়; সবসময় ফোনে-কাজ করা কোচিং-মালিক হলে ঠিক, নইলে `theme-02`।

## ফাইল
`DESIGN.md` · `COMPONENTS.md` · `TOKENS.md` — বেসলাইন `themes/theme-01`; এখানে শুধু পার্থক্য।

## যাচাই (Done When)
- [ ] demo **private_batch** tenant ৩৬০×৬৪০ ও ৩৯০×৮৪৪ ভিউপোর্টে: tab bar নিচে, notch/home-indicator-এর নিচে ঢাকা পড়ে না (`env(safe-area-inset-bottom)`)
- [ ] সব টাচ-লক্ষ্য ≥ ৪৪×৪৪px; ইনপুট ফন্ট ≥ ১৬px (iOS জুম এড়াতে)
- [ ] তিন ধাপে হাজিরা: আজকের batch → সবাই উপস্থিত/অনুপস্থিত চিহ্ন → সংরক্ষণ (নতুন ব্যবহারকারী ৩ মিনিটে batch→ছাত্র→হাজিরা→ফি, `docs/BUILD-SEQUENCE.md` Step 6.2)
- [ ] `npm run lint:theme` ০ লঙ্ঘন
