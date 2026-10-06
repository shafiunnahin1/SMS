# SaaS Business Metrics & Tracking

## Key Performance Indicators (KPI)

### Revenue Metrics
```
MRR (Monthly Recurring Revenue):
  = Σ (active institutions × monthly plan price)
  Target: BDT 50,000 MRR (Year 1), BDT 200,000 (Year 2)

ARR (Annual Recurring Revenue):
  = MRR × 12
  Target: BDT 600,000 ARR (Year 1)

ARPU (Average Revenue Per User/Institution):
  = MRR ÷ Total Active Institutions
  Target: BDT 1,500+

MRR Growth Rate:
  = (Current MRR - Previous MRR) ÷ Previous MRR × 100
  Target: 15-20% monthly growth (early stage)
```

### Churn Metrics
```
Monthly Churn Rate:
  = Institutions Lost in Month ÷ Total Institutions at Start × 100
  Target: < 3% monthly churn

Annual Churn Rate:
  = 1 - (1 - Monthly Churn)^12
  Target: < 30% annual churn

Revenue Churn:
  = MRR Lost ÷ Beginning MRR × 100
  (Expansion from upgrades can offset this)
```

### Growth Metrics
```
Customer Acquisition Cost (CAC):
  = Total Sales & Marketing Cost ÷ New Customers
  Target: < BDT 5,000 per institution

Customer Lifetime Value (LTV):
  = ARPU ÷ Monthly Churn Rate
  Example: BDT 1,500 ÷ 0.03 = BDT 50,000

LTV:CAC Ratio:
  = LTV ÷ CAC
  Target: > 3:1 (BDT 50,000 ÷ BDT 5,000 = 10:1 target)

Net Revenue Retention (NRR):
  = (Beginning MRR + Expansion - Contraction - Churn) ÷ Beginning MRR
  Target: > 100% (expansion > churn)
```

## Super Admin Dashboard — Metrics Tracking
```php
// GET /super/dashboard → returns this data

return [
    // Revenue
    'mrr'                  => $this->calculateMRR(),
    'arr'                  => $this->calculateMRR() * 12,
    'mrr_growth'           => $this->mrrGrowthPercentage(),
    'revenue_by_plan'      => $this->revenueByPlan(),

    // Institutions
    'total_institutions'        => Institution::count(),
    'active_institutions'       => Institution::where('status','active')->count(),
    'trial_institutions'        => Institution::where('status','trial')->count(),
    'expired_institutions'      => Institution::where('status','expired')->count(),
    'new_this_month'       => Institution::whereMonth('created_at', now()->month)->count(),

    // Churn
    'churned_this_month'   => $this->churnedThisMonth(),
    'churn_rate'           => $this->monthlyChurnRate(),

    // Usage
    'total_students'       => Student::anyInstitution()->count(),
    'total_sms_sent'       => SmsLog::whereMonth('sent_at', now()->month)->count(),

    // Alerts
    'expiring_soon'        => Institution::whereBetween('subscription_expires_at', [now(), now()->addDays(7)])->count(),
    'payment_failed'       => Payment::where('status','failed')->whereMonth('created_at', now()->month)->count(),
];
```

## Competitor Analysis
```
প্রতিযোগী (বাংলাদেশে):
1. Education Management (generic) — Limited features, no SaaS model
2. EduAdmin Bangladesh — Desktop software, not cloud
3. Shiksha Pro — Basic features only

আমাদের সুবিধা:
✓ Multi-tenant SaaS (monthly subscription, no upfront cost)
✓ bKash/Nagad payment integration (local payment)
✓ বাংলা ভাষা সাপোর্ট
✓ Mobile app (parent engagement)
✓ Affordable pricing (BDT 999/month vs BDT 50,000+ one-time)
✓ SMS integration (SSL Wireless)
✓ Continuous updates included
```

## Pricing Strategy
```
Freemium/Trial Strategy:
  - ১৪ দিন বিনামূল্যে (Pro features)
  - Credit card/payment তথ্য নেওয়া হয় না
  - Trial শেষে downgrade alert

Pricing Psychology:
  - Basic: BDT 999 (anchor price)
  - Pro: BDT 1,999 (target, best value badge)
  - Enterprise: BDT 4,999 (premium)
  - বার্ষিক: ২ মাস ফ্রি (lock-in)

Discounts:
  - NGO/Government institution: ৩০% ছাড়
  - Rural institution (district outside Dhaka): ২০% ছাড়
  - Referral: ১ মাস ফ্রি (referrer ও referred উভয়ে)
```

---

## New Features Impact on Business (Revision 4)

### Revenue Impact
| Feature | Revenue Impact | Plan Upgrade Driver |
|---------|---------------|---------------------|
| Online Exam/Quiz | High | Pro → Enterprise conversion |
| WhatsApp Notifications | Medium | Pro plan value add |
| Multi-Branch Support | Very High | Enterprise-only, high ARPU |
| Zoom API Auto-Create | High | Enterprise-only lock-in |
| Fee Installment | Medium | Reduces churn (institutions keep more parents happy) |
| Certificate Generator | Low | Nice-to-have, reduces admin time |
| Alumni Module | Low | Long-term brand building |

### Feature Gating by Plan (Updated)
```
Basic (BDT 999):
  ✅ Student import (Excel)
  ✅ Fee QR code
  ✅ Behavior log
  ✅ Health records
  ✅ Visitor log
  ✅ Certificate generator
  ✅ Bulk ID card print
  ✅ Report card email
  ❌ Online Exam/Quiz
  ❌ WhatsApp notifications
  ❌ Fee installment
  ❌ 2FA
  ❌ Multi-branch

Pro (BDT 1,999):
  ✅ Everything in Basic
  ✅ Online Exam/Quiz (unlimited questions)
  ✅ WhatsApp notifications
  ✅ Fee installment system
  ✅ 2FA via OTP
  ✅ Bulk fee reminder (custom template)
  ✅ Parent meeting scheduler
  ✅ Alumni module
  ❌ Zoom API auto-create
  ❌ Multi-branch support

Enterprise (BDT 4,999):
  ✅ Everything in Pro
  ✅ Zoom API auto-create meeting
  ✅ Multi-branch support
  ✅ Per-institution API rate limit (300/min)
  ✅ Priority support (4hr SLA)
  ✅ Custom white label
```

### Churn Reduction Features
```
High impact on churn reduction:
1. Fee Installment → Parents pay → institution happy → renews
2. WhatsApp → better parent engagement → institution sees ROI
3. Online Exam → replaces paper exam overhead → saves time
4. Parent Meeting Scheduler → formal parent-teacher relationship
5. Report Card Email → automatic delivery → saves admin time

Metric to track:
  Feature adoption rate per institution
  Institutions using 5+ features: churn rate 1% vs 6% (using < 3 features)
```
