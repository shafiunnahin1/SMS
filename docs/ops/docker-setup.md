# Docker Setup (Development & Production)

## Development — docker-compose.yml
```yaml
version: '3.8'

services:
  # Laravel API
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    volumes:
      - ./api:/var/www/html
      - /var/www/html/vendor
    ports:
      - "8000:8000"
    environment:
      - DB_HOST=mysql
      - REDIS_HOST=redis
    depends_on:
      - mysql
      - redis
    command: php artisan serve --host=0.0.0.0 --port=8000

  # React Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000/api
    command: npm run dev -- --host

  # MySQL 8.0
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: edu_saas
      MYSQL_USER: saas_user
      MYSQL_PASSWORD: saaspassword
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./docker/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # MailHog (Dev email testing)
  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI → http://localhost:8025

  # phpMyAdmin (Dev DB management)
  phpmyadmin:
    image: phpmyadmin:latest
    ports:
      - "8080:80"
    environment:
      PMA_HOST: mysql
      PMA_USER: root
      PMA_PASSWORD: rootpassword

volumes:
  mysql_data:
  redis_data:
```

## api/Dockerfile.dev
```dockerfile
FROM php:8.2-fpm

RUN apt-get update && apt-get install -y \
    git curl zip unzip libpng-dev libzip-dev libxml2-dev \
    && docker-php-ext-install pdo_mysql zip gd xml bcmath pcntl

# Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .
RUN composer install

EXPOSE 8000
```

## frontend/Dockerfile.dev
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
```

## Production — docker-compose.prod.yml (Revision 7)
VPS-এ সরাসরি ইনস্টল (`docs/ops/deployment-plan.md`) এবং Docker — দুটোর **topology এক**: Caddy (public, TLS) → Nginx (ভেতরে, plain HTTP, SPA + FastCGI) → PHP-FPM। নিচের compose-এ Caddy `nginx:8080`-এ proxy করে; তাই (১) caddy service-এ `UPSTREAM=nginx:8080` (একই `Caddyfile` দুই topology-তে চলে; default `127.0.0.1:8080`), (২) `.env`-এ `INTERNAL_IPS=127.0.0.1,::1,172.16.0.0/12` এবং `nginx.conf`-এর `allow 172.16.0.0/12;` লাইন চালু। Nginx-এর কোনো public port নেই; certificate Caddy-র `caddy_data` volume-এ।
```yaml
services:
  caddy:
    image: caddy-cloudflare:latest        # built with: xcaddy build --with github.com/caddy-dns/cloudflare
    ports: ["80:80", "443:443"]
    environment: [CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}, UPSTREAM=nginx:8080]
    volumes: [./infra/Caddyfile:/etc/caddy/Caddyfile:ro, caddy_data:/data, caddy_config:/config]
    depends_on: [nginx]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    # NO published ports - only Caddy reaches it (listen 8080 inside the compose network)
    volumes:
      - ./infra/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./infra/laravel-fastcgi.conf:/etc/nginx/snippets/laravel-fastcgi.conf:ro   # set fastcgi_pass api:9000 in this file
      - frontend_build:/var/www/frontend/dist:ro
    depends_on: [api]
    restart: unless-stopped

  api:                                     # PHP-FPM on :9000, app at /var/www/api (the path nginx.conf passes as SCRIPT_FILENAME)
    build: { context: ./api, dockerfile: Dockerfile.prod }
    env_file: ./api/.env.production        # APP_KEY, DB_*, REDIS_*, ... - never baked into the image
    depends_on: [mysql, redis]
    restart: unless-stopped
    deploy: { replicas: 2 }

  queue-worker:
    build: { context: ./api, dockerfile: Dockerfile.prod }
    env_file: ./api/.env.production
    command: php artisan queue:work redis --queue=default,sms,notifications --tries=3 --max-time=3600
    depends_on: [mysql, redis]
    restart: unless-stopped
    deploy: { replicas: 2 }

  scheduler:
    build: { context: ./api, dockerfile: Dockerfile.prod }
    env_file: ./api/.env.production
    command: php artisan schedule:work
    depends_on: [mysql, redis]
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment: { MYSQL_ROOT_PASSWORD: "${DB_ROOT_PASSWORD}", MYSQL_DATABASE: "${DB_DATABASE}", MYSQL_USER: "${DB_USERNAME}", MYSQL_PASSWORD: "${DB_PASSWORD}" }
    volumes: [mysql_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    restart: unless-stopped

volumes: { mysql_data: {}, redis_data: {}, frontend_build: {}, caddy_data: {}, caddy_config: {} }
```
`frontend_build` volume-এ React build পৌঁছানো CI-র কাজ (`infra/github-actions-cicd.yml`: `npm run build` → volume-এ copy)। `queue-worker` ও `scheduler` একই image, শুধু command আলাদা।

## api/Dockerfile.prod
```dockerfile
FROM php:8.2-fpm
RUN apt-get update && apt-get install -y git zip unzip libpng-dev libzip-dev libxml2-dev \
    && docker-php-ext-install pdo_mysql zip gd xml bcmath pcntl opcache \
    && pecl install redis && docker-php-ext-enable redis
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/api
COPY . .
RUN composer install --no-dev --optimize-autoloader --no-interaction
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]
```
```bash
#!/bin/sh
# api/docker/entrypoint.sh - caches are built at START, not at image build: config:cache freezes env() values, and the build
# stage has no production environment (a build-time config:cache would bake in empty/default settings).
set -e
php artisan config:cache && php artisan route:cache && php artisan view:cache && php artisan event:cache
# Migrations are run by the deploy job (one place, one time) - never by every replica at start-up.
exec "$@"
```

## Quick Start Commands
```bash
# Development
docker-compose up -d
docker-compose exec api php artisan migrate:fresh --seed
docker-compose exec api php artisan key:generate

# Access:
# API:        http://localhost:8000
# Frontend:   http://localhost:5173
# phpMyAdmin: http://localhost:8080
# Mailhog:    http://localhost:8025

# Production
docker-compose -f docker-compose.prod.yml up -d

# Logs
docker-compose logs -f api
docker-compose logs -f queue-worker

# Shell access
docker-compose exec api bash
docker-compose exec mysql mysql -u root -p
```
