# খসড়া সিদ্ধান্ত D163: শিক্ষক ও শিক্ষার্থীদের AI চ্যাটবট — নিজস্ব সার্ভারে, বাইরের API ছাড়া

> এটি এজেন্টের লেখা খসড়া। মালিক অনুমোদন করলে `owner\approve-D163.ps1` চালাবেন। স্ক্রিপ্টটি শুধু সারিটি `docs/LOCKED-DECISIONS.md`-এ যোগ করে commit ও push করে।
> এটি পরিধি ও নিয়মের সিদ্ধান্ত। এতে কোড, টেবিল বা প্যাকেজের অনুমতি নেই। প্রতিটি ধাপের কাজ শুরুর আগে আলাদা পরিকল্পনা আর আলাদা D-সারি লাগবে।

## মালিকের নির্দেশ (2026-10-24)
- শিক্ষক ও শিক্ষার্থীদের জন্য AI সমাধান-চ্যাটবট হবে।
- লেখা, ভয়েস আর ছবি দিয়ে প্রশ্ন করা যাবে।
- নিজস্ব AI মডেল ডেটাবেস বিশ্লেষণ করে উত্তর দেবে, কোনো API ছাড়া।
- যত বেশি চ্যাট হবে, মডেল তত শিখবে।

## এখন কী আছে
- `docs/ROADMAP.md`-এ "AI সহকারী" R7-এ, অর্থাৎ পরের রিলিজে রাখা।
- `docs/modules/advanced-features.md` §1-এ AI সহকারীর পুরনো নকশা আছে। সেটি বাইরের API-নির্ভর (Claude/ChatGPT) আর শুধু অ্যাডমিন ও শিক্ষকের জন্য।
- প্রশ্নব্যাংকের উত্তর শিক্ষার্থীর কাছে যাওয়া আটকানোর নিয়ম কোডে টেস্ট দিয়ে বাঁধা আছে (`QuestionAnswerNeverLeaksTest`)।
- শিশুদের তথ্যের নিয়ম `docs/legal/privacy-and-consent.md`-এ আছে।

## প্রস্তাবিত সারি
| D163 | AI study assistant for teachers and students on self-hosted open-weight models, no outside AI API (also not for writers or moderators) (amends `docs/modules/advanced-features.md` §1 "Claude/ChatGPT Integration" and ROADMAP R7 "AI সহকারী"; scope and rules only) | Owner approved (2026-10-24). (1) Scope: an "AI assistant" module (own module key, one price as D47) where teachers and students ask in text, by voice or with an image, and get an answer grounded in the institution's own content (question bank, curriculum chapters, explanations, lesson material). (2) Models: open-weight models run on servers SMS controls - a Bangla-capable language model, a speech-to-text model for voice, and an image/OCR model for pictures and formulas; no request, chat, voice or image goes to an outside AI service. Answers are produced by retrieval over SMS's own data (RAG) with the source shown; the model never invents a source. (3) Exam integrity: the assistant never reveals answers or solutions of questions in a running or upcoming exam, a paper not yet published, or anything `QuestionAnswerNeverLeaksTest` protects; for students it explains and hints rather than handing over the answer to an assigned task, as the institution sets. (4) Privacy (privacy-and-consent.md): a student's chats, voice and images are kept only with the guardian's recorded consent, are tenant-isolated (D25), never shown to other institutions, and are deleted with the student (erasure) or after a set retention; voice and images are not kept after processing unless the user saves the chat. (5) Review and learning from use: no automatic training on raw chats. Every assistant answer goes to the review queue of the platform's question writers and moderators (the QB.2 writer/moderator roles): it is shown to the user at once marked "not yet reviewed", and the reviewer marks it approved, corrected or rewritten; a corrected or rewritten answer replaces the shown one and the user is told. Users may also rate answers. Only reviewed, de-identified question-answer pairs (no names, phones, roll or ID numbers) form the training set, weighted by review: an answer the reviewer wrote completely anew weighs most, a corrected one more than one approved as it was; a new model version is trained on a schedule, evaluated on a fixed test set (accuracy, Bangla quality, refusal of exam answers, no personal data) and switched on only if it is not worse; the previous version can be restored. (6) Phases, each needing its own owner-approved plan and D-row before code: P1 teacher text chat over the question bank and curriculum with sources; P2 students, with the exam-integrity and consent rules above; P3 voice and image input; P4 the rating, approval and scheduled training loop. (7) Infrastructure and packages (GPU server, model files, inference runtime, client libraries) are owner decisions with cost estimates in the P1 plan; nothing is installed before that (G7). (8) Until P1's decision is approved the module stays out of the current release (G1); ideas go to docs/IDEAS.md. |

