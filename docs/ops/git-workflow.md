# Git Branching Strategy & Code Review

## Branch Structure
```
main          ← Production (protected, deploy on push)
  └── staging ← Testing server (auto-deploy)
        └── develop ← Integration branch
              ├── feature/student-enrollment
              ├── feature/fee-collection
              ├── feature/result-publish
              ├── bugfix/attendance-date-issue
              └── hotfix/payment-callback-fix
```

## Branch Naming Rules
```bash
feature/[ticket-id]-short-description    # নতুন ফিচার
bugfix/[ticket-id]-short-description     # bug fix
hotfix/[issue]-short-description         # Production জরুরি fix
release/v1.2.0                           # Release branch
chore/update-dependencies                # Maintenance
```

## Commit Message Format (Conventional Commits)
```
type(scope): short description

feat(student): add bulk class promotion
fix(fee): correct receipt PDF generation
docs(api): update endpoint documentation
refactor(auth): simplify token refresh logic
test(result): add GPA calculation unit tests
chore(deps): update laravel to 11.x
hotfix(payment): fix bKash callback URL

Types: feat, fix, docs, refactor, test, chore, hotfix
Scope: student, teacher, fee, exam, attendance, auth, payment, notification
```

## PR (Pull Request) Workflow
```
1. feature branch তৈরি করুন:
   git checkout develop
   git pull origin develop
   git checkout -b feature/student-bulk-import

2. কাজ করুন, commit করুন

3. Push করুন:
   git push origin feature/student-bulk-import

4. GitHub-এ PR তৈরি করুন:
   → Base: develop
   → Title: feat(student): add bulk import via Excel
   → Description: কী করা হয়েছে, কেন, কীভাবে test করবেন

5. Code Review → Approve → Merge to develop

6. develop → staging (auto-deploy, testing)

7. staging → main (manual, production deploy)
```

## Code Review Checklist

### Laravel Backend
```
□ BelongsToInstitution Trait ব্যবহার হয়েছে?
□ FormRequest দিয়ে validation আছে?
□ Controller শুধু Request নেয় ও Resource return করে?
□ Business logic Service-এ আছে?
□ API Resource দিয়ে response format করা হয়েছে?
□ N+1 query নেই? (->with() ব্যবহার হয়েছে?)
□ Cache invalidation সঠিক?
□ SMS/Email Queue-এ দেওয়া হয়েছে?
□ Exception handling আছে?
□ Test লেখা হয়েছে?
□ Password/token response-এ expose হচ্ছে না?
□ institution_id সব write operation-এ check হচ্ছে?
```

### React Frontend
```
□ useQuery দিয়ে API call হচ্ছে?
□ useMutation-এ onSuccess-এ invalidateQueries আছে?
□ Loading state দেখানো হচ্ছে?
□ Error state handle হচ্ছে?
□ Can component দিয়ে role check হচ্ছে?
□ Form validation (zod schema) আছে?
□ Console.log production-এ নেই?
□ Hardcoded text নেই (i18n ব্যবহার হয়েছে)?
□ Mobile responsive?
□ Accessibility (aria-label, alt text)?
```

## Tag & Release
```bash
# Version tagging
git tag -a v1.0.0 -m "Initial MVP Release"
git push origin v1.0.0

# Semantic Versioning: MAJOR.MINOR.PATCH
# v1.0.0 → Major release
# v1.1.0 → New feature
# v1.1.1 → Bug fix
```
