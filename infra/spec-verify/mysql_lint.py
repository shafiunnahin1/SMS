#!/usr/bin/env python3
"""
infra/spec-verify/mysql_lint.py - static MySQL 8.0 / InnoDB / utf8mb4 lint of docs/database/schema.sql.
Why: the schema is executed in SQLite by verify.py, and SQLite forgives things MySQL rejects at `migrate`. This script looks for those WITHOUT needing MySQL.
It is NOT a substitute for loading the schema into a real MySQL 8 (infra/scripts/mysql-smoke.sh) - it only removes the failures that can be predicted from the text.
The reserved-word list is from memory of the MySQL 8.0 manual: treat a hit as 'must check', and a MISS as 'not guaranteed fine'.
Usage: python3 mysql_lint.py [repo_root]   exit 1 on any ERROR (WARN is advisory).
"""
import re, sys, os, collections
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..')

# MySQL 8.0 reserved words (subset that can plausibly appear as an English column/table name). Source: author's memory - UNVERIFIED against the manual.
RESERVED = set("""
accessible add all alter analyze and as asc asensitive before between bigint binary blob both by call cascade case change char character check collate column condition constraint continue convert create cross cube cume_dist
current_date current_time current_timestamp current_user cursor database databases day_hour day_microsecond day_minute day_second dec decimal declare default delayed delete dense_rank desc describe deterministic distinct
distinctrow div double drop dual each else elseif empty enclosed escaped except exists exit explain false fetch first_value float float4 float8 for force foreign from fulltext function generated get grant group grouping groups
having high_priority hour_microsecond hour_minute hour_second if ignore in index infile inner inout insensitive insert int int1 int2 int3 int4 int8 integer interval into io_after_gtids io_before_gtids is iterate join json_table
key keys kill lag last_value lateral lead leading leave left like limit linear lines load localtime localtimestamp lock long longblob longtext loop low_priority master_bind master_ssl_verify_server_cert match maxvalue mediumblob
mediumint mediumtext middleint minute_microsecond minute_second mod modifies natural not no_write_to_binlog nth_value ntile null numeric of on optimize optimizer_costs option optionally or order out outer outfile over partition
percent_rank precision primary procedure purge range rank read reads read_write real recursive references regexp release rename repeat replace require resignal restrict return revoke right rlike row rows row_number schema schemas
second_microsecond select sensitive separator set show signal smallint spatial specific sql sqlexception sqlstate sqlwarning sql_big_result sql_calc_found_rows sql_small_result ssl starting stored straight_join system table
terminated then tinyblob tinyint tinytext to trailing trigger true undo union unique unlock unsigned update usage use using utc_date utc_time utc_timestamp values varbinary varchar varcharacter varying virtual when where while
window with write xor year_month zerofill
""".split())
BYTES = {'tinyint':1,'smallint':2,'mediumint':3,'int':4,'integer':4,'bigint':8,'date':3,'time':3,'datetime':5,'timestamp':4,'year':1,'float':4,'double':8,'decimal':None,'enum':2,'json':None,'text':None}

src = open(os.path.join(ROOT, 'docs/database/schema.sql'), encoding='utf-8').read()
sql = re.sub(r'--[^\n]*', '', src)
tables = collections.OrderedDict()          # name -> dict(cols=OrderedDict(name->info), idx=[(kind,name,cols)], fks=[(cols,reftable,refcols)])
ERR, WRN = [], []
def err(m): ERR.append(m)
def wrn(m): WRN.append(m)

def parse_type(rest):
    m = re.match(r"\s*(\w+)\s*(\(([^)]*)\))?\s*(unsigned)?", rest, re.I)
    base = m.group(1).lower(); arg = m.group(3); uns = bool(m.group(4))
    return base, arg, uns

for m in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\)\s*;', sql, re.S):
    name, body = m.group(1), m.group(2)
    t = dict(cols=collections.OrderedDict(), idx=[], fks=[])
    # split on commas that are not inside parentheses
    parts, depth, cur = [], 0, ''
    for ch in body:
        if ch == '(': depth += 1
        if ch == ')': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    for p in parts:
        p = p.strip()
        if not p: continue
        u = re.match(r'UNIQUE(?: KEY| INDEX)?\s*(\w+)?\s*\(([^)]*)\)', p, re.I)
        k = re.match(r'(?:KEY|INDEX)\s+(\w+)\s*\(([^)]*)\)', p, re.I)
        f = re.match(r'FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+(\w+)\s*\(([^)]*)\)', p, re.I)
        if u: t['idx'].append(('unique', u.group(1) or 'unnamed', [c.strip() for c in u.group(2).split(',')])); continue
        if k: t['idx'].append(('index', k.group(1), [c.strip() for c in k.group(2).split(',')])); continue
        if f: t['fks'].append(([c.strip() for c in f.group(1).split(',')], f.group(2), [c.strip() for c in f.group(3).split(',')])); continue
        if re.match(r'(PRIMARY KEY|CONSTRAINT\b|CHECK\s*\()', p, re.I): continue
        cm = re.match(r'(`?)(\w+)`?\s+(.*)', p, re.S)
        quoted, cname, rest = bool(cm.group(1)), cm.group(2), cm.group(3)
        base, arg, uns = parse_type(rest)
        info = dict(quoted=quoted, base=base, arg=arg, uns=uns, raw=rest, null=not re.search(r'NOT NULL', rest, re.I), pk=bool(re.search(r'PRIMARY KEY', rest, re.I)))
        dm = re.search(r"DEFAULT\s+(\([^)]*\)|'[^']*'|[\w.()]+)", rest, re.I); info['default'] = dm.group(1) if dm else None
        if cname in t['cols']: err(f'{name}.{cname}: duplicate column')
        t['cols'][cname] = info
        if info['pk']: t['idx'].append(('primary', 'PRIMARY', [cname]))
        if re.search(r'\bUNIQUE\b', rest, re.I): t['idx'].append(('unique', f'{cname}_unique', [cname]))
    tables[name] = t

