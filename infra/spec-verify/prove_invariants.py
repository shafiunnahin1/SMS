#!/usr/bin/env python3
"""
infra/spec-verify/prove_invariants.py - proves each UNIQUE key targeted by infra/scripts/invariants.tsv is guarded by exactly ONE test:
remove just that key from a scratch copy of the schema, dry-run the smoke script, and require that exactly its own test turns red.
(Without this, a 'rejection' test can pass for the wrong reason - e.g. a duplicate row that also trips a different UNIQUE key.)
Run: python3 infra/spec-verify/prove_invariants.py [repo_root]      (verify.py --deep runs it)
"""
import subprocess, shutil, os, re, sys, tempfile
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..'))
CASES = [('students', ['institution_id', 'student_id'], 'the same student_id in the SAME institution is rejected'),
 ('users', ['institution_id', 'email'], 'the same login email in the SAME institution is rejected'),
 ('fee_payments', ['institution_id', 'receipt_no', 'line_no'], 'the same receipt line twice is rejected'),
 ('payroll_items', ['run_id', 'payee_type', 'payee_id'], 'the same payee twice in one payroll run is rejected'),
 ('payroll_runs', ['institution_id', 'month', 'kind', 'label'], 'a second regular run for the same month and label is rejected'),
 ('vouchers', ['institution_id', 'source', 'source_id'], 'an automatic voucher is posted once per source record'),
 ('admission_leads', ['institution_id', 'application_no'], 'an application number is unique within an institution'),
 ('certificates', ['institution_id', 'verify_code'], '... and the same code again is rejected'),
 ('fee_structures', ['program_id', 'batch_id', 'fee_category_id', 'academic_year_id'], 'a second fee structure for one (program, batch, category, year) is rejected'),
 ('final_results', ['result_sheet_id', 'student_id'], 'a second final result for the same sheet and student is rejected'),
 ('consents', ['student_id', 'type'], 'a second consent row for the same student and type is rejected')]
def remove_unique(sql, table, cols):
    want, n = set(cols), 0
    def idx(m):
        nonlocal n
        if m.group(1) == table and set(c.strip() for c in m.group(2).split(',')) == want: n += 1; return ''
        return m.group(0)
    sql = re.sub(r"CREATE UNIQUE INDEX \w+ ON (\w+)\(([^)]*)\);", idx, sql)
    a = sql.index(f'CREATE TABLE {table} ('); b = sql.index('\n);', a); body = sql[a:b]
    def inl(m):
        nonlocal n
        if set(c.strip() for c in m.group(1).split(',')) == want: n += 1; return ''
        return m.group(0)
    return sql[:a] + re.sub(r",?[ \t]*\n[ \t]*UNIQUE(?: KEY)?\s*(?:\w+\s*)?\(([^)]*)\)", inl, body) + sql[b:], n
def main():
    good = 0; problems = []
    for tb, cols, test in CASES:
        d = tempfile.mkdtemp(); shutil.rmtree(d); shutil.copytree(SRC, d, ignore=shutil.ignore_patterns('__pycache__', '*.db', '.git'))
        p = d + '/docs/database/schema.sql'; s = open(p, encoding='utf-8').read(); s2, n = remove_unique(s, tb, cols)
        if n != 1: problems.append(f'{tb}{tuple(cols)}: the key was not found exactly once in the schema (found {n})'); continue
        open(p, 'w', encoding='utf-8').write(s2); subprocess.run([sys.executable, d + '/infra/scripts/gen_invariants.py', d], capture_output=True)
        env = dict(os.environ, SMOKE_ENGINE='sqlite', MYSQL_CMD_STR=f'{sys.executable} {d}/infra/scripts/sqlite_shim.py', SHIM_DIR=d)
        r = subprocess.run(['bash', d + '/infra/scripts/mysql-smoke.sh'], capture_output=True, text=True, env=env)
        fails = [l[6:].split('   (expected')[0] for l in r.stdout.split('\n') if l.startswith('FAIL')]
        if r.returncode == 1 and fails == [test]: good += 1
        else: problems.append(f'{tb}{tuple(cols)}: exit {r.returncode}, failing tests {fails}')
        shutil.rmtree(d, ignore_errors=True)
    print(f'{good} of {len(CASES)} unique keys are individually proven by exactly one test'); [print('PROBLEM', x) for x in problems]
    return 0 if not problems else 1
if __name__ == '__main__': sys.exit(main())
