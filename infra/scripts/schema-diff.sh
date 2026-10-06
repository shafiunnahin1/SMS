#!/usr/bin/env bash
# infra/scripts/schema-diff.sh - compares the database built by the LARAVEL MIGRATIONS with the one built from docs/database/schema.sql (Spike step S1, "Done When").
#   bash infra/scripts/schema-diff.sh lms lms_smoke        # lms = after `php artisan migrate:fresh`; lms_smoke = after infra/scripts/mysql-smoke.sh
# Compares table names, column names, full column types (incl. unsigned / enum values / length), nullability, defaults, and every index (name-independent). Exit 0 = identical.
# NOT RUN in the specification environment (no MySQL there) - syntax-checked only. Laravel's own tables (migrations, jobs, failed_jobs, personal_access_tokens, notifications,
# password_reset_tokens, sessions, cache*) are ignored; they come from artisan, not from schema.sql (docs/database/migrations.md).
set -u
A="${1:?usage: schema-diff.sh <migrated_db> <schema_sql_db>}"; B="${2:?usage: schema-diff.sh <migrated_db> <schema_sql_db>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -n "${MYSQL_CMD_STR:-}" ]; then read -r -a MYSQL_CMD <<< "$MYSQL_CMD_STR"; else MYSQL_CMD=(docker compose -f "$ROOT/infra/docker-compose.dev.yml" exec -T mysql mysql -uroot -proot); fi
# Release 1 builds only 31 of the 143 tables: SCHEMA_DIFF_ONLY=docs/release/r1-tables.txt compares just those (otherwise every deferred table would show as "missing").
ONLY_SQL=""
if [ -n "${SCHEMA_DIFF_ONLY:-}" ]; then ONLY="$(sed "s/.*/'&'/" "$ROOT/$SCHEMA_DIFF_ONLY" | paste -sd, -)"; ONLY_SQL=" AND table_name IN ($ONLY)"; fi
IGNORE="'migrations','jobs','job_batches','failed_jobs','personal_access_tokens','notifications','password_reset_tokens','sessions','cache','cache_locks'"
cols() { "${MYSQL_CMD[@]}" -N -B -e "SELECT table_name, ordinal_position, column_name, column_type, is_nullable, IFNULL(column_default,'<NULL>') FROM information_schema.columns WHERE table_schema='$1' AND table_name NOT IN ($IGNORE)$ONLY_SQL ORDER BY table_name, ordinal_position" < /dev/null 2>/dev/null; }
idx()  { "${MYSQL_CMD[@]}" -N -B -e "SELECT table_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema='$1' AND table_name NOT IN ($IGNORE)$ONLY_SQL GROUP BY table_name, index_name, non_unique ORDER BY 1,2,3" < /dev/null 2>/dev/null; }
fk()   { "${MYSQL_CMD[@]}" -N -B -e "SELECT table_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema='$1' AND referenced_table_name IS NOT NULL AND table_name NOT IN ($IGNORE)$ONLY_SQL ORDER BY 1,2" < /dev/null 2>/dev/null; }
rc=0
for what in cols idx fk; do
  diff <($what "$A" | sort) <($what "$B" | sort) > "/tmp/schema-diff-$what.txt" && echo "same  $what" || { echo "DIFF  $what  (see /tmp/schema-diff-$what.txt; '<' = migrated '$A', '>' = schema.sql '$B')"; rc=1; }
done
exit $rc