for m in re.finditer(r'ALTER TABLE (\w+) ADD COLUMN (\w+)\s+([^;]*);', sql, re.I):
    tb, cn, rest = m.group(1), m.group(2), m.group(3)
    if tb not in tables: err(f'ALTER on unknown table {tb}'); continue
    base, arg, uns = parse_type(rest)
    if cn in tables[tb]['cols']: err(f'{tb}.{cn}: duplicate column (CREATE + ALTER)')
    dm = re.search(r"DEFAULT\s+(\([^)]*\)|'[^']*'|[\w.()]+)", rest, re.I)
    tables[tb]['cols'][cn] = dict(base=base, arg=arg, uns=uns, raw=rest, null=not re.search(r'NOT NULL', rest, re.I), pk=False, default=dm.group(1) if dm else None)
for m in re.finditer(r'CREATE (UNIQUE )?INDEX (\w+) ON (\w+)\(([^)]*)\)', sql, re.I):
    tb = m.group(3)
    if tb not in tables: err(f'index {m.group(2)} on unknown table {tb}'); continue
    tables[tb]['idx'].append(('unique' if m.group(1) else 'index', m.group(2), [c.strip() for c in m.group(4).split(',')]))

def col_bytes(c):
    b, a = c['base'], c['arg']
    if b in ('varchar', 'char'): return 4 * int(a) + (2 if b == 'varchar' else 0)          # utf8mb4: up to 4 bytes per character
    if b == 'decimal':
        p = int(a.split(',')[0]); return (p // 9) * 4 + {0:0,1:1,2:1,3:2,4:2,5:3,6:3,7:4,8:4}[p % 9]
    if b in ('text', 'json', 'blob', 'longtext', 'mediumtext', 'tinytext'): return None
    return BYTES.get(b, 8)

# 1 identifiers
for tb, t in tables.items():
    if tb in RESERVED: err(f'table `{tb}` is a reserved word (needs backticks everywhere; Laravel quotes it, raw SQL will break)')
    if len(tb) > 64: err(f'table name too long: {tb}')
    for cn in t['cols']:
        if cn in RESERVED:
            if t['cols'][cn].get('quoted'): wrn(f'{tb}.{cn}: reserved word, quoted in the schema - every raw SQL / query-builder string that names it must quote it too')
            else: err(f'{tb}.{cn}: column name is a MySQL 8 reserved word and is NOT quoted')
        if len(cn) > 64: err(f'{tb}.{cn}: identifier longer than 64')
    names = [n for k, n, c in t['idx'] if n not in ('PRIMARY', 'unnamed') and not n.endswith('_unique')]
    for n in set(names):
        if names.count(n) > 1: err(f'{tb}: duplicate index name {n}')
        if len(n) > 64: err(f'{tb}: index name longer than 64: {n}')
# 2 column definitions
for tb, t in tables.items():
    for cn, c in t['cols'].items():
        if c['base'] in ('text', 'json', 'blob', 'longtext', 'mediumtext') and c['default'] not in (None, 'NULL') and not str(c['default']).startswith('('):
            err(f'{tb}.{cn}: {c["base"].upper()} cannot have a literal DEFAULT (error 1101); use NULL or an expression default')
        if c['base'] == 'enum':
            vals = re.findall(r"'([^']*)'", c['arg'] or '')
            d = c['default']
            if d and d.strip("'") not in vals and d.upper() != 'NULL': err(f'{tb}.{cn}: ENUM default {d} not in {vals}')
        if c['base'] == 'decimal':
            p, s = [int(x) for x in (c['arg'] + ',0').split(',')[:2]]
            if s > p: err(f'{tb}.{cn}: DECIMAL scale > precision')
        if c['default'] and re.search(r'0000-00-00', c['default']): err(f'{tb}.{cn}: zero-date default is rejected in strict mode')
        if re.search(r'ON UPDATE CURRENT_TIMESTAMP', c['raw'], re.I) and c['base'] not in ('timestamp', 'datetime'): err(f'{tb}.{cn}: ON UPDATE CURRENT_TIMESTAMP on {c["base"]}')
        if c['base'] == 'timestamp' and re.search(r'(expire|until|ends?_at|valid_to|locked_until|next_|due_at)', cn):
            wrn(f'{tb}.{cn}: TIMESTAMP cannot store dates after 2038-01-19 - use DATETIME if a far-future date can occur')
# 2b literal defaults MySQL rejects / ON DELETE SET NULL on a NOT NULL column
for tb, t_ in tables.items():
    for cn, c in t_['cols'].items():
        if c['default'] and re.fullmatch(r'CURRENT_DATE', c['default'], re.I): err(f'{tb}.{cn}: DEFAULT CURRENT_DATE needs parentheses (expression default)')
for m_ in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\)\s*;', sql, re.S):
    for fk in re.finditer(r'FOREIGN KEY\s*\((\w+)\)[^,]*?ON DELETE SET NULL', m_.group(2), re.I|re.S):
        c_ = tables[m_.group(1)]['cols'].get(fk.group(1))
        if c_ and not c_['null']: err(f'{m_.group(1)}.{fk.group(1)}: ON DELETE SET NULL on a NOT NULL column')
