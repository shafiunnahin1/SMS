#!/usr/bin/env python3
"""
infra/scripts/perf-check.py - does the schema stay fast as data grows?  Seeds a REALISTIC volume into the tables that grow fastest, then for every query in hot-queries.tsv
records the optimizer's plan (EXPLAIN) and the elapsed time, and fails on a full scan of a big table or a time over budget.

  SCALE=1 (default for MySQL):  250 institutions x 200 students = 50,000 students; attendances 220 days = 11,000,000 rows; fee_payments 1,000,000; sms_logs 2,000,000;
                                audit_logs 2,000,000; messages 1,000,000; expenses 200,000; enrollments 50,000.
  Institution 7 owns students 1201-1400 (so student 1234) and batches 31-35; the catalogue's literals match this seed.

  docker compose -f infra/docker-compose.dev.yml up -d --wait mysql
  python3 infra/scripts/perf-check.py                         # SCALE=1 against MySQL (minutes to seed, depending on the machine)
  python3 infra/scripts/perf-check.py --scale 0.1             # quicker
  SMOKE_ENGINE=sqlite MYSQL_CMD_STR="python3 infra/scripts/sqlite_shim.py" python3 infra/scripts/perf-check.py --scale 0.04    # DRY RUN of this tool's logic only

HONESTY: nothing here has run on a real MySQL. Timings include `docker exec` + client overhead (a SELECT 1 baseline is subtracted; error is tens of milliseconds), a laptop is not your
production server, and the budget (--budget-ms, default 500 = the p95 target in docs/ops/performance-benchmarks.md) is a placeholder until you measure on target hardware.
Exit: 0 all within budget, no full scans | 1 a problem | 3 environment.
"""
import os, re, sys, time, shlex, sqlite3, subprocess, statistics, argparse
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser(); ap.add_argument('--scale', type=float, default=None); ap.add_argument('--budget-ms', type=float, default=500); ap.add_argument('--db', default='lms_perf'); ap.add_argument('--keep', action='store_true'); ap.add_argument('--big-rows', type=int, default=100_000, help='tables with at least this many seeded rows count as BIG (a full read of one is a failure)')
a = ap.parse_args()
ENGINE = os.environ.get('SMOKE_ENGINE', 'mysql'); SCALE = a.scale if a.scale is not None else (1.0 if ENGINE == 'mysql' else 0.04)
MYSQL_CMD = shlex.split(os.environ['MYSQL_CMD_STR']) if os.environ.get('MYSQL_CMD_STR') else ['docker', 'compose', '-f', os.path.join(ROOT, 'infra/docker-compose.dev.yml'), 'exec', '-T', 'mysql', 'mysql', '-uroot', '-proot']
SQL_MODE = "ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"
def cli(sql=None, db=None, stdin=None):
    cmd = MYSQL_CMD + ['--default-character-set=utf8mb4', f'--init-command=SET SESSION sql_mode=\'{SQL_MODE}\'', '-N', '-B'] + ([db] if db else []) + (['-e', sql] if sql is not None else [])
    t0 = time.perf_counter(); r = subprocess.run(cmd, input=stdin, capture_output=True, text=True); dt = (time.perf_counter() - t0) * 1000
    return r.returncode, (r.stdout or '').strip(), '\n'.join(l for l in (r.stderr or '').split('\n') if 'insecure' not in l.lower()).strip(), dt
def die(msg, code=3): print(msg); sys.exit(code)

# ---- dialect helpers --------------------------------------------------------------------------------------------------------------------------------------
my = ENGINE == 'mysql'
DIV = (lambda x, y: f'(({x}) DIV ({y}))') if my else (lambda x, y: f'(({x}) / ({y}))')
MOD = lambda x, y: f'(({x}) % ({y}))'
DAY = (lambda base, n: f"DATE_ADD('{base}', INTERVAL ({n}) DAY)") if my else (lambda base, n: f"date('{base}', '+' || ({n}) || ' days')")
TS = (lambda base, n: f"DATE_ADD('{base} 09:00:00', INTERVAL ({n}) DAY)") if my else (lambda base, n: f"datetime('{base} 09:00:00', '+' || ({n}) || ' days')")
CAT = (lambda *p: 'CONCAT(' + ', '.join(p) + ')') if my else (lambda *p: '(' + ' || '.join(p) + ')')

# ---- seed plan ------------------------------------------------------------------------------------------------------------------------------------------------
NI = max(10, round(250 * SCALE)); PER = 200; STUDENTS = NI * PER; DAYS = 220; START = '2026-09-01'
sch = re.sub(r'--[^\n]*', '', open(os.path.join(ROOT, 'docs/database/schema.sql'), encoding='utf-8').read())
lite = re.sub(r"ENUM\([^)]*\)", "TEXT", sch); lite = re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", lite); lite = re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b", r"\1", lite)
lite = re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b", "", lite); lite = re.sub(r"\bUNIQUE KEY\s+\w+\s*\(", 'UNIQUE (', lite); lite = re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)", '', lite)
meta = sqlite3.connect(':memory:')
for st in [x.strip() for x in lite.split(';') if x.strip()]:
    if not st.upper().startswith('CREATE INDEX'): meta.execute(st)
