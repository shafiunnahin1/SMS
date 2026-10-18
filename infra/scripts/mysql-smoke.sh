#!/usr/bin/env bash
# infra/scripts/mysql-smoke.sh - load docs/database/schema.sql into a REAL MySQL 8 and run the database-behaviour tests in invariants.tsv.
#   docker compose -f infra/docker-compose.dev.yml up -d --wait mysql
#   bash infra/scripts/mysql-smoke.sh
# Exit codes: 0 all pass | 1 a behaviour test failed | 2 the SCHEMA DID NOT LOAD (the most important result) | 3 setup or environment problem.
# Environment overrides:  SMOKE_DB (default lms_smoke)   MYSQL_CMD_STR (the mysql client command; default = the compose service)   SMOKE_ENGINE (mysql | sqlite)
# SMOKE_ENGINE=sqlite with MYSQL_CMD_STR="python3 infra/scripts/sqlite_shim.py" is a DRY RUN of this script's own logic - it proves nothing about MySQL.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA="$ROOT/docs/database/schema.sql"
TSV="$ROOT/infra/scripts/invariants.tsv"
DB="${SMOKE_DB:-lms_smoke}"
ENGINE="${SMOKE_ENGINE:-mysql}"
# the connection settings Laravel applies when `strict => true`
SQL_MODE="ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"
if [ -n "${MYSQL_CMD_STR:-}" ]; then read -r -a MYSQL_CMD <<< "$MYSQL_CMD_STR"
else MYSQL_CMD=(docker compose -f "$ROOT/infra/docker-compose.dev.yml" exec -T mysql mysql -uroot -proot); fi

mysql_run() { "${MYSQL_CMD[@]}" --default-character-set=utf8mb4 "--init-command=SET SESSION sql_mode='${SQL_MODE}'" "$@" < /dev/null; }
clean() { grep -v -i -e 'insecure' -e 'Using a password' || true; }

[ -f "$SCHEMA" ] || { echo "missing $SCHEMA"; exit 3; }
[ -f "$TSV" ] || { echo "missing $TSV (run: python3 infra/scripts/gen_invariants.py .)"; exit 3; }

echo "== 1. create database $DB (utf8mb4 / utf8mb4_unicode_ci)"
out=$(mysql_run -e "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1); rc=$?
if [ $rc -ne 0 ]; then echo "cannot reach MySQL:"; echo "$out" | clean; exit 3; fi

echo "== 2. load docs/database/schema.sql"
out=$("${MYSQL_CMD[@]}" --default-character-set=utf8mb4 "--init-command=SET SESSION sql_mode='${SQL_MODE}'" "$DB" < "$SCHEMA" 2>&1); rc=$?
if [ $rc -ne 0 ]; then echo "SCHEMA LOAD FAILED (exit $rc) - this is a real defect to fix in schema.sql:"; echo "$out" | clean; exit 2; fi
expected=$(grep -c '^CREATE TABLE' "$SCHEMA")
actual=$(mysql_run -N -B "$DB" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE'" 2>&1 | clean | tr -d '\r\n ')
if [ "$actual" != "$expected" ]; then echo "table count: schema declares $expected, database has '$actual'"; exit 2; fi
echo "   ok: $actual tables created"

echo "== 3. behaviour tests ($TSV)"
pass=0; fail=0; skipped=0; failed_names=()
while IFS=$'\t' read -r name eng expect sql <&3; do
  [ -z "${name:-}" ] && continue
  if [ "$name" = "setup" ]; then
    out=$(mysql_run -N -B "$DB" -e "$sql" 2>&1); rc=$?
    if [ $rc -ne 0 ]; then echo "SETUP FAILED: $sql"; echo "$out" | clean; exit 3; fi
    continue
  fi
  if [ "$eng" = "mysql" ] && [ "$ENGINE" != "mysql" ]; then skipped=$((skipped+1)); continue; fi
  out=$(mysql_run -N -B "$DB" -e "$sql" 2>&1); rc=$?; out=$(printf '%s' "$out" | clean | tr -d '\r')
  result=FAIL
  case "$expect" in
    ok)     [ $rc -eq 0 ] && result=PASS ;;
    fail)   [ $rc -ne 0 ] && result=PASS ;;
    out=*)  [ $rc -eq 0 ] && [ "$out" = "${expect#out=}" ] && result=PASS ;;
  esac
  if [ "$result" = PASS ]; then pass=$((pass+1)); echo "PASS  $name"
  else fail=$((fail+1)); failed_names+=("$name"); echo "FAIL  $name   (expected: $expect; exit $rc; output: ${out:0:160})"; fi
done 3< "$TSV"

echo
echo "== result: $pass passed, $fail failed, $skipped skipped (engine=$ENGINE)"
if [ "$ENGINE" != "mysql" ]; then echo "   NOTE: this was a DRY RUN against SQLite. The MySQL-only tests were skipped; nothing here proves MySQL behaviour."; fi
[ $fail -eq 0 ] || exit 1
exit 0
