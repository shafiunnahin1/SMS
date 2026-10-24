# VS Code কোডিং এজেন্টের জন্য প্রম্পট — OMR প্রিভিউ/প্রিন্টে "Devtools could not start"

> মালিক এই পুরো লেখাটা এজেন্টকে দেবেন। এজেন্ট মালিকের Windows PC-তে, `E:\Projects\School Management`-এ কাজ করবে।

---

তুমি School Management প্রজেক্টে (Laravel 11 API `api/`, React/Vite `frontend/`) কাজ করছ, Windows PC-তে। কাজ শুরুর আগে `AGENTS.md` আর `docs/ops/agent-guardrails.md` পড়ো এবং মেনে চলো।

## সমস্যা
প্রশ্নপত্রের OMR পাতায় (`/teacher/question-bank/papers/{id}/omr`, ফর্ম ট্যাব) প্রিভিউ আসে না। লাল বার্তা দেখায়: "সার্ভারে সমস্যা হয়েছে"। `api/storage/logs/laravel.log`-এ লেখা আসে:

```
local.ERROR: Devtools could not start ... RuntimeException ... vendor/chrome-php/chrome/src/Browser/BrowserProcess.php:470
```

- প্রিভিউ আসে `GET /api/v1/question-bank/papers/{id}/omr-form/pdf?preview=1` থেকে। প্রিন্টও একই route ব্যবহার করে। দুটোই `api/app/Services/PdfService.php`-এর মাধ্যমে headless Chrome দিয়ে PDF বানায় (chrome-php, `BrowserFactory(config('pdf.chrome_binary'))`)।
- ত্রুটির মানে: PHP থেকে Chrome চালু হয়নি, বা চালু হয়ে DevTools ঠিকানা দেয়নি।
- একই কোড Linux-এ (CI/agent container) ঠিকঠাক চলে। তাই সমস্যাটা এই PC-র পরিবেশে।

## জানা তথ্য
- আগে একবার এমন হয়েছিল। তখন কারণ ছিল সার্ভার `php artisan serve` দিয়ে চালানো, যা পরিবেশ-চলক (environment variable) মুছে দেয়। সমাধান ছিল `api\public` থেকে `php -S 127.0.0.1:8000` দিয়ে চালানো।
- `.env`-এ `PDF_CHROME_BINARY` আছে। আগে কাজ করা মান ছিল `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe`।
- সংশ্লিষ্ট কনফিগ: `api/config/pdf.php` (`chrome_binary`, `timeout_ms`, `no_sandbox`)।

## যা করবে (ক্রমানুসারে, প্রতিটির ফল লিখে রাখবে)
1. `git status` আর `git log --oneline -1` দেখো। branch `claude/r216-omr-d127` হওয়া উচিত, সর্বশেষ commit `1ceb9d1` বা তার পরের।
2. Chrome নিজে headless-এ চলে কি না দেখো:
   ```powershell
   & "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --dump-dom "data:text/html,ok"
   ```
   Chrome অন্য জায়গায় থাকলে (`C:\Program Files\Google\Chrome\Application\chrome.exe`) সেখান থেকে চালাও। আসল পথটা লিখে রাখো।
3. Laravel কোন পথ দেখছে তা বের করো:
   ```powershell
   cd api; php artisan tinker --execute="dump(config('pdf'))"
   ```
   ফলের `chrome_binary`-এর পথে আসলেই ফাইল আছে কি না দেখো (`Test-Path`)। `.env`-এর কোনো গোপন মান কোথাও কপি বা রিপোর্ট করবে না, শুধু `PDF_CHROME_BINARY`-এর পথ।
