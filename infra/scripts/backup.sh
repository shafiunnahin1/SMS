#!/usr/bin/env bash
# infra/scripts/backup.sh - Step 9.1 (D64): nightly backup of the database AND the files (docs/ops/deployment-plan.md "Backup Strategy").
#   cron (server):  0 2 * * *  DB_DATABASE=edu_saas DB_USERNAME=... DB_PASSWORD=... bash /var/www/api/../infra/scripts/backup.sh
# Writes <dir>/sms-db-<stamp>.sql.gz, <dir>/sms-files-<stamp>.tar.gz and a .sha256 for each; keeps BACKUP_KEEP_DAYS days locally;
# with BACKUP_S3_URI (e.g. s3://bucket/sms) it also copies them there with the AWS CLI (Cloudflare R2 / Spaces: set AWS_ENDPOINT_URL).
# The dumps hold personal data: the directory is created 0700, the files 0600. Exit: 0 ok | 1 a step failed | 3 bad setup.
set -euo pipefail
umask 077
: "${DB_DATABASE:?DB_DATABASE is required}" "${DB_USERNAME:?DB_USERNAME is required}"
DB_HOST="${DB_HOST:-127.0.0.1}"; DB_PORT="${DB_PORT:-3306}"
DIR="${BACKUP_DIR:-/var/backups/sms}"; KEEP="${BACKUP_KEEP_DAYS:-14}"
STORAGE="${APP_STORAGE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/api/storage/app}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"; chmod 700 "$DIR"
# the password goes through a temporary option file, never the command line (visible in `ps`)
CNF="$(mktemp)"; trap 'rm -f "$CNF" "$DIR"/sms-*.part' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USERNAME" "${DB_PASSWORD:-}" > "$CNF"

db="$DIR/sms-db-$STAMP.sql.gz"
echo "== database $DB_DATABASE -> $db"
# written to a temporary name and renamed only when the dump finished - a failed dump never looks like a backup
mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --routines --triggers --no-tablespaces \
  --default-character-set=utf8mb4 "$DB_DATABASE" | gzip -9 > "$db.part" || { rm -f "$db.part"; echo "mysqldump failed"; exit 1; }
gunzip -c "$db.part" | tail -n 1 | grep -q '^-- Dump completed' || { rm -f "$db.part"; echo "the dump is incomplete"; exit 1; }
mv "$db.part" "$db"
sha256sum "$db" > "$db.sha256"

files="$DIR/sms-files-$STAMP.tar.gz"
if [ -d "$STORAGE" ]; then
  echo "== files $STORAGE -> $files"
  tar -C "$STORAGE" -czf "$files.part" private public 2>/dev/null || tar -C "$STORAGE" -czf "$files.part" .
  mv "$files.part" "$files"
  sha256sum "$files" > "$files.sha256"
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  command -v aws >/dev/null || { echo "BACKUP_S3_URI is set but the aws CLI is missing"; exit 3; }
  echo "== upload -> $BACKUP_S3_URI"
  for f in "$db" "$db.sha256" ${files:+"$files" "$files.sha256"}; do [ -f "$f" ] && aws s3 cp --only-show-errors "$f" "$BACKUP_S3_URI/"; done
fi

find "$DIR" -maxdepth 1 -name 'sms-*' -type f -mtime +"$KEEP" -delete
echo "== done: $(du -h "$db" | cut -f1) database${files:+, $(du -h "$files" 2>/dev/null | cut -f1) files}"