## মালিকের পরের নির্দেশ (2026-10-24)
- বাইরের API (ChatGPT ইত্যাদি) লাগবে না, লেখক ও মডারেটরের কাজেও নয়।
- লেখক ও মডারেটরদের রিভিউ ব্যবস্থা থাকবে। চ্যাটবটের প্রতিটি উত্তর রিভিউ হবে।
- যে উত্তর রিভিউয়ার সম্পূর্ণ নতুন করে লিখেছেন, শেখানোর সময় সেটির গুরুত্ব সবচেয়ে বেশি হবে।
- উত্তর সাথে সাথে দেখাবে, "এখনো যাচাই হয়নি" চিহ্নসহ। রিভিউর পর উত্তর বদলালে প্রশ্নকারী জানতে পারবেন।

## মালিককে যা দেখতে হবে
১. **নিজস্ব মডেলের মানে:** শূন্য থেকে নতুন AI মডেল বানানো হবে না। খোলা-লাইসেন্সের তৈরি মডেল আমাদের নিজস্ব সার্ভারে চলবে। উত্তর আসবে আমাদের ডেটাবেস থেকে, সাথে উৎসের উল্লেখ থাকবে। কোনো তথ্য বাইরের AI সেবায় যাবে না।
২. **রিভিউ ও শেখার নিয়ম:**
   - চ্যাটবটের প্রতিটি উত্তর লেখক বা মডারেটরের রিভিউ-তালিকায় যাবে।
   - ব্যবহারকারী উত্তরটি সাথে সাথে পাবেন, তবে "এখনো যাচাই হয়নি" চিহ্নসহ। (মালিকের সিদ্ধান্ত, 2026-10-24: সাথে সাথে দেখাবে, রিভিউর অপেক্ষা নয়।)
   - রিভিউয়ার উত্তরটি অনুমোদন, সংশোধন বা নতুন করে লিখবেন। সংশোধিত বা নতুন উত্তর আগেরটির জায়গা নেবে, আর ব্যবহারকারী তা জানবেন।
   - শেখানোয় গুরুত্ব: নতুন করে লেখা উত্তর সবচেয়ে বেশি, তারপর সংশোধিত, তারপর যেমন ছিল তেমন অনুমোদিত।
   - কাঁচা চ্যাট থেকে মডেল শিখবে না। নতুন সংস্করণ চালু হবে কেবল পরীক্ষায় আগেরটির চেয়ে খারাপ না হলে।
৩. **পরীক্ষার সুরক্ষা ও সম্মতি:** চলমান বা আসন্ন পরীক্ষার উত্তর চ্যাটবট দেবে না। শিক্ষার্থীর চ্যাট, ভয়েস বা ছবি সংরক্ষণ হবে শুধু অভিভাবকের সম্মতি থাকলে।
৪. **ধাপ:** P1 শিক্ষকদের লেখা-চ্যাট → P2 শিক্ষার্থী → P3 ভয়েস ও ছবি → P4 শেখানোর চক্র। প্রতিটি ধাপের আগে আলাদা পরিকল্পনা ও অনুমোদন লাগবে।
৫. **খরচ:** GPU সার্ভারের মাসিক খরচ আর মডেল বাছাই P1-এর পরিকল্পনায় হিসাবসহ আপনার কাছে আসবে।
৬. ঠিক থাকলে চালান: `powershell -ExecutionPolicy Bypass -File owner\approve-D163.ps1`
