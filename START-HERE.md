# 🚀 School Management System - Complete Development Roadmap

## কীভাবে শুরু করলে ভালো হবে? ও GitHub-এ সবকিছু Automate করা

---

## Part 1️⃣: আর্কিটেকচার ও শুরু করার পথ

### সবচেয়ে কার্যকর পদ্ধতি:

```
সপ্তাহ 1-2     → GitHub CI/CD Setup + Local Environment
পরে 3-4        → Phase 0 (Scaffold) - Infrastructure
সপ্তাহ 5-6     → Phase 1 (Database) - Schema & Migrations  
সপ্তাহ 7-8     → Phase 2 (Backend Foundation) - Tenancy, Auth
সপ্তাহ 9-10    → Phase 3 (Frontend Foundation) - UI Shell
সপ্তাহ 11-18   → Phase 4 (Core Modules) - MVP Features
সপ্তাহ 19-22   → Phase 5 (SaaS Layer) - Signup, Subscription
```

### এই approach কেন সেরা?

✅ **GitHub automate করে** - প্রতিটি commit-এ automated testing  
✅ **Local + Remote দুটোতেই কাজ করে** - যেকোনো জায়গা থেকে  
✅ **Spec মেনে চলে** - BUILD-SEQUENCE ও AGENTS.md-এর কঠোর নিয়ম  
✅ **Guard system** - যাতে ভুল direction-এ না যায়  
✅ **Incremental progress** - প্রতিটি step এর পর পূর্ণ কার্যকরী app

---

## Part 2️⃣: GitHub CI/CD Setup (Automate সবকিছু)

### কী চাওয়া:
```
1. প্রতিটি commit push-এ automated tests চলবে
2. Database schema validation হবে
3. Code quality checks
4. Theme & coding standards verify
5. Guard system violations ধরবে
```

### Step-by-step GitHub Setup:

### **Step 1: GitHub Actions Workflows তৈরি**

```bash
cd /home/user/SMS
mkdir -p .github/workflows
cp LMS/infra/github-actions-guard.yml .github/workflows/guard.yml
cp LMS/infra/github-actions-cicd.yml .github/workflows/ci.yml
```

### **Step 2: Branch Protection Rules Setup**

ব্রাউজারে যান: `https://github.com/shafiunnahin1/SMS/settings/branches`

- **Branch:** `develop` (নতুন branch তৈরি করুন)
- **Require pull request reviews:** 1 জন
- **Require status checks:** 
  - `Guard` ✅
  - `Tests` ✅
  - `Lint` ✅
- **Require branches to be up to date before merging:** ✅
- **Dismiss stale pull request approvals:** ✅
- **Require code owners review:** ✅

### **Step 3: CODEOWNERS Setup**

```bash
cp LMS/infra/CODEOWNERS.template .github/CODEOWNERS
```

`.github/CODEOWNERS` এ এডিট করুন:
```
# Protected specs and rules
docs/** @shafiunnahin1
AGENTS.md @shafiunnahin1
LMS/.cursor/** @shafiunnahin1
infra/** @shafiunnahin1
.github/** @shafiunnahin1

# Everything else needs review
* @shafiunnahin1
```

### **Step 4: Local Pre-commit Hook**

```bash
bash LMS/infra/guard/install-hooks.sh
```

এটি প্রতিটি commit-এর আগে স্বয়ংক্রিয়ভাবে guard চালায়।

---

## Part 3️⃣: Local Development Environment

### সিস্টেম প্রয়োজনীয়তা:

```bash
# macOS/Linux
PHP 8.2+, Composer
Node 20+, npm
MySQL 8.0+ (or SQLite for dev)
Redis 7+ (optional, for queue)

# Windows - WSL2 ব্যবহার করুন
```

### প্রথম সেটআপ:

```bash
cd /home/user/SMS

# 1. Laravel Backend Setup
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan install:api

# 2. React Frontend Setup
cd ../frontend
npm install
npm run dev  # Port 5173-এ চলবে

# 3. Database Setup
cd ../api
php artisan migrate:fresh --seed
php artisan serve  # Port 8000-এ চলবে

# 4. Check both are running
# Backend: http://127.0.0.1:8000/api/v1/health
# Frontend: http://demo.lvh.me:5173
```

