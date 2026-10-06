# Deployment & DevOps Plan

## Server Recommendation
| Stage | Server | RAM | Cost | Suitable For |
|-------|--------|-----|-------|---------|
| Starter | DigitalOcean | 4GB | $24/mo | 10-50 institutions |
| Growth | DigitalOcean | 8GB | $48/mo | 50-150 institutions |
| Scale | AWS EC2 t3.medium | 8GB | ~$35/mo + RDS | 150+ institutions |

## Software Stack
Ubuntu 22.04, Caddy (edge TLS), Nginx (internal :8080), PHP 8.2 + FPM, MySQL 8.0, Redis, Supervisor, Node.js

## External Services
Cloudflare (DNS+CDN), AWS S3 (files), SSL Wireless (SMS), Firebase FCM (push), GitHub Actions (CI/CD), UptimeRobot (monitoring), Sentry (errors)

## Deploy Steps (First Time)
1. Server setup: Nginx, PHP, MySQL, Redis install
2. git clone → composer install → .env setup → migrate → key:generate
3. npm install → npm run build → /var/www/frontend/dist
4. Supervisor: queue worker + scheduler
5. Nginx (internal :8080) + Caddy (TLS edge) — `infra/nginx.conf`, `infra/Caddyfile`
6. Cloudflare DNS setup

## CI/CD (GitHub Actions)
```yaml
on: push: branches: [main]
# Steps:
# 1. Checkout code
# 2. Build React (npm ci && npm run build)
# 3. SSH to server: git pull → composer install --no-dev →
#    migrate --force → config:cache → route:cache →
#    supervisorctl restart → copy dist/
```

## Supervisor Config
```ini
[program:laravel-worker]
command=php artisan queue:work redis --sleep=3 --tries=3
autostart=true; autorestart=true; numprocs=2

[program:laravel-scheduler]
command=php artisan schedule:work
autostart=true; autorestart=true
```

## Backup Strategy
- Daily 2AM: mysqldump → gzip → AWS S3
- File sync: /storage/app → S3 daily
- Retention: 30 দিন

## Monitoring
- UptimeRobot: প্রতি ৫ মিনিটে check, SMS alert
- Sentry: Laravel + React error tracking
- DigitalOcean: CPU/RAM/Disk dashboard

## Scaling Plan
- ১-৫০ স্কুল: 1 Server
- ৫০-১৫০: 2 Server + Load Balancer
- ১৫০-৫০০: AWS RDS + ElastiCache + EC2
- ৫০০+: Auto Scaling + CloudFront CDN

## Performance Optimization
- php artisan config:cache && route:cache (deploy-এ)
- Redis: dashboard stats, institution config cache
- DB Index: institution_id, student_id সব FK-তে
- S3: সব ছবি ও PDF সরাসরি S3-এ
- Cloudflare CDN: React build assets

---

## First-Time Server Setup (Step-by-Step)
```bash
# After logging into Ubuntu 22.04:

# 1. System update
apt update && apt upgrade -y

# 2. Nginx
apt install nginx -y
systemctl enable nginx

# 3. PHP 8.2
add-apt-repository ppa:ondrej/php -y
apt install php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml \
    php8.2-curl php8.2-zip php8.2-redis php8.2-gd php8.2-intl -y

# 4. MySQL 8.0
apt install mysql-server -y
mysql_secure_installation
mysql -u root -e "CREATE DATABASE edu_saas; CREATE USER 'saas_user'@'localhost' IDENTIFIED BY 'StrongPass123!'; GRANT ALL ON edu_saas.* TO 'saas_user'@'localhost';"

# 5. Redis
apt install redis-server -y
systemctl enable redis-server

# 6. Composer
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer

# 7. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs -y

# 8. Supervisor
apt install supervisor -y

# 9. Caddy (TLS edge) — see "TLS / SSL (Revision 6 — Caddy Edge)" below
```

## Laravel Deploy
```bash
cd /var/www
git clone https://github.com/yourrepo/edu-saas-api.git api
cd api
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
# Fill in DB, SMS, payment credentials in .env
php artisan migrate --seed
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
chown -R www-data:www-data /var/www/api
chmod -R 775 /var/www/api/storage
```

## React Build & Deploy
```bash
cd /var/www
git clone https://github.com/yourrepo/edu-saas-frontend.git frontend
cd frontend
npm ci
cp .env.example .env
# Set VITE_API_URL=/api/v1   (same-origin; never an absolute URL)
npm run build
# dist/ folder will be generated
```

## Nginx Configuration (Revision 6)
Nginx এখন শুধু `127.0.0.1:8080`-এ plain HTTP শোনে — SPA serve করে ও `/api` Laravel-এ proxy করে। সম্পূর্ণ config: `infra/nginx.conf` (হুবহু কপি করুন)। Nginx-এ কোনো `listen 443` বা certificate থাকবে না।

## PHP-FPM Config (Laravel)
```ini
# /etc/php/8.2/fpm/pool.d/laravel.conf
[laravel]
user = www-data
group = www-data
listen = 127.0.0.1:9000
pm = dynamic
pm.max_children = 20
pm.start_servers = 5
pm.min_spare_servers = 2
pm.max_spare_servers = 8
```

## TLS / SSL (Revision 6 — Caddy Edge)
সব TLS Caddy সামলায়: `*.schoolapp.com`-এর জন্য wildcard certificate (Cloudflare DNS-01) এবং custom domain-এর জন্য on-demand certificate। Certbot ব্যবহার হবে না।

```bash
# Caddy with Cloudflare DNS plugin
apt install -y debian-keyring debian-archive-keyring golang
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
~/go/bin/xcaddy build --with github.com/caddy-dns/cloudflare --output /usr/bin/caddy
# Caddyfile: copy infra/Caddyfile to /etc/caddy/Caddyfile
# Token:     echo "CLOUDFLARE_API_TOKEN=xxxx" > /etc/caddy/caddy.env  (chmod 600)
systemctl enable --now caddy
```
সম্পূর্ণ ধাপ ও custom domain flow: `docs/modules/custom-domain.md`

## Monitoring Setup
```bash
# UptimeRobot: https://uptimerobot.com
# → New Monitor → HTTP → https://schoolapp.com/api/v1/health
# → Alert: SMS + Email

# Health endpoint: GET /api/v1/health -> HealthController (docs/templates/laravel-core-files.md). Unauthenticated, 503 when DB/Redis is down.

# Sentry
composer require sentry/sentry-laravel
php artisan sentry:publish --dsn=YOUR_DSN
```