enums = {}
for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', sch, re.S):
    for c in re.finditer(r'\n\s*(\w+)\s+ENUM\(([^)]*)\)', m.group(2)): enums[(m.group(1), c.group(1))] = re.findall(r"'([^']*)'", c.group(2))
def synth(tb, name, typ):
    T = (typ or '').upper()
    if (tb, name) in enums: return "'" + enums[(tb, name)][0] + "'"
    if 'JSON' in T: return "'{}'"
    if 'TIMESTAMP' in T or 'DATETIME' in T: return "'2027-01-01 00:00:00'"
    if 'DATE' in T: return "'2027-01-01'"
    if 'TIME' in T: return "'08:00:00'"
    if any(x in T for x in ('INT', 'DECIMAL', 'FLOAT', 'DOUBLE')): return '1'
    return "'x'"
def tenant(si): return f'({DIV(si, PER)} + 1)'                      # institution of 0-based student index si
def batch_of(si): return f'(({DIV(si, PER)}) * 5 + {DIV(MOD(si, PER), 40)} + 1)'
def seed_specs():
    Dd = DAYS; k = 'K'
    si_att = DIV(k, Dd); d_att = MOD(k, Dd)
    return [
      ('attendances', STUDENTS * Dd, {'student_id': f'({si_att} + 1)', 'institution_id': tenant(si_att), 'program_id': tenant(si_att), 'batch_id': batch_of(si_att), 'date': DAY(START, d_att),
        'status': f"CASE WHEN {MOD(k,20)} = 0 THEN 'absent' WHEN {MOD(k,20)} = 1 THEN 'late' ELSE 'present' END"}),
      ('fee_payments', STUDENTS * 20, {'student_id': f'({DIV(k,20)} + 1)', 'institution_id': tenant(DIV(k, 20)), 'receipt_no': CAT("'R'", f'({DIV(k,20)} + 1)', "'-'", DIV(MOD(k, 20), 2)),
        'line_no': f'({MOD(MOD(k,20),2)} + 1)', 'paid_at': TS(START, MOD(k, DAYS)), 'paid_amount': '500'}),
      ('sms_logs', STUDENTS * 40, {'institution_id': f'({MOD(k, NI)} + 1)', 'campaign_id': f'({MOD(k, NI)} + 1)', 'sent_at': TS(START, MOD(k, DAYS)), 'status': "'sent'"}),
      ('audit_logs', STUDENTS * 40, {'institution_id': f'(CASE WHEN {MOD(k, 50)} = 0 THEN NULL ELSE {MOD(k, NI)} + 1 END)', 'user_id': f'({MOD(k, STUDENTS)} + 1)', 'model': "'students'", 'model_id': f'({MOD(k, STUDENTS)} + 1)', 'action': "'update'", 'created_at': TS(START, MOD(k, DAYS))}),
      ('messages', STUDENTS * 20, {'institution_id': f'({MOD(k, NI)} + 1)', 'to_user_id': f'({MOD(k, STUDENTS)} + 1)', 'from_user_id': f'({MOD(f'{k} * 7', STUDENTS)} + 1)', 'is_read': f'(CASE WHEN {MOD(k,3)} = 0 THEN 0 ELSE 1 END)', 'created_at': TS(START, MOD(k, DAYS))}),
      ('expenses', STUDENTS * 4, {'institution_id': f'({MOD(k, NI)} + 1)', 'expense_date': DAY(START, MOD(k, DAYS)), 'amount': '250'}),
      ('enrollments', STUDENTS, {'student_id': f'({k} + 1)', 'institution_id': tenant(k), 'program_id': tenant(k), 'batch_id': batch_of(k), 'status': "'active'", 'enrolled_at': f"'{START}'"}),
    ]
def insert_for(tb, mapping, lo, hi):
    cols, exprs = [], []
    for cid, name, typ, nn, dflt, pk in meta.execute(f'PRAGMA table_info({tb})'):
        if pk: continue
        if name in mapping: cols.append(name); exprs.append(mapping[name].replace('K', f'({lo} + n)'))
        elif nn and dflt is None: cols.append(name); exprs.append(synth(tb, name, typ))
    return f"INSERT INTO {tb}({', '.join(cols)}) SELECT {', '.join(exprs)} FROM perf_nums WHERE n < {hi - lo}"

