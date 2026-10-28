# খসড়া সিদ্ধান্ত D184: QBO.1 গৃহীত হওয়ার আগেই QBO.2 শুরু, দুটি একসাথে গ্রহণ (D182 (3)-এর সংকীর্ণ সংশোধন)

> এজেন্টের খসড়া — কোনো কোড বা guard বদলানো হয়নি। অনুমোদন করলে `owner\approve-D184.ps1` চালাবেন (দুটি commit: সিদ্ধান্তের সারি ও guard-এ QBO.2-এর নির্ভরতা; push করে না)।

## ১. কেন (2026-10-29)
QBO.1-এর কাজ শেষ ও সবুজ, কিন্তু পুরো backend suite-এ একটি পরীক্ষা ব্যর্থ: `QbPaperTest::test_final_papers_create_immutable_revision_when_red_block_fields_change`। এটি D180 (QBO.2)-এর পরীক্ষা, QBO.1-এর WIP commit 422c29e-এ আগেভাগে যোগ হয়েছিল। D182 (3) ও guard অনুযায়ী QBO.2 শুরু হয় শুধু QBO.1 গৃহীত হলে, আর QBO.1 গৃহীত হয় শুধু পুরো suite সবুজ হলে — তাই দুটোই আটকে। মালিকের সিদ্ধান্ত (2026-10-29): বিকল্প (ক) — এখনই QBO.2 শুরু, দুটি সবুজ হলে একসাথে গ্রহণ।

## ২. সিদ্ধান্তের সারি
| D184 | QBO.2 may start before QBO.1 is accepted; both are accepted together (narrowly amends D182 (3)) | Owner approved (2026-10-29). (1) QBO.2 (D180) may be implemented now, depending on QBS.1 instead of QBO.1; QBO.3 (D181) still waits for QBO.1. (2) QBO.1 is checked off only when the full suites are green, which includes the D180 revision test added in 422c29e; QBO.1 and QBO.2 are then recorded as accepted in the same run, each with its own evidence line. (3) No test is deleted, skipped or moved; D180's scope, table and rules are unchanged. QBO.2 commits carry `Change-Request: D180`. |