### Local Domain Setup (`*.lvh.me`):

lvh.me যেকোনো subdomain-কে localhost দিকে নির্দেশ করে:

```
http://demo.lvh.me:5173              → Frontend (dev)
http://admin.lvh.me:8000/api         → Admin API
http://school.lvh.me:5173            → Demo School Tenant
http://coaching.lvh.me:5173          → Demo Coaching Tenant
http://batch.lvh.me:5173             → Demo Batch Tenant
```

### Demo Login Credentials (seeder থেকে):

```
Super Admin:
  Email: admin@schoolapp.com
  Password: Admin@1234

School Admin:
  Email: principal@dhanmondischool.edu.bd
  Password: School@1234

Coaching Owner:
  Phone: 01811111111
  Password: Coaching@1234

Tutor:
  Phone: 01911111111
  Password: Tutor@1234
```

---

## Part 4️⃣: Phase-wise Development Process

### প্রতিটি Phase-এ করার কাজ:

```
┌─────────────────────────────────────────────────────┐
│ PHASE N শুরু করার আগে                              │
├─────────────────────────────────────────────────────┤
│ 1. BUILD-SEQUENCE.md-এ PHASE N পড়ুন              │
│ 2. Relevant spec files খুলুন (Step → Spec Ref)    │
│ 3. PROGRESS.md দেখুন - গত কোথায় থামেছে           │
│ 4. নতুন branch তৈরি: git checkout -b r1/phaseN   │
└─────────────────────────────────────────────────────┘

PHASE চলছে:
  ↓
  প্রতিটি Step-এ:
    - কোড লিখুন
    - Test লিখুন (TDD)
    - Spec থেকে সরে গেছেন কি? Check করুন
    - npm run lint:theme (Frontend)
    - php artisan test (Backend)
    - python3 infra/guard/agent_guard.py --staged
    ↓
  সবকিছু সবুজ?
    ✅ Commit করুন: "feat(phase-3): students module"
    ✅ PROGRESS.md update করুন
    ✅ git push origin r1/phaseN
    ↓
  Pull Request তৈরি করুন:
    - Base: develop
    - Title: "Phase 3 Step 5: Student Management"
    - Description: শেষ-শর্ত + কমান্ড ফলাফল
    ↓
  Review + Merge (CI সবুজ হলে)
    ↓
  পরের Step শুরু করুন
```

---

## Part 5️⃣: GitHub-এ সম্পূর্ণ Testing (Without Local Install)

### CloudShell / Codespaces -এ করা যায়:

GitHub-এ **Codespaces** ফিচার ব্যবহার করুন:

```
repo → Code → Codespaces → Create codespace on develop
```

এটি একটি full cloud Linux environment খুলে দেবে।

```bash
# এক্ষেত্রে এটি চালান:
cd api && composer install
php artisan migrate:fresh --seed
php artisan test

cd ../frontend
npm install
npm run test
npm run lint:theme
```

---

## Part 6️⃣: Automated Workflows (GitHub Actions)

### সেটআপের পর, প্রতিটি commit-এ:

```
PUSH → CI Pipeline চালু
  ↓
  ├─ Guard (স্পেক compliance) ✅/❌
  ├─ PHP Tests (Backend) ✅/❌
  ├─ Node Tests (Frontend) ✅/❌
  ├─ Lint Theme Rules ✅/❌
  ├─ Database Schema Check ✅/❌
  └─ Code Quality Report 📊
  ↓
  সব সবুজ → PR merge করা যায়
  কোনো লাল → ঠিক করতে হবে
```

### GitHub Actions কী যাচাই করে?

```yaml
# 1. Guard System (agent_guard.py)
   - Scope violations (আগাম features)
   - Migration immutability
   - Protected file edits
   - Test integrity
   - Dependencies change

# 2. Laravel Tests
   - Unit Tests
   - Feature Tests
   - Database Tests
   - Tenancy isolation tests

# 3. React/Frontend
   - Component tests
   - Theme rule compliance
   - No hardcoded colors
   - No hardcoded terms
   - RTL checks (Arabic)

# 4. Database
   - schema.sql vs migrations parity
   - No SQL syntax errors
   - Foreign key integrity

# 5. Code Quality
   - PHP Lint
   - JS Lint
   - No console.log
   - No dd() calls
```