# ---- run ------------------------------------------------------------------------------------------------------------------------------------------------------
print(f'engine={ENGINE} scale={SCALE}: {NI} institutions, {STUDENTS:,} students, {STUDENTS*DAYS:,} attendance rows planned, budget {a.budget_ms:.0f} ms')
rc, out, err, _ = cli(f"DROP DATABASE IF EXISTS `{a.db}`; CREATE DATABASE `{a.db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
if rc: die('cannot reach the database:\n' + err)
rc, out, err, _ = cli(db=a.db, stdin=open(os.path.join(ROOT, 'docs/database/schema.sql'), encoding='utf-8').read())
if rc: die('SCHEMA LOAD FAILED (fix schema.sql first - see docs/spike/SPIKE-RUNBOOK.md step 0):\n' + err, 2)
CH = 1_000_000 if my else 100_000
rc, _, err, _ = cli(f"CREATE TABLE perf_nums (n BIGINT PRIMARY KEY); INSERT INTO perf_nums " + (
    "SELECT a.d + 10*b.d + 100*c.d + 1000*d.d + 10000*e.d + 100000*f.d FROM (SELECT 0 d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a, "
    + ", ".join(f"(SELECT 0 d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) {x}" for x in 'bcdef')
    if my else "WITH RECURSIVE s(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM s WHERE n < %d) SELECT n FROM s" % (CH - 1)), db=a.db)
if rc: die('cannot create the numbers table:\n' + err)
t_seed = time.perf_counter(); counts = {}
for tb, total, mapping in seed_specs():
    done = 0
    while done < total:
        hi = min(done + CH, total)
        rc, _, err, dt = cli("SET FOREIGN_KEY_CHECKS=0; " + insert_for(tb, mapping, done, hi), db=a.db)
        if rc: die(f'seeding {tb} failed at row {done:,}:\n{err[:600]}\n(the NOT NULL columns without a default are synthesised; a new column may need a value in perf-check.py)', 3)
        done = hi; print(f'  seeded {tb:14} {done:>12,} / {total:,}', end='\r', flush=True)
    counts[tb] = total; print(f'  seeded {tb:14} {total:>12,} rows' + ' ' * 12)
rc, _, err, _ = cli('; '.join(f'ANALYZE TABLE {t}' for t in counts) if my else 'ANALYZE', db=a.db)
print(f'  seeding took {time.perf_counter() - t_seed:.0f}s')
base = min(cli('SELECT 1', db=a.db)[3] for _ in range(5))
BIG = {t for t, n in counts.items() if n >= a.big_rows}
problems, rows = [], []
for line in open(os.path.join(ROOT, 'infra/scripts/hot-queries.tsv'), encoding='utf-8'):
    if not line.strip(): continue
    name, mode, sql = line.rstrip('\n').split('\t', 2)
    tbls = set(re.findall(r'\b(?:FROM|JOIN)\s+(\w+)', sql))
    rc, plan, err, _ = cli(('EXPLAIN ' if my else 'EXPLAIN QUERY PLAN ') + sql, db=a.db)
    if rc: problems.append(f'{name}: EXPLAIN failed: {err[:150]}'); continue
    full = []; filesort = False; used = '?'
    if my:      # id select_type table partitions type possible_keys key key_len ref rows filtered Extra
        for r in plan.split('\n'):
            c = r.split('\t')
            if len(c) >= 12 and c[2] in BIG | tbls:
                if c[4] in ('ALL', 'index'): full.append(f'{c[2]}:{c[4]}(~{c[9]} rows)')
                used = c[6]; filesort = filesort or ('filesort' in c[11] or 'temporary' in c[11])
    else:
        for r in plan.split('\n'):
            c = r.split('\t'); text = c[-1]
            if re.match(r'SCAN (?!CONSTANT)', text): full.append(text)
            if 'TEMP B-TREE FOR ORDER BY' in text: filesort = True
            m = re.search(r'INDEX (\w+)', text); used = m.group(1) if m else used
    times = []
    for _ in range(5):
        rc2, o, e, dt = cli(sql, db=a.db); times.append(max(dt - base, 0.0))
    med = statistics.median(times); n_rows = len([x for x in o.split('\n') if x]) if rc2 == 0 else -1
    status = 'ok'
    if full and (tbls & BIG): status = 'FULLSCAN'; problems.append(f'{name}: full read of a big table -> {full}')
    elif mode == 'sorted' and filesort and (tbls & BIG): status = 'SORT'; problems.append(f'{name}: filesort on a big table')
    elif med > a.budget_ms: status = 'SLOW'; problems.append(f'{name}: {med:.0f} ms > budget {a.budget_ms:.0f} ms')
    rows.append((name, status, used, med, n_rows))
print(f"\n{'query':28} {'status':9} {'index used':34} {'ms':>8} {'rows':>6}")
for n, s, u, ms, nr in rows: print(f'{n:28} {s:9} {str(u)[:34]:34} {ms:8.1f} {nr:6}')
_hq = open(os.path.join(ROOT, 'infra/scripts/hot-queries.tsv'), encoding='utf-8').read()
empty = [n for n, s, u, ms, nr in rows if nr == 0 and any(re.search(r'\b(?:FROM|JOIN)\s+%s\b' % t, _hq.split(n + '\t')[1].split('\n')[0]) for t in BIG)]      # whole-word match: staff_attendances is NOT the big attendances table
if empty: print('NOTE: these big-table queries returned 0 rows, so their timing is not meaningful (seed/literal mismatch):', empty)
if not a.keep: cli(f"DROP DATABASE IF EXISTS `{a.db}`")
print(f'\n{len(rows)} queries, {len(problems)} problem(s)')
for p in problems: print('PROBLEM', p)
sys.exit(1 if problems else 0)
