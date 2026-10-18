#!/usr/bin/env python3
"""
infra/scripts/gen_invariants.py - writes infra/scripts/invariants.tsv, the database-behaviour tests that infra/scripts/mysql-smoke.sh runs against a REAL MySQL.
Every INSERT is generated FROM schema.sql (all NOT NULL columns filled, every declared foreign key satisfied by a real parent row), so the tests cannot drift from the schema:
verify.py regenerates this file and fails when the committed copy is stale.
TSV columns: name <TAB> engine (any | mysql) <TAB> expect (ok | fail | out=<text>) <TAB> one-line SQL.
Every 'fail' test has an 'ok' CONTROL built the same way, so a failure cannot be caused by a broken fixture instead of the rule being tested.
engine=mysql rows test behaviour SQLite does not have (strict ENUM/JSON, the 2038 limit, collation, utf8mb4): they are unproven until run on a real MySQL.
"""
import re, os, sys, sqlite3, collections
ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'infra/scripts/invariants.tsv')
src = open(os.path.join(ROOT, 'docs/database/schema.sql'), encoding='utf-8').read()
t = re.sub(r'--[^\n]*', '', src)
enums = {}
for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', t, re.S):
    for c in re.finditer(r'\n\s*(\w+)\s+ENUM\(([^)]*)\)', m.group(2)): enums[(m.group(1), c.group(1))] = re.findall(r"'([^']*)'", c.group(2))
for m in re.finditer(r'ALTER TABLE (\w+) ADD COLUMN (\w+) ENUM\(([^)]*)\)', t): enums[(m.group(1), m.group(2))] = re.findall(r"'([^']*)'", m.group(3))
lite = re.sub(r"ENUM\([^)]*\)", "TEXT", t)
lite = re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", lite); lite = re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b", r"\1", lite)
lite = re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b", "", lite); lite = re.sub(r"\bUNIQUE KEY\s+\w+\s*\(", 'UNIQUE (', lite); lite = re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)", '', lite)
con = sqlite3.connect(':memory:')
for st in [x.strip() for x in re.sub(r'ALTER TABLE\s+\w+\s+ADD CONSTRAINT[^;]*;','',lite).split(';') if x.strip()]: con.execute(st)
tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
fks = {tb: {fk[3]: fk[2] for fk in con.execute(f'PRAGMA foreign_key_list({tb})')} for tb in tables}
uniq = {tb: set(c[2] for ix in con.execute(f'PRAGMA index_list({tb})') if ix[2] for c in con.execute(f'PRAGMA index_info({ix[1]})')) for tb in tables}

