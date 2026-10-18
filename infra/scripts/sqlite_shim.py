#!/usr/bin/env python3
"""
infra/scripts/sqlite_shim.py - a tiny stand-in for the `mysql` command-line client, backed by SQLite.
Purpose: dry-run infra/scripts/mysql-smoke.sh WITHOUT MySQL, to prove the script's own mechanics (loops, expectations, exit codes) work.
It translates the MySQL-only parts of schema.sql (ENUM, UNSIGNED, inline KEY ...) crudely. It is NOT MySQL and proves nothing about MySQL.
Supports only what the smoke script uses: `-e SQL`, SQL on stdin, a database name, and ignores the usual connection/charset/init flags.
"""
import sys, os, re, sqlite3
args = sys.argv[1:]; sql = None; db = None; i = 0
while i < len(args):
    a = args[i]
    if a == '-e': sql = args[i + 1]; i += 2; continue
    if a.startswith('-') or a.startswith('--'): i += 1; continue
    db = a; i += 1
path = lambda name: os.path.join(os.environ.get('SHIM_DIR', '/tmp'), f'lms_shim_{name}.db')
def fail(msg): sys.stderr.write('ERROR: ' + msg + '\n'); sys.exit(1)
def translate(s):
    s = re.sub(r'--[^\n]*', '', s); s = re.sub(r"ENUM\([^)]*\)", "TEXT", s)
    s = re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", s); s = re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b", r"\1", s)
    s = re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b", "", s); s = re.sub(r"\bUNIQUE KEY\s+\w+\s*\(", 'UNIQUE (', s); s = re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)", '', s)
    return s
if sql is not None and re.match(r'\s*DROP DATABASE', sql, re.I):
    name = re.search(r'DROP DATABASE IF EXISTS `?(\w+)`?', sql, re.I).group(1)
    if os.path.exists(path(name)): os.remove(path(name))
    sqlite3.connect(path(name)).close(); sys.exit(0)
if db is None: fail('no database selected')
con = sqlite3.connect(path(db)); con.execute('PRAGMA foreign_keys=ON')
try:
    if sql is None:                                   # schema on stdin
        for st in [x.strip() for x in re.sub(r'ALTER TABLE\s+\w+\s+ADD CONSTRAINT[^;]*;','',translate(sys.stdin.read())).split(';') if x.strip()]: con.execute(st)
        con.commit(); sys.exit(0)
    m = re.search(r"information_schema\.tables", sql, re.I)
    if m:
        print(con.execute("select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'").fetchone()[0]); sys.exit(0)
    last = []
    for st in [x.strip() for x in re.sub(r'ALTER TABLE\s+\w+\s+ADD CONSTRAINT[^;]*;','',sql).split(';') if x.strip()]:
        if re.match(r'SET\s+FOREIGN_KEY_CHECKS\s*=\s*0', st, re.I): con.execute('PRAGMA foreign_keys=OFF'); continue
        if re.match(r'SET\s', st, re.I): continue                       # session settings have no SQLite meaning
        if re.match(r'ANALYZE\s+TABLE', st, re.I): st = 'ANALYZE'
        cur = con.execute(st); last = cur.fetchall() if cur.description else []
    for row in last: print('\t'.join('NULL' if v is None else str(v) for v in row))
    con.commit()
except sqlite3.Error as e:
    fail(str(e))