---

## Part 7️⃣: সম্পূর্ণ Workflow Example

### উদাহরণ: "Phase 4 Step 2: Add Student Model"

```bash
# 1. নতুন branch তৈরি
git checkout develop
git pull origin develop
git checkout -b r1/phase4-step2

# 2. কোড লিখুন (আপনার IDE-তে)
# app/Models/Student.php তৈরি করুন
# database/migrations/create_students_table.php তৈরি করুন

# 3. স্থানীয়ভাবে পরীক্ষা
php artisan migrate:fresh
php artisan test tests/Unit/Models/StudentTest.php

# 4. Guard চেক করুন
python3 infra/guard/agent_guard.py --staged

# 5. Commit করুন
git add -A
git commit -m "feat(r1-phase4): add student model and migration

- Student model with BelongsToInstitution
- Enrollment relationship
- Database migration
- Unit tests for model

Task: R1.4.2
Done-When: Tests pass, Guard OK"

# 6. Push করুন
git push origin r1/phase4-step2

# 7. GitHub-এ PR তৈরি করুন
# (GitHub automatically suggest করবে)

# PR Description এ লিখুন:
"""
## Summary
Student model implementation with enrollment relationship

## Task
R1.4.2 from AGENT-PLAN-R1.md

## Done When
- [x] php artisan migrate:fresh → OK
- [x] php artisan test → 12 passed
- [x] python3 infra/guard/agent_guard.py --staged → OK
- [x] PROGRESS.md updated

## Testing
Verified on all 4 demo tenants via tinker
"""

# 8. PR খোলার পর CI চলবে:
# CI Status: ✅ Guard passed
# CI Status: ✅ Tests passed
# CI Status: ✅ Lint OK

# 9. Code Review → Approve → Merge (develop-এ)

# 10. পরের Step শুরু করুন
git checkout develop
git pull origin develop
git checkout -b r1/phase4-step3
```

---

## Part 8️⃣: Monitoring Progress

### Real-time Dashboard তৈরি করতে পারেন:

```bash
# GitHub API দিয়ে check করুন
gh pr list --base develop --state open --json title,number,statusCheckRollup

# Local এ দেখুন
cat docs/PROGRESS.md

# সম্পূর্ণ spec verification
python3 infra/spec-verify/verify.py . --deep
```

---

## Part 9️⃣: Release 1 সম্পূর্ণ হওয়ার চেকলিস্ট

```
Release 1 (R1) Acceptance Criteria:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 0 (Scaffold)
  ✅ Laravel 11 + React/Vite setup
  ✅ CI/CD pipeline working
  ✅ Tenancy system ready

Phase 1 (Database)
  ✅ 143 tables created
  ✅ Seeders working (demo data)
  ✅ schema.sql matches migrations

Phase 2 (Backend Foundation)
  ✅ Tenancy routing
  ✅ Institution types
  ✅ Module gating
  ✅ Authentication

Phase 3 (Frontend Foundation)
  ✅ Theme system
  ✅ 4 Layouts working
  ✅ Navigation
  ✅ Login page

Phase 4 (MVP Modules)
  ✅ Students - Create, Read, Update, Delete
  ✅ Attendance - Mark attendance
  ✅ Fees - Create invoices, manage payments
  ✅ Exams - Create exams, enter marks
  ✅ SMS - Send SMS via provider
  ✅ Reports - Basic reports
  
  ✅ চার ধরনে সবকিছু কাজ করে:
     - School (1000+ students)
     - College (500+ students)
     - Coaching (100+ students)
     - Private Batch (20 students)

Phase 5 (SaaS Layer)
  ✅ Super Admin Panel
  ✅ Signup flow
  ✅ Subscription gating
  ✅ Online payment
  ✅ Custom domain support

Performance:
  ✅ k6 load test: 1000 concurrent users
  ✅ Response time: < 200ms (p95)
  ✅ Database: < 5 tables per query

Security:
  ✅ Tenant isolation tests
  ✅ CSRF protection
  ✅ SQL injection prevention
  ✅ XSS protection
  ✅ Rate limiting

Documentation:
  ✅ API fully documented
  ✅ Setup guide complete
  ✅ Testing guide written
  ✅ Deployment ready
```

