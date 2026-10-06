# theme-02 — Modern Mint

| | |
|---|---|
| **প্রিসেট key** | `modern-mint` |
| **Layout** | `sidebar-mini` — ৭২px আইকন-রেল; hover/ক্লিকে flyout উপ-মেনু; বড় কনটেন্ট এলাকা |
| **কার জন্য** | `coaching` (ডিফল্ট); ডেটা-ঘন দৈনন্দিন কাজ করা যেকোনো ধরন (`allowed_types` = সব) |
| **প্ল্যান** | বিনামূল্যে প্রিসেট |
| **চরিত্র** | আধুনিক, দ্রুত, জায়গা-সাশ্রয়ী — রিসেপশনে বসে সারাদিন ভর্তি/ফি/হাজিরা তোলা মানুষের জন্য |
| **রঙ** | primary `#0F766E` (টিল) · secondary `#134E4A` (গাঢ় টিল) · accent `#F59E0B` (অ্যাম্বার) |
| **UI Pack** | `fresh` — `tabs=pill · stat_card=bubble` (component variant, পর্যায় B); page view: `dashboard`, `students.quickAdd`, `leads.board` (পর্যায় C — `docs/UI-PACKS.md` §১০) |
| **Token (বেসলাইন থেকে আলাদা)** | `radius=lg`, `card_style=shadow`, `font_family=anek-bangla` |
| **স্থিতি** | Release 1-এ আবশ্যক |

## কেন এই থিম
কোচিংয়ের মেনু ছোট (~২০ আইটেম, কম গ্রুপ) এবং কাজ পুনরাবৃত্ত ও দ্রুত: ভর্তি → ফি → হাজিরা → SMS। আইকন-রেল মেনুকে ৭২px-এ নামিয়ে টেবিল/ফর্মের জায়গা বাড়ায়; একই সাথে batch-সংখ্যা বেশি হলে বড় টেবিলে প্রস্থ লাগে। Anek Bangla বাংলা সংখ্যা ও যুক্তাক্ষর ভালো দেখায় এবং ফি/ব্যাচের অঙ্কে পড়তে সুবিধা।

## ব্যবহার করবে না
- মেনু দীর্ঘ (৪০+) হলে (school/college) — আইকন-রেলে চেনা কঠিন; `theme-01`।
- একক-হাতে মোবাইল-প্রথম কাজ — `theme-03`।
- যে ব্যবহারকারীরা আইকন-মানে-মনে-রাখতে পারেন না (প্রবীণ অভিভাবক): রেলে আইকনের নিচে লেবেল-টুলটিপ দেখায়, কিন্তু প্রধান শিক্ষক/অভিভাবক-প্যানেল সাধারণত `mobile-compact` পায় (`docs/THEMING.md`: student/parent <১০২৪px-এ bottom bar)।

## ফাইল
`DESIGN.md` · `COMPONENTS.md` · `TOKENS.md` — গঠন `theme-01`-এর মতোই; এখানে শুধু পার্থক্য লেখা, সম্পূর্ণ বেসলাইন `theme-01`।

## যাচাই (Done When)
- [ ] demo **coaching** tenant এই থিমে: icon-rail চলে, flyout কীবোর্ডে (Tab/Enter/Esc) খোলে-বন্ধ হয়
- [ ] `shadow` কার্ড ডার্ক মোডে দৃশ্যমান (সীমা নেই বলে ছায়া/surface-পার্থক্য যথেষ্ট কি — `DESIGN.md` §Dark)
- [ ] `npm run lint:theme` ০ লঙ্ঘন