def q(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
counter = collections.Counter(); rows = {}; setup = []; tests = []

def value(tb, name, typ, n):
    T = (typ or '').upper()
    if (tb, name) in enums: return enums[(tb, name)][0]
    if 'JSON' in T: return '{}'
    if 'TIMESTAMP' in T or 'DATETIME' in T: return '2027-01-01 00:00:00'
    if 'DATE' in T: return '2027-01-01'
    if 'TIME' in T: return '08:00:00'
    if 'INT' in T or 'DECIMAL' in T or 'FLOAT' in T or 'DOUBLE' in T: return n if name in uniq[tb] and not name.endswith('_id') else 1
    return f'{name}-{n}'

def parent_id(parent, inst):
    if (parent, inst) not in rows: make(parent, inst)
    return rows[(parent, inst)]['id']

def row_of(tb, inst, over=None, new_id=True):
    counter[tb] += 1; n = counter[tb]; row = collections.OrderedDict(); over = over or {}
    for cid, name, typ, nn, dflt, pk in con.execute(f'PRAGMA table_info({tb})'):
        if name in over: row[name] = over[name]
        elif pk: row[name] = n
        elif name == 'institution_id': row[name] = inst
        elif name in fks[tb]:
            if nn: row[name] = inst if fks[tb][name] == 'institutions' else parent_id(fks[tb][name], inst)
        elif nn and dflt is None: row[name] = value(tb, name, typ, n)
        elif name in uniq[tb] and dflt is None and 'INT' not in (typ or '').upper(): row[name] = f'{name}-{n}'
    return row

def insert_sql(tb, row): return f"INSERT INTO {tb}({', '.join(row)}) VALUES({', '.join(q(v) for v in row.values())})"
def make(tb, inst, over=None):                        # registered, executed in the setup phase
    r = row_of(tb, inst, over); rows[(tb, inst)] = r; setup.append(insert_sql(tb, r)); return r
def fresh(tb, inst, over=None): return insert_sql(tb, row_of(tb, inst, over))          # a new row for a test statement
unique_keys = {tb: [] for tb in tables}
for tb in tables:
    for ix in con.execute(f'PRAGMA index_list({tb})'):
        if ix[2]: unique_keys[tb].append(tuple(c[2] for c in con.execute(f'PRAGMA index_info({ix[1]})')))
def dup_key(tb, inst, cols, changes=None):
    """A NEW row that repeats ONLY the values of the unique key `cols` (all other unique values stay distinct), so a rejection can only come from that key."""
    cols = tuple(cols)
    if not any(set(k) == set(cols) for k in unique_keys[tb]): raise SystemExit(f'gen_invariants: {tb}{cols} is not a UNIQUE key in schema.sql (keys: {unique_keys[tb]})')
    r = row_of(tb, inst)
    for c in cols: r[c] = rows[(tb, inst)][c]
    r.update(changes or {}); return insert_sql(tb, r)
def T(name, eng, expect, sql): tests.append((name, eng, expect, sql))

# ---- setup ----
for i in (1, 2):
    rows[('institutions', i)] = row_of('institutions', i, {'id': i, 'slug': f'inst-{i}', 'name': f'Institution {i}'}); setup.append(insert_sql('institutions', rows[('institutions', i)]))
# ---- tests ----
st = make('students', 1)
T('a student in a real institution is allowed (control)', 'any', 'ok', fresh('students', 1))
T('the same student_id in ANOTHER institution is allowed', 'any', 'ok', fresh('students', 2, {'student_id': st['student_id']}))
T('the same student_id in the SAME institution is rejected', 'any', 'fail', dup_key('students', 1, ['institution_id', 'student_id']))
T('a row pointing at a non-existent institution is rejected (foreign key)', 'any', 'fail', fresh('students', 1, {'institution_id': 99}))
T('a row missing a required (NOT NULL) column is rejected', 'any', 'fail', "INSERT INTO students(institution_id) VALUES(1)")
us = make('users', 1, {'email': 'rafi@example.com'})
T('the same login email in ANOTHER institution is allowed', 'any', 'ok', fresh('users', 2, {'email': 'rafi@example.com'}))
T('the same login email in the SAME institution is rejected', 'any', 'fail', dup_key('users', 1, ['institution_id', 'email']))
T('a login email differing only by case is rejected (case-insensitive utf8mb4_unicode_ci)', 'mysql', 'fail', fresh('users', 1, {'email': 'RAFI@EXAMPLE.COM'}))
fp = make('fee_payments', 1, {'receipt_no': 'RCP-T-1', 'line_no': 1})
T('a receipt may carry a second line', 'any', 'ok', fresh('fee_payments', 1, {'receipt_no': 'RCP-T-1', 'line_no': 2}))
T('the same receipt line twice is rejected', 'any', 'fail', dup_key('fee_payments', 1, ['institution_id', 'receipt_no', 'line_no']))
T('the same receipt number in another institution is allowed', 'any', 'ok', fresh('fee_payments', 2, {'receipt_no': 'RCP-T-1', 'line_no': 1}))
run = make('payroll_runs', 1, {'month': '2027-10', 'kind': 'regular', 'label': ''})
it = make('payroll_items', 1, {'run_id': run['id'], 'payee_type': 'teacher', 'payee_id': 7})
T('teacher 7 and staff 7 are different payees in one run', 'any', 'ok', fresh('payroll_items', 1, {'run_id': run['id'], 'payee_type': 'staff', 'payee_id': 7}))
T('the same payee twice in one payroll run is rejected', 'any', 'fail', dup_key('payroll_items', 1, ['run_id', 'payee_type', 'payee_id']))
T('a second regular run for the same month and label is rejected', 'any', 'fail', dup_key('payroll_runs', 1, ['institution_id', 'month', 'kind', 'label']))
T('a bonus run in the same month is allowed', 'any', 'ok', fresh('payroll_runs', 1, {'month': '2027-10', 'kind': 'bonus', 'label': 'eid'}))
make('vouchers', 1, {'source': 'fee', 'source_id': 10})
T('two manual vouchers (NULL source_id) are allowed', 'any', 'ok', fresh('vouchers', 1, {'source': 'manual', 'source_id': None}))
T('an automatic voucher is posted once per source record', 'any', 'fail', dup_key('vouchers', 1, ['institution_id', 'source', 'source_id']))
make('admission_leads', 1, {'application_no': 'A27-AAAAA'})
T('the same application number in another institution is allowed', 'any', 'ok', fresh('admission_leads', 2, {'application_no': 'A27-AAAAA'}))
T('an application number is unique within an institution', 'any', 'fail', dup_key('admission_leads', 1, ['institution_id', 'application_no']))
make('certificates', 1, {'verify_code': None})
T('certificates without a verify code (NULL) may repeat', 'any', 'ok', fresh('certificates', 1, {'verify_code': None}))
T('a certificate verify code is unique within an institution', 'any', 'ok', fresh('certificates', 1, {'verify_code': 'VERIFYCODE01'}))
T('... and the same code again is rejected', 'any', 'fail', fresh('certificates', 1, {'verify_code': 'VERIFYCODE01'}).replace("'VERIFYCODE01'", "'VERIFYCODE01'"))
make('fee_structures', 1, {'batch_id': 0, 'academic_year_id': 0})
T('a second fee structure for one (program, batch, category, year) is rejected', 'any', 'fail', dup_key('fee_structures', 1, ['program_id', 'batch_id', 'fee_category_id', 'academic_year_id']))
make('final_results', 1); make('consents', 1)
T('a second final result for the same sheet and student is rejected', 'any', 'fail', dup_key('final_results', 1, ['result_sheet_id', 'student_id']))
T('a second consent row for the same student and type is rejected', 'any', 'fail', dup_key('consents', 1, ['student_id', 'type']))
# MySQL-only behaviour, each with an 'ok' control built the same way
T('control: a valid ENUM value is accepted', 'mysql', 'ok', fresh('fee_payments', 1, {'receipt_no': 'RCP-T-8', 'line_no': 1}))
T('an invalid ENUM value is rejected in strict mode', 'mysql', 'fail', fresh('fee_payments', 1, {'receipt_no': 'RCP-T-9', 'line_no': 1, 'status': 'bogus'}))
T('control: valid JSON is accepted', 'mysql', 'ok', fresh('result_sheets', 1, {'rule': '{"components": []}'}))
T('invalid JSON text is rejected by a JSON column', 'mysql', 'fail', fresh('result_sheets', 1, {'rule': 'this is not json'}))
T('control: a TIMESTAMP before 2038 is accepted', 'mysql', 'ok', fresh('otp_tokens', 1, {'expires_at': '2030-01-01 00:00:00'}))
T('a TIMESTAMP after 2038-01-19 is rejected (the Y2038 limit)', 'mysql', 'fail', fresh('otp_tokens', 1, {'expires_at': '2040-01-01 00:00:00'}))
s = 'ঢাকা العربية 😀'
T('utf8mb4 round trip: Bengali + Arabic + an emoji keep their length', 'mysql', 'out=1', f"SELECT CHAR_LENGTH('{s}') = {len(s)}")
T('the default collation compares case-insensitively', 'mysql', 'out=1', "SELECT 'Rafi' = 'rafi'")
content = ''.join(f'setup\tany\tok\t{sql}\n' for sql in setup) + ''.join(f'{n}\t{e}\t{x}\t{sql}\n' for n, e, x, sql in tests)
if '--check' in sys.argv:
    cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
    print('invariants.tsv is', 'up to date' if cur == content else 'STALE (run: python3 infra/scripts/gen_invariants.py .)'); sys.exit(0 if cur == content else 1)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f: f.write(content)
print(f'wrote infra/scripts/invariants.tsv: {len(setup)} setup statements, {len(tests)} tests ({sum(1 for x in tests if x[1]=="mysql")} MySQL-only)')