---

## Part 🔟: Quick Start Commands

### সবচেয়ে গুরুত্বপূর্ণ কমান্ডগুলো:

```bash
# 🎯 সম্পূর্ণ Development Loop
git checkout develop && git pull
git checkout -b r1/task-name
# ... কোড লিখুন ...
php artisan test
npm run lint:theme
python3 infra/guard/agent_guard.py --staged
git commit -m "..." && git push origin r1/task-name

# 🔍 Spec Verification
python3 LMS/infra/spec-verify/verify.py LMS --deep

# 📊 Progress দেখুন
cat LMS/docs/PROGRESS.md

# 🧪 সবকিছু Test করুন
cd api && php artisan test
cd ../frontend && npm test
npm run lint:theme

# 🚀 Local-এ চালান
cd api && php artisan serve
cd ../frontend && npm run dev
# http://demo.lvh.me:5173

# 📝 নতুন Decision যোগ করুন
echo "D48 - পরিকল্পনা..." >> LMS/docs/DECISIONS.md

# ⚠️ কোথায় আটকেছি
cat LMS/docs/BLOCKED.md
```

---

## Part ⭐: GitHub Issues ও Discussions

### সাংগঠনিক:

```
Issues ব্যবহার:
  - Phase-এর জন্য Epic issue
  - প্রতিটি Step একটি sub-task
  - Blocked items
  - Decision discussion

Discussions ব্যবহার:
  - Architecture Q&A
  - Design decisions
  - Feature ideas
  - Performance optimization
```

---

## Summary: একটি সম্পূর্ণ Flow

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Repo + CI/CD + Local Dev = সম্পূর্ণ Automation  │
└─────────────────────────────────────────────────────────┘

1. Local Development
   ├─ কোড লিখুন (IDE-তে)
   └─ Test করুন (Local)

2. Git Workflow
   ├─ Branch তৈরি করুন
   ├─ Commit করুন (Guard check)
   └─ Push করুন

3. GitHub CI/CD
   ├─ Tests চলে (স্বয়ংক্রিয়)
   ├─ Guard validates (স্বয়ংক্রিয়)
   ├─ Code quality checks (স্বয়ংক্রিয়)
   └─ Status report (automatic)

4. PR & Review
   ├─ Code review (manual)
   ├─ Approval (manual)
   └─ Merge to develop (automatic)

5. Deployment Ready
   └─ Production-এ যাওয়ার আগে release-stage
```

---

## এখন শুরু করুন! 🚀

### পরবর্তী ধাপ:

```bash
# 1. GitHub Setup করুন (উপরের Part 2️⃣)
cd /home/user/SMS
mkdir -p .github/workflows
cp LMS/infra/github-actions-*.yml .github/workflows/

# 2. CODEOWNERS সেটআপ
cp LMS/infra/CODEOWNERS.template .github/CODEOWNERS

# 3. Local প্রস্তুত করুন
cd api
composer install
php artisan migrate:fresh --seed

# 4. Git setup
cd ..
bash LMS/infra/guard/install-hooks.sh

# 5. প্রথম commit
git add .github/
git commit -m "feat: Setup GitHub Actions and CI/CD pipeline"
git push origin claude/elegant-cori-gw2mw5

# 6. PR তৈরি করুন develop-এ
gh pr create --base develop --title "Setup: CI/CD Pipeline" \
  --body "Initial GitHub Actions setup for automated testing and spec compliance"
```

---

## দ্রুত সাহায্য:

```
❓ Phase 4 এ আছি, পরের কী?
  → BUILD-SEQUENCE.md → Phase 4 section দেখুন

❓ Test fail হচ্ছে
  → php artisan test --verbose → Error দেখুন

❓ Guard ব্যর্থ
  → python3 infra/guard/agent_guard.py --staged → কী ভুল

❓ Local database reset চাই
  → php artisan migrate:fresh --seed

❓ নতুন decision দরকার
  → LMS/docs/DECISIONS.md এ add করুন
```

---

**Happy Coding! 🎉**

এই setup দিয়ে আপনি শুধু LOCAL-তেই নয়, GitHub-এও সম্পূর্ণ প্রজেক্ট run করতে পারবেন!
