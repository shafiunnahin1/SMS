#!/usr/bin/env python3
"""
infra/spec-verify/plan_check.py - does the schema's INDEX DESIGN serve the hot queries?  Reads infra/scripts/hot-queries.tsv (name <TAB> any|sorted <TAB> SQL),
loads docs/database/schema.sql into SQLite and asks the planner (EXPLAIN QUERY PLAN) for each query.
  FAIL  a plan line "SCAN <table>" (the whole table - or the whole index - is read)         -> add/repair an index
  FAIL  (sorted queries only) "USE TEMP B-TREE FOR ORDER BY"                                -> the index does not deliver the order; a big list would filesort
It needs no data. LIMITS: SQLite's planner is not MySQL's - it proves an index is *usable* for the query shape, not that MySQL will choose it or how fast it runs.
infra/scripts/perf-check.py is the real-MySQL counterpart (seeds data, runs EXPLAIN, times).   Usage: plan_check.py [repo_root] [--verbose]
"""
import re, sqlite3, sys, os
ROOT = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(os.path.dirname(__file__), '..', '..')))
def load(root):
    t = re.sub(r'--[^\n]*', '', open(os.path.join(root, 'docs/database/schema.sql'), encoding='utf-8').read())
    t = re.sub(r"ENUM\([^)]*\)", "TEXT", t); t = re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", t)
    t = re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b", r"\1", t); t = re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b", "", t)
    t = re.sub(r"\bUNIQUE KEY\s+(\w+)\s*\(", r"UNIQUE (", t)
    # inline "INDEX name (cols)" / "KEY name (cols)" clauses are real indexes in MySQL - keep them as CREATE INDEX instead of dropping them (a past blind spot)
    extra = []
    def grab(m):
        extra.append((m.group(1), m.group(2))); return ''
    out = []
    for blk in re.split(r'(?=CREATE TABLE )', t):
        mt = re.match(r'CREATE TABLE (\w+)', blk)
        if mt:
            tbl = mt.group(1)
            blk = re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+(\w+)\s*\(([^)]*)\)", lambda m: (extra.append((tbl, m.group(1), m.group(2))), '')[1], blk)
        out.append(blk)
    con = sqlite3.connect(':memory:')
    for st in [x.strip() for x in re.sub(r'ALTER TABLE\s+\w+\s+ADD CONSTRAINT[^;]*;','',''.join(out)).split(';') if x.strip()]: con.execute(st)
    for tbl, name, cols in extra:
        try: con.execute(f'CREATE INDEX inline_{tbl}_{name} ON {tbl}({cols})')
        except sqlite3.Error: pass
    # InnoDB creates an index on every FOREIGN KEY column(s) when no existing index already starts with them; SQLite does not. Model InnoDB, or `institution_id` FK lookups look like scans.
    tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
    for tb in tables:
        have = [tuple(c[2] for c in con.execute(f'PRAGMA index_info({ix[1]})')) for ix in con.execute(f'PRAGMA index_list({tb})')]
        groups = {}
        for fk in con.execute(f'PRAGMA foreign_key_list({tb})'): groups.setdefault(fk[0], []).append((fk[1], fk[3]))
        for gid, cols_ in groups.items():
            cols_ = [c for _, c in sorted(cols_)]
            if not any(h[:len(cols_)] == tuple(cols_) for h in have): con.execute(f'CREATE INDEX innodb_fk_{tb}_{"_".join(cols_)} ON {tb}({", ".join(cols_)})')
    return con
def check(root, verbose=False):
    con = load(root); problems = []; rows = []
    for line in open(os.path.join(root, 'infra/scripts/hot-queries.tsv'), encoding='utf-8'):
        if not line.strip(): continue
        name, mode, sql = line.rstrip('\n').split('\t', 2)
        try: plan = [r[3] for r in con.execute('EXPLAIN QUERY PLAN ' + sql)]
        except sqlite3.Error as e: problems.append(f'{name}: query does not run against the schema ({e})'); continue
        scans = [p for p in plan if re.match(r'SCAN (?!CONSTANT)', p)]
        sort = [p for p in plan if 'TEMP B-TREE FOR ORDER BY' in p]
        used = [re.search(r'USING (?:COVERING )?INDEX (\w+)', p).group(1) for p in plan if re.search(r'USING (?:COVERING )?INDEX (\w+)', p)]
        # selectivity: an index that is merely *usable* is not enough - the FIRST equality column of the WHERE clause (the tenant / entity: institution_id, batch_id, to_user_id ...)
        # must be part of the index search, otherwise MySQL walks every tenant's rows for that other column (e.g. all fee structures of one category).
        m = re.search(r'WHERE\s+(\w+)\s*=\s*[^\s)]+', sql)
        lead = m.group(1) if m else None
        if lead and lead != 'id' and not scans and not any(re.search(r'\b%s=\?' % lead, p) for p in plan if p.startswith('SEARCH')):
            problems.append(f"{name}: no index search on its leading filter column `{lead}` -> {plan[0]}"); rows.append((name, 'WEAK', ','.join(dict.fromkeys(used)))); continue
        # a date RANGE must be bounded INSIDE the index too; otherwise the index only narrows to the tenant and every row of that tenant is read
        dr = re.findall(r'\b(sent_at|paid_at|created_at|expense_date|date|published_at|punched_at|due_date)\s*(?:BETWEEN|>=|<=|>|<)', sql)
        if dr and not scans:
            searched = ' '.join(p for p in plan if p.startswith('SEARCH'))
            if not any(re.search(r'\b%s[<>]' % c, searched) for c in set(dr)):
                problems.append(f"{name}: date range on `{dr[0]}` is not bounded inside the index -> {plan[0]}"); rows.append((name, 'RANGE', ','.join(dict.fromkeys(used)))); continue
        if scans: problems.append(f'{name}: full scan -> {scans[0]}')
        elif mode == 'sorted' and sort: problems.append(f'{name}: result needs a sort (no index delivers the order) -> {sort[0]}')
        rows.append((name, 'SCAN' if scans else ('SORT' if (mode == 'sorted' and sort) else 'ok'), ','.join(dict.fromkeys(used))))
    return rows, problems
if __name__ == '__main__':
    rows, problems = check(ROOT)
    if '--verbose' in sys.argv:
        for n, s, u in rows: print(f'{s:5} {n:28} {u}')
    for p in problems: print('PROBLEM', p)
    print(f'{len(rows)} hot queries checked, {len(problems)} problem(s)'); sys.exit(1 if problems else 0)
