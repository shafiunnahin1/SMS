#!/bin/sh
# api/docker/entrypoint.sh - caches are built at START, not at image build: config:cache freezes env() values, and the build
# stage has no production environment (a build-time config:cache would bake in empty/default settings).
set -e
php artisan config:cache && php artisan route:cache && php artisan view:cache && php artisan event:cache
# Migrations are run by the deploy job (one place, one time) - never by every replica at start-up.
exec "$@"