4. সার্ভার বন্ধ করে আবার চালাও: `php artisan optimize:clear`, তারপর `cd public; php -S 127.0.0.1:8000`। পাতা রিফ্রেশ করে দেখো প্রিভিউ আসে কি না।
5. তখনো না এলে PHP থেকে সরাসরি পরীক্ষা করো:
   ```powershell
   php artisan tinker --execute="echo strlen(app(App\Services\PdfService::class)->render('pdf.receipt-test-does-not-exist', []));"
   ```
   ভিউ না থাকলে অন্য error আসবে, তাতে সমস্যা নেই। বরং একটা ছোট পরীক্ষা চালাও: `HeadlessChromium\BrowserFactory` দিয়ে browser খোলো আর বন্ধ করো। `debugLogger` চালু রাখো (`'debugLogger' => 'php://stdout'`)। পুরো আউটপুট রেখে দাও।
6. সাধারণ কারণগুলো একে একে বাদ দাও:
   - ভুল বা পুরনো পথ (Chrome আপডেটে পথ বদলেছে);
   - পথে স্পেস আছে কিন্তু ঠিকমতো উদ্ধৃত হয়নি;
   - antivirus বা Windows Defender Chrome-এর চাইল্ড প্রসেস আটকাচ্ছে;
   - `%TEMP%` ফোল্ডারে লেখা যাচ্ছে না (chrome-php সেখানে user-data-dir বানায়);
   - একই সময়ে অনেক Chrome চালু হয়ে ঝুলে আছে (Task Manager-এ `chrome.exe --headless` প্রসেস থাকলে বন্ধ করো);
   - `timeout_ms` খুব কম।
7. কারণ পেলে **সবচেয়ে ছোট ঠিক** করো। সাধারণত সেটা শুধু `.env`-এর `PDF_CHROME_BINARY` ঠিক করা, বা সার্ভার ঠিকভাবে চালু করা। তারপর প্রিভিউ আর একটা OMR প্রিন্ট (তৈরি ও লক করার পর) চালিয়ে দেখো।

## নিয়ম (ভাঙবে না)
- `.env` কখনো commit করবে না। গোপন key বা password রিপোর্টে লিখবে না।
- `vendor/` বা `composer.lock`/`package-lock.json` বদলাবে না, নতুন package বসাবে না (G7)।
- `docs/**` (PROGRESS/DECISIONS/IDEAS/BLOCKED ছাড়া), `infra/**`, `AGENTS.md` বদলাবে না।
- test মুছবে বা skip করবে না।
- কোড বদলানো দরকার মনে হলে (যেমন `PdfService.php`) **আগে থামবে** এবং নিচের রিপোর্ট দেবে, নিজে বদলাবে না।
- force-push, `reset --hard` করবে না। কিছু commit করার দরকার হলে `python infra/guard/agent_guard.py --staged` চালাবে।

## সমাধান না হলে — এই রিপোর্ট দাও (মালিক এটা Claude-কে পাঠাবেন)
```
OMR Chrome রিপোর্ট
- git: <branch> / <commit>
- Windows সংস্করণ:
- PHP সংস্করণ (php -v প্রথম লাইন):
- Chrome-এর আসল পথ ও সংস্করণ (chrome.exe --version):
- ধাপ ২-এর ফল (headless dump-dom): <আউটপুট বা error>
- ধাপ ৩: config('pdf') (chrome_binary, timeout_ms, no_sandbox) এবং Test-Path ফল:
- সার্ভার কীভাবে চালানো হয়েছে (কমান্ড):
- ধাপ ৫-এর debugLogger আউটপুটের শেষ ৪০ লাইন:
- laravel.log-এর শেষ local.ERROR লাইন (প্রথম ৬০০ অক্ষর):
- headless chrome প্রসেস ঝুলে ছিল কি না:
- antivirus/Defender-এ কিছু আটকানো দেখা গেছে কি না:
- যা যা চেষ্টা করেছ ও ফল:
```
রিপোর্টের পর Claude যে সমাধান বলবে, শুধু সেটুকুই প্রয়োগ করবে। তারপর ধাপ ৪ ও ৭ আবার চালিয়ে ফল জানাবে।
