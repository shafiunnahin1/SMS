# Restore drill — whole database, then one institution

> Step 8.1 (D27, `docs/legal/privacy-and-consent.md` §5.4): everything is in one database, so one institution cannot be restored
> on its own from a backup. The way is: restore the whole backup into a **separate** database, then copy that institution's rows
> out. This file is the procedure and the record of each drill. Never restore over the live database.

## Procedure

```bash
# 1. a backup (production: the nightly backup file of Step 9.1)
mysqldump -u<user> -p --single-transaction --routines --triggers --no-tablespaces edu_saas > backup.sql

# 2. restore it into a NEW database and compare every table's row count with the live one
mysql -u<user> -p -e "CREATE DATABASE edu_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u<user> -p edu_restore < backup.sql
for t in $(mysql -N -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='edu_saas' AND TABLE_TYPE='BASE TABLE'"); do
  [ "$(mysql -N -e "SELECT COUNT(*) FROM edu_saas.\`$t\`")" = "$(mysql -N -e "SELECT COUNT(*) FROM edu_restore.\`$t\`")" ] || echo "MISMATCH $t"
done                                                       # live rows written after the backup will differ - expected in production

# 3. one institution (:id): its institutions row, every table of TenantPurgeService::ORDER filtered by institution_id,
#    its users' one-time codes (tokens are NOT copied - people log in again)
TABLES=$(php -r 'require "vendor/autoload.php"; echo implode(" ", array_reverse(App\Services\Privacy\TenantPurgeService::ORDER));')
mysqldump --no-create-info --skip-triggers --where="id=:id" edu_restore institutions > one.sql
mysqldump --no-create-info --skip-triggers --where="institution_id=:id" edu_restore $TABLES >> one.sql

# 4. check one.sql in a scratch database built from the same schema, then load it where it is needed
#    (into the live database only after the institution's own rows there were removed - otherwise ids collide)
mysql -e "CREATE DATABASE edu_restore_one"; mysqldump --no-data edu_restore | mysql edu_restore_one
mysql edu_restore_one -e "SET FOREIGN_KEY_CHECKS=0; SOURCE one.sql; SET FOREIGN_KEY_CHECKS=1;"
# 5. files: copy institutions/:id/ from the file backup of both disks (private, public)
# 6. drop the scratch databases and delete the dump files (they hold personal data)
```

## Drill record

| Date | Where | Backup | Whole restore | One institution | Time | By |
|---|---|---|---|---|---|---|
| 2026-10-10 | agent's local MySQL 8 (demo seed, 3 institutions) | mysqldump 85,092 bytes, 1 s | 38 tables, every row count equal, 0 s | `alokito-coaching` (id 2): 34 rows in 27 tables, equal to the live counts, 0 rows of any other institution | < 1 min | agent (Step 8.1) |
| 2026-10-11 | Step 9.1: `infra/scripts/backup.sh` on the agent's MySQL 8 → `infra/scripts/restore.sh` into a **clean MySQL 8.0.46 container** (nothing else on it) | 264 KB gzip + files archive + sha256, < 1 s | 38 tables, 9,296 rows, every count equal; `php artisan migrate:status` against it: 39 Ran, 0 Pending; `mysql-smoke.sh` against that server: 33 passed, 0 failed; the files archive restored (a test photo byte-equal) | not repeated (procedure unchanged) | ~ 5 s | agent (Step 9.1) |

The file backup is drilled (2026-10-11). Still to drill: a production-size database on the real server (at deploy, D64) — add a row then.
Scripts: `infra/scripts/backup.sh` (database + files, sha256, optional S3/R2 copy, local retention) and `infra/scripts/restore.sh` (refuses the live database
and any non-empty target; checks the sha256).
