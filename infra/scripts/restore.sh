#!/usr/bin/env bash
# infra/scripts/restore.sh - Step 9.1 (D64): restore a backup made by backup.sh into a NEW database (docs/ops/restore-drill.md).
#   bash infra/scripts/restore.sh <sms-db-*.sql.gz> <target_database> [--files <sms-files-*.tar.gz> <target_dir>]
# Never over the live database: it refuses a target equal to LIVE_DATABASE (default edu_saas) or a database that already has tables.
# Connection: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD. Exit: 0 ok | 1 failed | 3 bad setup / refused.
set -euo pipefail
dump="${1:?usage: restore.sh <dump.sql.gz> <target_database> [--files <files.tar.gz> <dir>]}"; target="${2:?target database name}"
[ -f "$dump" ] || { echo "no such file: $dump"; exit 3; }
[ "$target" != "${LIVE_DATABASE:-edu_saas}" ] || { echo "refusing to restore over the live database '$target'"; exit 3; }
[[ "$target" =~ ^[A-Za-z0-9_]+$ ]] || { echo "bad database name"; exit 3; }
if [ -f "$dump.sha256" ]; then (cd "$(dirname "$dump")" && sha256sum -c --quiet "$(basename "$dump").sha256") || { echo "checksum mismatch"; exit 1; }; fi
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "${DB_HOST:-127.0.0.1}" "${DB_PORT:-3306}" "${DB_USERNAME:-root}" "${DB_PASSWORD:-}" > "$CNF"
m() { mysql --defaults-extra-file="$CNF" --default-character-set=utf8mb4 "$@"; }
existing="$(m -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$target'")"
[ "$existing" = "0" ] || { echo "database '$target' already has $existing tables - restore into an empty one"; exit 3; }
m -e "CREATE DATABASE IF NOT EXISTS \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
echo "== restore $dump -> $target"
gunzip -c "$dump" | m "$target"
n="$(m -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$target' AND TABLE_TYPE='BASE TABLE'")"
[ "$n" -gt 0 ] || { echo "the dump restored no tables - not a usable backup"; exit 1; }
echo "== tables: $n"
if [ "${3:-}" = "--files" ]; then
  tarball="${4:?files tarball}"; dir="${5:?target directory}"
  mkdir -p "$dir"; tar -C "$dir" -xzf "$tarball"; echo "== files restored into $dir"
fi
