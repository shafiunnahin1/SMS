# Environment Variables

## Laravel (.env)
```env
APP_NAME="Education Management SaaS"
APP_ENV=production
APP_KEY=base64:...
APP_URL=https://schoolapp.com
FRONTEND_URL=https://schoolapp.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=edu_saas
DB_USERNAME=saas_user
DB_PASSWORD=strong_password

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=noreply@schoolapp.com
MAIL_PASSWORD=app_password

# SMS Gateway
SSL_WIRELESS_TOKEN=your_api_token
SSL_WIRELESS_SID=your_sid

# bKash
BKASH_APP_KEY=...
BKASH_APP_SECRET=...
BKASH_USERNAME=...
BKASH_PASSWORD=...
BKASH_SANDBOX=false

# SSLCommerz
SSLCZ_STORE_ID=your_store_id
SSLCZ_STORE_PASSWD=your_store_password
SSLCZ_IS_SANDBOX=false

# Files (docs/architecture/file-storage.md, D40) - code only ever names two disks: 'private' and 'public'
FILES_DRIVER=local                 # local = development / one server | s3 = any S3-compatible store (the ONLY switch for multi-server)
S3_KEY=...
S3_SECRET=...
S3_REGION=ap-south-1
S3_ENDPOINT=                       # empty for AWS; set for MinIO / another provider
S3_PATH_STYLE=true
S3_PRIVATE_BUCKET=schoolapp-private   # NO public-read, ever
S3_PUBLIC_BUCKET=schoolapp-public     # behind a CDN
PUBLIC_FILES_URL=https://cdn.example.com
FILES_FALLBACK_DRIVER=             # only during files:migrate-disk

# Firebase FCM
FCM_SERVER_KEY=your_fcm_server_key

# Sentry
SENTRY_LARAVEL_DSN=https://...@sentry.io/xxx
```

## React (.env)
```env
VITE_API_URL=/api/v1
VITE_APP_NAME="Education Management"
VITE_BKASH_SCRIPT_URL=https://scripts.pay.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout.js
VITE_SENTRY_DSN=https://...@sentry.io/xxx
```

---

## Additional .env Variables (Revision 5)

```env
# WhatsApp (WATI.io)
WATI_ENDPOINT=https://live-server.wati.io
WATI_TOKEN=your_wati_api_token

# Zoom API (Server-to-Server OAuth)
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_ENABLED=false

# QR Code Library
QR_CODE_SIZE=200
QR_CODE_ERROR_CORRECTION=H

# WhatsApp Feature Flag
WHATSAPP_ENABLED=false

# 2FA Settings
OTP_EXPIRY_MINUTES=5
OTP_LENGTH=6

# Multi-Branch
MULTI_BRANCH_ENABLED=false

# Installment Settings
MAX_INSTALLMENTS=12
INSTALLMENT_LATE_FINE_PER_DAY=5

# Online Exam
EXAM_MAX_QUESTIONS=100
EXAM_AUTO_GRADE=true

# Certificate
CERTIFICATE_STORAGE_PATH=certificates
CERTIFICATE_LOGO_PATH=institution-logo.png

# Visitor Management
VISITOR_BADGE_PREFIX=VIS

# Alumni
ALUMNI_SELF_REGISTER=true

# Rate Limiting per Plan
RATE_LIMIT_BASIC=60
RATE_LIMIT_PRO=120
RATE_LIMIT_ENTERPRISE=300
```

---

## Additional .env Variables (Revision 6)

```env
# Tenancy & Domains (see docs/modules/custom-domain.md)
APP_BASE_DOMAIN=schoolapp.com                 # tenant subdomains: {slug}.schoolapp.com
CENTRAL_DOMAINS=schoolapp.com,www.schoolapp.com,admin.schoolapp.com
SUPER_ADMIN_DOMAIN=admin.schoolapp.com
DOMAIN_CNAME_TARGET=domains.schoolapp.com     # clients point their CNAME here
DOMAIN_A_TARGET=203.0.113.10                  # server public IPv4 (for root/apex domains)
DOMAIN_REQUIRE_APPROVAL=true                  # Super Admin must approve after DNS check
DOMAIN_MAX_PER_INSTITUTION=2
INTERNAL_IPS=127.0.0.1,::1                    # who may call /api/internal/* (docker compose: add 172.16.0.0/12)                  # e.g. portal.x.edu.bd + www.x.edu.bd

# Caddy (kept in /etc/caddy/caddy.env, not in Laravel .env)
# CLOUDFLARE_API_TOKEN=...

# Theme
DEFAULT_THEME_PRESET=classic-blue

# SMS credits
SMS_CREDIT_PRICE_BDT=0.35                     # default price per prepaid SMS credit
```

