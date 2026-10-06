# Documentation Style Guide (Polish Standard)

এই গাইড পুরো প্ল্যানিং ডকুমেন্টের ভাষা, ফরম্যাট ও টার্মিনোলজি সামঞ্জস্যপূর্ণ রাখার জন্য।
যেকোনো ফাইল edit বা নতুন ফাইল লেখার আগে এই নিয়ম অনুসরণ করুন।

---

## ভাষা নিয়ম (Language Rule)

**প্রতিটি ফাইল একই প্যাটার্ন অনুসরণ করবে:**

| Content Type | ভাষা | উদাহরণ |
|---------------|------|--------|
| Headings (##, ###) | English | `## API Endpoints` |
| Table headers | English | `Method, Endpoint, Description` |
| Code, variable, function নাম | English (সবসময়) | `StudentService::create()` |
| Explanation paragraph | বাংলা | "প্রতিটি request-এ institution_id যাচাই হয়" |
| Bullet point description | বাংলা, কিন্তু টেকনিক্যাল টার্ম English | "Teacher **bulk upload** করতে পারবেন" |
| Table cell — টেকনিক্যাল value | English | `CRUD`, `bcrypt`, `Redis` |
| Table cell — ব্যাখ্যা/purpose | বাংলা | "ছাত্রের তথ্য সংরক্ষণ" |
| Comment (`// ...`, `<!-- -->`) | English | `// Auto-generate receipt number` |
| Error message / SMS template string | বাংলা (end-user facing) | `'ভুল email বা password'` |
| Code variable/column names | English only | `guardian_phone`, না `guardian_ফোন` |

**কখনো মিশ্রণ করবেন না একই terminology-র জন্য** — একবার "Student" লিখলে পুরো ডকুমেন্টে "Student" (not "ছাত্র/Student" alternating)। প্রথম উল্লেখে bilingual: `Student (ছাত্র)`, এরপর শুধু English।

---

## টার্মিনোলজি Glossary (Standardized)

এই শব্দগুলো সবসময় এই রূপে লিখুন — অনুবাদ variation এড়াতে:

| Standard Term | লিখবেন না এভাবে |
|---------------|----------------|
| Student | ছাত্র/স্টুডেন্ট/শিক্ষার্থী (মিশিয়ে) — সবসময় "Student" |
| Guardian / Parent | অভিভাবক (first mention-এ bilingual) |
| Fee Collection | ফি সংগ্রহ/কালেকশন (একটাই রাখুন: "Fee Collection") |
| Attendance | উপস্থিতি/অ্যাটেনডেন্স — কোড/heading-এ "Attendance" |
| Marksheet | মার্কশিট (bilingual once, then English) |
| Due / Dues | বকেয়া (consistent) |
| Subscription | সাবস্ক্রিপশন/Subscription — heading-এ always English |
| Dashboard | ড্যাশবোর্ড/Dashboard — heading-এ always English |
| Institution Admin | Institution Admin (না "স্কুল অ্যাডমিন" বা "প্রধান শিক্ষক") |
| Super Admin | Super Admin (consistent capitalization) |
| Receipt | রসিদ/Receipt — field name-এ always "Receipt" |

---

## Code Block নিয়ম

1. প্রতিটি PHP/JS code block-এর উপরে এক লাইন বাংলা ব্যাখ্যা (optional, শুধু জটিল হলে)
2. Code-এর ভেতরে কোনো বাংলা token/variable নাম নেই — শুধু string literal-এ (SMS text, error message) বাংলা থাকবে
3. SQL column নাম সবসময় `snake_case` English

```php
// ✅ সঠিক
$message = "দুঃখিত, বকেয়া ফি পরিশোধ করুন"; // string literal - বাংলা OK

// ❌ ভুল
$বকেয়া_পরিমাণ = 500; // variable নাম বাংলা - করবেন না
```

---

## Table ফরম্যাট (Standard)

প্রতিটি data table-এর column header **সবসময় English**, header-এর ভাষা পরিবর্তন করবেন না ফাইল অনুযায়ী:

```markdown
| Field | Type | Description |
|-------|------|-------------|
| name  | string | ছাত্রের পূর্ণ নাম |
```

না এভাবে মিশিয়ে:
```markdown
| ফিল্ড | টাইপ | Description |   ❌ ভুল — মিশ্রণ
```

---

## Section Heading Numbering

প্রতিটি module file-এর heading hierarchy:
```
# Module Title (English)
## Overview (ইংরেজি heading, বাংলা ১-২ লাইন ব্যাখ্যা)
## Database Schema
## API Endpoints
## Service Logic (PHP code)
## React Implementation
## Notes / Edge Cases
```

এই ক্রম সব ২০+ module file-এ অনুসরণ করা উচিত (consistency এর জন্য)।

---

## Currency ও Number ফরম্যাট

দুই context আলাদা — গুলিয়ে ফেলবেন না:

| Context | ব্যবহার করুন | উদাহরণ |
|---------|--------------|--------|
| ডকুমেন্টেশন প্রোজ, টেবিল, heading | `BDT` | "Basic Plan — BDT 999/month" |
| React JSX display, SMS template string, PDF output (end-user দেখবে) | `৳` | `` `৳${amount}` ``, `"পরিমাণ: ৳500"` |

অর্থাৎ: **ব্যাখ্যা করছেন যখন** → `BDT`। **কোড literal-এ actual app output লিখছেন যখন** → `৳` (কারণ বাংলাদেশি ব্যবহারকারী `৳` দেখতে অভ্যস্ত, `BDT` UI-তে অস্বাভাবিক দেখায়)।

- সংখ্যা ইংরেজি অঙ্কে (`1,999` — না `১,৯৯৯`), code ও prose উভয় জায়গায়
- তারিখ ফরম্যাট: `YYYY-MM-DD` (code/DB), `DD MMM YYYY` (UI display)

---

## Revision Marker

নতুন কিছু section একটি existing file-এ append করলে, section-এর উপরে marker দিন:
```markdown
---
## [Section Name] (Revision N)
```
যাতে future-এ বোঝা যায় কোন অংশ কবে যোগ হয়েছে।

---

## Checklist — নতুন কোনো ফাইল লেখা বা edit করার আগে

- [ ] Heading-এ English, বাংলা নয়
- [ ] Table header English
- [ ] Glossary term অনুযায়ী শব্দ ব্যবহার করা হয়েছে
- [ ] Code block-এ কোনো বাংলা variable/function নাম নেই
- [ ] Currency `BDT` ব্যবহার করা হয়েছে, `৳` নয়
- [ ] নতুন module হলে ৬টি standard section (Overview → Notes) অনুসরণ করা হয়েছে