# 3 foreign keys: same type and signedness as the referenced column; referenced column must be indexed
for tb, t in tables.items():
    for cols, rt, rcols in t['fks']:
        if rt not in tables: err(f'{tb}: FK to unknown table {rt}'); continue
        for c, rc in zip(cols, rcols):
            if c not in t['cols']: err(f'{tb}: FK column {c} does not exist'); continue
            if rc not in tables[rt]['cols']: err(f'{tb}: FK references missing column {rt}.{rc}'); continue
            a, b = t['cols'][c], tables[rt]['cols'][rc]
            if (a['base'], a['uns']) != (b['base'], b['uns']): err(f'{tb}.{c} ({a["base"]}{" unsigned" if a["uns"] else ""}) vs {rt}.{rc} ({b["base"]}{" unsigned" if b["uns"] else ""}): FK column types must match exactly (error 3780/1215)')
            if a['base'] in ('varchar', 'char') and a['arg'] != b['arg']: err(f'{tb}.{c}: FK string length differs from {rt}.{rc}')
        if rcols != ['id'] and not any(k in ('primary', 'unique') and ix == rcols for k, n, ix in tables[rt]['idx']): wrn(f'{tb}: FK targets non-PK column {rt}.{rcols} - it must be indexed')
# 3b every tenant table needs at least one index (explicit, unique, or built by InnoDB for a FOREIGN KEY) - a table queried by institution_id with none is a full scan for every tenant
for tb, t_ in tables.items():
    if 'institution_id' in t_['cols'] and not t_['idx'] and not t_['fks']: err(f'{tb}: has institution_id but no index and no foreign key - every query on it scans all tenants')
# 4 index sizes
for tb, t in tables.items():
    for kind, n, cols in t['idx']:
        tot = 0
        for c in cols:
            if c not in t['cols']: err(f'{tb}: index {n} uses unknown column {c}'); continue
            ci = t['cols'][c]; b = col_bytes(ci)
            if b is None: err(f'{tb}: index {n} includes {ci["base"].upper()} column {c} (needs a prefix length)'); continue
            tot += b
        if tot > 3072: err(f'{tb}: index {n} is {tot} bytes (> 3072 InnoDB limit with utf8mb4)')
        elif tot > 2000: wrn(f'{tb}: index {n} is {tot} bytes (close to the 3072 limit)')
    nidx = len(t['idx']) + len(t['fks'])
    if nidx > 60: wrn(f'{tb}: {nidx} indexes+FKs (limit 64)')
# 5 row size (the 65,535-byte limit counts every VARCHAR at its maximum)
for tb, t in tables.items():
    tot = 0
    for cn, c in t['cols'].items():
        b = col_bytes(c)
        if b: tot += b
        elif c['base'] in ('text', 'json'): tot += 10
    if tot > 65535: err(f'{tb}: declared row size {tot} > 65535')
    elif tot > 20000: wrn(f'{tb}: declared row size {tot} bytes (InnoDB may refuse rows if all VARCHARs are filled)')

print(f'{len(tables)} tables, {sum(len(t["cols"]) for t in tables.values())} columns, {sum(len(t["idx"]) for t in tables.values())} indexes, {sum(len(t["fks"]) for t in tables.values())} foreign keys inspected')
for w in WRN: print('WARN ', w)
for e in ERR: print('ERROR', e)
print(f'{len(ERR)} error(s), {len(WRN)} warning(s)')
sys.exit(1 if ERR else 0)