**React `.env` (Revision 6):** `VITE_API_URL=/api/v1` — সবসময় relative path। SPA ও API একই host-এ চলে, তাই প্রতিটি tenant domain নিজের origin-এ API call করে; absolute URL দিলে custom domain ভেঙে যাবে।

---

## Additional .env Variables (Revision 6.2)

```env
# Online fee payment — docs/modules/online-fee-payment.md
PLATFORM_COLLECT_ENABLED=false          # true = platform collects for institutions with no gateway of their own. Get legal advice FIRST (see the spec).
PLATFORM_COLLECT_FEE_PERCENT=0          # default service fee in platform mode; per-institution override in settings.platform_fee_percent
GATEWAY_FEE_BKASH=1.5                   # estimated gateway charge %, used only for settlement arithmetic
GATEWAY_FEE_SSLCOMMERZ=2.0
GATEWAY_FEE_NAGAD=1.0                   # (legacy key; fees now live in the registry - config/payments.php)
ENABLED_GATEWAYS=bkash,sslcommerz       # R6.4: gateways offered to parents. Add 'banglaqr' here only after BanglaQrGateway exists (banglaqr-readiness.md)
# Bangla QR (later, from the bank): GATEWAY_FEE_BANGLAQR=, BANGLAQR_SANDBOX=true, BANGLAQR_*  (names depend on the bank's credentials)

# SMS sender — docs/modules/notifications.md
SMS_DEFAULT_SENDER=your_platform_sid    # platform sender/masking ID used when an institution has no approved one (also services.ssl_wireless.sid)
SMS_SENDER_MAX_LEN=11

# Public website — docs/modules/public-website.md
PUBLIC_ADMISSION_RATE_PER_HOUR=5        # per IP per institution
PUBLIC_SHELL_PATH=/var/www/frontend/dist/index.html
```
Platform-mode merchant keys reuse `BKASH_*` and `SSLCZ_*` above. `APP_KEY` encrypts institutions' gateway credentials — never rotate it without `php artisan payments:reencrypt`.

---

## Additional .env Variables (Revision 7)
```env
# Token lifetimes in MINUTES (config/auth_policy.php) - conservative starting values, change after real use
TOKEN_ABS_SUPER_ADMIN=480    TOKEN_IDLE_SUPER_ADMIN=30
TOKEN_ABS_ADMIN=720          TOKEN_IDLE_ADMIN=60
TOKEN_ABS_ACCOUNTANT=720     TOKEN_IDLE_ACCOUNTANT=60
TOKEN_ABS_TEACHER=1440       TOKEN_IDLE_TEACHER=120
TOKEN_ABS_STUDENT=10080      TOKEN_IDLE_STUDENT=1440
TOKEN_ABS_PARENT=43200       TOKEN_IDLE_PARENT=10080
TOKEN_MAX_PER_USER=5
PASSWORD_CHECK_BREACHED=false          # true = Laravel uncompromised() (calls an external API)
# (R15) the old FILESYSTEM_PRIVATE_DISK / s3_private are gone: the disks are 'private' and 'public' - see FILES_DRIVER above
```
Retention windows (`docs/legal/privacy-and-consent.md` section 4) are code constants in the purge commands until a lawyer confirms them; do not expose them as per-institution settings yet.

## Release gate & signup (R16)
```
SIGNUP_MODE=invite                  # invite | open - open only after docs/RELEASE-1.md section 7 is all ticked
SIGNUP_INVITE_CODES=                # comma-separated codes for the closed beta
```
(The release itself is `config/release.php`, not an env variable: it describes which CODE shipped.)
