#!/usr/bin/env python3
"""
infra/spec-verify/partition_readiness.py - what would MySQL partitioning of the fast-growing tables require, given docs/database/schema.sql?
MySQL (InnoDB) rules, from the manual as the author remembers it (UNVERIFIED against your server version): (1) a partitioned table cannot have foreign keys, and cannot be referenced by one;
(2) EVERY unique key, including the PRIMARY KEY, must contain all columns of the partitioning expression.
Prints, per candidate table: partition column, primary key, unique keys that lack the column, outgoing foreign keys, incoming foreign keys. Exit 0 always (it is a report); verify.py checks the report runs.
"""
import re, sqlite3, os, sys, collections
ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(os.path.dirname(__file__), '..', '..'))
CANDIDATES = {'attendances': 'date', 'sms_logs': 'sent_at', 'audit_logs': 'created_at', 'messages': 'created_at', 'fee_payments': 'paid_at', 'device_punches': 'punched_at', 'period_attendances': 'date', 'vehicle_locations': 'timestamp'}
def load():
    t = re.sub(r'--[^\n]*', '', open(os.path.join(ROOT, 'docs/database/schema.sql'), encoding='utf-8').read())
    t = re.sub(r"ENUM\([^)]*\)", "TEXT", t); t = re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", t); t = re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b", r"\1", t)
    t = re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b", "", t); t = re.sub(r"\bUNIQUE KEY\s+\w+\s*\(", 'UNIQUE (', t); t = re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)", '', t)
    con = sqlite3.connect(':memory:')
    for st in [x.strip() for x in t.split(';') if x.strip()]: con.execute(st)
    return con
def report():
    con = load(); out = {}
    incoming = collections.defaultdict(list)
    for (tb,) in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'").fetchall():
        for fk in con.execute(f'PRAGMA foreign_key_list({tb})'): incoming[fk[2]].append(f'{tb}.{fk[3]}')
    for tb, col in CANDIDATES.items():
        if not con.execute("select 1 from sqlite_master where name=?", (tb,)).fetchone(): continue
        cols = [c[1] for c in con.execute(f'PRAGMA table_info({tb})')]
        pk = [c[1] for c in con.execute(f'PRAGMA table_info({tb})') if c[5]]
        uniques = [[c[2] for c in con.execute(f'PRAGMA index_info({ix[1]})')] for ix in con.execute(f'PRAGMA index_list({tb})') if ix[2] and ix[3] != 'pk']
        bad_unique = [u for u in uniques if col not in u]
        out[tb] = dict(column=col, column_exists=col in cols, pk=pk, pk_has_col=col in pk, unique_missing_col=bad_unique, fk_out=[f'{fk[3]}->{fk[2]}' for fk in con.execute(f'PRAGMA foreign_key_list({tb})')], fk_in=incoming.get(tb, []))
    return out
if __name__ == '__main__':
    for tb, r in report().items():
        blockers = []
        if r['fk_out']: blockers.append(f"drop FK {r['fk_out']}")
        if r['fk_in']: blockers.append(f"drop FK in {r['fk_in']}")
        if not r['pk_has_col']: blockers.append(f"PRIMARY KEY {r['pk']} lacks `{r['column']}`")
        if r['unique_missing_col']: blockers.append(f"{len(r['unique_missing_col'])} unique key(s) lack `{r['column']}`: {r['unique_missing_col']}")
        print(f"{tb:20} by {r['column']:12} {'READY' if not blockers else 'BLOCKED: ' + '; '.join(blockers)}")
