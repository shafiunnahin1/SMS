# Security & Penetration Test Checklist

## Authentication Security
```
□ Brute force protection (5 attempts → 30 min lockout)
□ Rate limiting on /auth/login (5 req/min per IP)
□ Token expiry enforced PER ROLE (absolute + idle; D26) — token 7 দিন নয়
□ Logout revokes ALL user tokens
□ Password: bcrypt; role-ভিত্তিক দৈর্ঘ্য-নীতি (super_admin 12 … student/parent 6), নাম/ফোন/ID-ধারণকারী ও সাধারণ-তালিকা অগ্রাহ্য
□ First-login password change enforced
□ Sanctum token stored in localStorage (not cookie — CSRF safe)
□ HTTPS only (HSTS header set)
□ 2FA available for admin accounts (optional)
```

## Authorization Security
```
□ Tenant isolation test: Institution A cannot access Institution B data
□ Role check on every endpoint (not just frontend hide)
□ Student can only see own data (result, attendance, fee)
□ Parent can only see their children's data
□ Teacher can only modify their own class data
□ Super Admin routes inaccessible to institution admin
□ Soft deleted records excluded from normal queries
```

## Input Validation & Injection
```
□ All inputs validated with FormRequest
□ SQL injection test: ' OR '1'='1 in search fields
□ XSS test: <script>alert('xss')</script> in name fields
□ File upload: ছবি ≤ 2 MB, নথি ≤ 5 MB; ছাত্রের ফাইল private disk + signed URL
□ File extension check (not just MIME type)
□ Filename sanitized (no path traversal: ../../../etc/passwd)
□ JSON input validated (malformed JSON rejected)
□ Integer overflow: very large numbers in amount fields
```

## API Security
```
□ CORS only allows specific origins
□ API versioning prevents breaking changes
□ Sensitive data (password, token) never in response
□ Pagination limit enforced (max 100 per page)
□ File download uses S3 signed URLs (expires in 15min)
□ Webhook signatures validated (bKash, SSLCommerz)
□ Error messages don't expose stack traces in production
□ APP_DEBUG=false in production
```

## Infrastructure Security
```
□ SSH: key-based only, password auth disabled
□ Firewall: only ports 80, 443, 22 open
□ MySQL: not accessible from internet (localhost only)
□ Redis: not accessible from internet (localhost only)
□ .env file not in git, not web accessible
□ Storage/logs directory not web accessible
□ Automated security updates enabled (unattended-upgrades)
□ Fail2ban installed (SSH brute force protection)
```

## OWASP Top 10 Check
```
A01 Broken Access Control    → Tenant isolation, role checks ✓
A02 Cryptographic Failures   → HTTPS, bcrypt, no MD5 ✓
A03 Injection                → Eloquent ORM, parameterized queries ✓
A04 Insecure Design          → Service layer, FormRequest ✓
A05 Security Misconfiguration→ .env, debug off, headers ✓
A06 Vulnerable Components    → composer update, npm audit ✓
A07 Auth Failures            → Rate limit, lockout, token ✓
A08 Software Integrity       → CI/CD signatures, composer.lock ✓
A09 Logging & Monitoring     → Sentry, UptimeRobot, audit log ✓
A10 Server-Side Request Forgery → No user-controlled URLs fetched ✓
```

## Regular Security Tasks
```bash
# Weekly
composer audit                    # PHP dependency vulnerabilities
npm audit                         # JS dependency vulnerabilities
php artisan package:discover      # Package updates check

# Monthly
caddy validate --config /etc/caddy/Caddyfile   # Caddy renews certificates automatically
mysql_secure_installation         # MySQL security check
fail2ban-client status            # Check blocked IPs

# After each deploy
php artisan config:cache          # Ensure fresh config
php artisan route:list            # Verify no unexpected routes
```
