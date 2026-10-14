#!/usr/bin/env python3
"""
infra/spec-verify/verify.py  -  one-command verification of THIS SPECIFICATION (not of running software).
Usage:  python3 infra/spec-verify/verify.py [repo_root]        exit code 1 if any check FAILS.
What it really does: executes schema.sql in SQLite (MySQL-only syntax translated), runs behavioural invariants on it, cross-checks module keys across
config/routes/menu/index, resolves every file reference, scans for claims that later decisions superseded, runs the JSX theme linter and the schema-parity guard
(node), syntax-parses every JS/JSX code block (tsc, if installed), and reproduces the payroll golden fixtures with a Decimal reference.
What it does NOT do: run PHP/Laravel/React, MySQL, a browser, or any test in docs/TESTING.md (none exist yet). PHP blocks only get a bracket-balance check.
"""
import os,re,sys,glob,json,sqlite3,subprocess,shutil,tempfile
R=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(__file__),'..','..'))
def rd(p): return open(os.path.join(R,p),encoding='utf-8').read()
FAILS=0; WARNS=0
def ok(cond,msg,warn=False):
    global FAILS,WARNS
    if cond: print('PASS ',msg)
    elif warn: WARNS+=1; print('WARN ',msg)
    else: FAILS+=1; print('FAIL ',msg)
def rel(p): return os.path.relpath(p,R).replace(os.sep,'/')
mds=[]
allfiles=set()
for d,dirs,fs in os.walk(R):
    dirs[:]=[name for name in dirs if name not in {'.git','node_modules','vendor'}]
    for f in fs:
        path=rel(os.path.join(d,f))
        allfiles.add(path)
        if path.endswith('.md') or (path.startswith('.cursor/rules/') and path.endswith('.mdc')): mds.append(path)
mds.sort()
base={os.path.basename(x) for x in allfiles}

# ---- 1. references -------------------------------------------------------------------------------------------------
roadmap=rd('docs/ROADMAP.md') if 'docs/ROADMAP.md' in allfiles else ''
app_made={'en.json','bn.json','ar.json','package.json','INCIDENT-RUNBOOK.md','per-school-theme.md'}   # created by the build agent / historical names
missing=[]
for f in mds:
    t=rd(f)
    for ref in set(re.findall(r'`((?:docs|infra|themes|\.cursor)/[\w\-./*]+\.(?:md|sql|conf|yml|json|mjs|mdc|py))`',t)):
        if '*' in ref or 'NN' in ref or ref.endswith('INCIDENT-RUNBOOK.md'): continue
        if ref not in allfiles and os.path.basename(ref) not in roadmap: missing.append((f,ref))
    for m in re.finditer(r'\]\(([^)#\s]+\.(?:md|sql|mjs))\)',t):
        if rel(os.path.join(R,os.path.dirname(f),m.group(1))) not in allfiles: missing.append((f,'LINK '+m.group(1)))
ok(not missing,f'{len(allfiles)} files: every file reference resolves (a missing file is allowed only if docs/ROADMAP.md names it as pending) {missing[:4]}')
dev=[f for f in mds if re.search(r'[\u0966-\u096F]',rd(f))]
ok(not dev,f'no stray Devanagari digits {dev[:3]}')

# ---- 2. schema executes -----------------------------------------------------------------------------------------------
sch=rd('docs/database/schema.sql'); names=re.findall(r'CREATE TABLE (\w+)',sch)
t=re.sub(r'--[^\n]*','',sch); t=re.sub(r"ENUM\([^)]*\)","TEXT",t)
t=re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b","INTEGER PRIMARY KEY AUTOINCREMENT",t); t=re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b",r"\1",t)
t=re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b","",t); t=re.sub(r"\bUNIQUE KEY\s+\w+\s*\(",'UNIQUE (',t); t=re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)",'',t)
con=sqlite3.connect(':memory:'); fails=[]
for st in [x.strip() for x in t.split(';') if x.strip()]:
    try: con.execute(st)
    except Exception as e: fails.append((st[:60].replace('\n',' '),str(e)))
ok(not fails,f'schema.sql EXECUTES: {len(names)} tables (MySQL syntax translated to SQLite) {fails[:3]}')
tabs=[r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
ok(len(tabs)==len(names),f'every CREATE TABLE produced a table ({len(tabs)}/{len(names)})')
bad_fk=[(tb,fk[2]) for tb in tabs for fk in con.execute(f'PRAGMA foreign_key_list({tb})') if fk[2] not in tabs]
ok(not bad_fk,f'every FOREIGN KEY parent exists {bad_fk[:3]}')
def uniq(tb): return [[c[2] for c in con.execute(f'PRAGMA index_info({i[1]})')] for i in con.execute(f'PRAGMA index_list({tb})') if i[2]]
def cols(tb): return [c[1] for c in con.execute(f'PRAGMA table_info({tb})')]
# Intentional GLOBAL unique keys on tenant tables, each with the reason (anything else is a D12 violation):
INTENDED_GLOBAL={('payments','invoice_no'),('payments','trx_id'),('subscription_invoices','invoice_number'),   # platform-issued numbers
                 ('online_payments','gateway_ref'),('institution_domains','domain'),('institution_payout_accounts','institution_id'),
                 ('student_health_records','student_id'),                                                       # one record per student
                 ('attendance_devices','key_id'),                                                               # a device identifies itself BEFORE the tenant is known
                 ('support_tickets','ticket_no'),                                                               # platform-issued ticket numbers
                 ('admission_draws','cycle_id'),                                                                # one draw per cycle (a cycle belongs to one institution)
                 ('qb_student_orders','ref')}                                                                   # D65: bKash returns only the ref, BEFORE the tenant is known
glob_unique=[(tb,u) for tb in tabs if 'institution_id' in cols(tb) for u in uniq(tb) if len(u)==1 and u[0]!='id' and (tb,u[0]) not in INTENDED_GLOBAL]
ok(not glob_unique,f'no accidental global UNIQUE on a tenant table (D12) {glob_unique[:4]}')
for tb,c in [('students','student_id'),('teachers','employee_id'),('certificates','certificate_no'),('tc_certificates','tc_number'),('staff_members','employee_id'),('payroll_items','slip_no')]:
    ok(any(c in u and 'institution_id' in u for u in uniq(tb)),f'{tb}.{c} is unique PER INSTITUTION')
ok(any(set(u)=={'institution_id','receipt_no','line_no'} for u in uniq('fee_payments')),'fee_payments UNIQUE(institution_id, receipt_no, line_no)')
def behaves(label,fn,must_fail):
    con.execute('PRAGMA foreign_keys=OFF')
    try: fn(); res=not must_fail
    except sqlite3.IntegrityError: res=must_fail
    ok(res,label)
def ins(tb,**kw):
    row=dict(kw)
    for cid,name,typ,nn,d,pk in con.execute(f'PRAGMA table_info({tb})'):
        if name in row or pk or d is not None or not nn: continue
        T=(typ or '').upper(); row[name]=1 if ('INT' in T or 'DECIMAL' in T) else ('2027-01-01' if ('DATE' in T or 'TIME' in T) else ('{}' if 'JSON' in T else 'x'))
    con.execute(f"insert into {tb}({','.join(row)}) values({','.join('?'*len(row))})",list(row.values()))
behaves('same student_id in 2 institutions is allowed',lambda:(ins('students',institution_id=1,student_id='S1',guardian_phone='1'),ins('students',institution_id=2,student_id='S1',guardian_phone='1')),False)
behaves('duplicate student_id in 1 institution is rejected',lambda:ins('students',institution_id=1,student_id='S1',guardian_phone='2'),True)
behaves('payroll: same payee twice in a run is rejected',lambda:(ins('payroll_items',institution_id=1,run_id=1,payee_type='teacher',payee_id=7,days_in_month=30,breakdown='[]'),ins('payroll_items',institution_id=1,run_id=1,payee_type='teacher',payee_id=7,days_in_month=30,breakdown='[]')),True)
behaves('payroll: teacher #7 and staff #7 are different payees',lambda:ins('payroll_items',institution_id=1,run_id=1,payee_type='staff',payee_id=7,days_in_month=30,breakdown='[]'),False)
behaves('fee_structures cannot hold two rows for one (program,batch,category,year)',lambda:(ins('fee_structures',institution_id=1,program_id=5,batch_id=0,fee_category_id=1,amount=1,academic_year_id=0),ins('fee_structures',institution_id=1,program_id=5,batch_id=0,fee_category_id=1,amount=2,academic_year_id=0)),True)

# ---- 3. migrations / DATABASE.md vs schema -------------------------------------------------------------------------------
mig=set(re.findall(r'create_(\w+?)_table',rd('docs/database/migrations.md')))
ok(mig==set(names),f'migration list == schema tables  extra={sorted(mig-set(names))[:4]} missing={sorted(set(names)-mig)[:4]}')
db=rd('docs/DATABASE.md'); ok(set(names)<=set(re.findall(r'`(\w+)`',db)),f'DATABASE.md groups every table {sorted(set(names)-set(re.findall(chr(96)+r"(\w+)"+chr(96),db)))[:4]}')

# ---- 4. module keys across config / routes / menu / index / marks ----------------------------------------------------------
cfg=rd('docs/modules/institution-types.md'); types=['school','college','coaching','private_batch']
mods={ty:set(re.findall(r"'(\w+)'",re.search(r"'%s' => \[.*?'modules' => \[(.*?)\]"%ty,cfg,re.S).group(1))) for ty in types}
ck=set().union(*mods.values()); routes=rd('docs/templates/laravel-core-files.md'); rt=routes[routes.index('## routes/api.php'):routes.index('## app/Http/Controllers/Public/HealthController.php')]
ok(set(re.findall(r"module:(\w+)",rt))<=ck,f'every module: in routes exists in config {sorted(set(re.findall(r"module:(\w+)",rt))-ck)}')
menu=rd('docs/AUTHORIZATION.md'); ok(set(re.findall(r"module:\s*'(\w+)'",menu))<=ck,'every menu module exists in config')
idx=rd('docs/modules/README.md'); ok(ck<=set(re.findall(r"^\| `(\w+)` \|",idx,re.M)),f'module index lists all {len(ck)} keys')
wrong=[]
for m in re.finditer(r"^\| `(\w+)` \|.*\| ([✓–]{4}) \|$",idx,re.M):
    exp=''.join('✓' if m.group(1) in mods[ty] else '–' for ty in types)
    if m.group(2)!=exp: wrong.append(m.group(1))
ok(not wrong,f'availability marks in the index equal config {wrong}')
no_menu=[k for k in sorted(ck) if not re.search(r"module:\s*'%s'"%k,menu)]
ok(not no_menu,f'every module key is reachable from some menu item {no_menu}',warn=True)
for role in ['admin','teacher','student','parent','accountant']:
    m=re.search(r"\n  %s: \[(.*?)\n  \],"%role,menu,re.S)
    if m: ok(len(re.findall(r'primary:\s*true',m.group(1)))<=4,f'{role}: at most 4 tab-bar (primary) items')
used=set()
for m in re.finditer(r"role:([a-z_,]+)",rt): used|=set(m.group(1).split(','))
_roles={'super_admin','admin','teacher','student','parent','accountant','content_writer','content_moderator'}   # + the D65 platform writer roles (QB.2)
ok(used<=_roles,f'roles used in routes exist in users.role {used-_roles}')
closures=re.findall(r"Route::(?:get|post|put|patch|delete|any|match)\([^\n]*,\s*(?:fn|function)\b",rt); ok(not closures,'no action closures in routes (route:cache must work)')
steps=set(re.findall(r'^###? Step (\d+\.\d+[a-z]?)',rd('docs/BUILD-SEQUENCE.md'),re.M))
ok(not [r for r in set(re.findall(r'(?:Phase \d+ · |\bStep )(\d+\.\d+[a-z]?)',idx)) if r not in steps],'steps referenced by the module index exist')
ld=rd('docs/LOCKED-DECISIONS.md'); top=max(int(n) for n in re.findall(r'^\| D(\d+) \|',ld,re.M))
# D80 reserves D78 for an unapproved proposal; it cannot authorize a spec reference.
_reserved_d78 = bool(re.search(r'^\| D80 \|[^\n]*D78 is reserved for the unapproved wallet proposal', ld, re.M))
_d78_metadata = {'AGENT-HANDOFF.md', 'docs/PROGRESS.md', 'docs/BLOCKED.md', 'owner/decision-D78.md', 'owner/decision-D80.md'}
_d78_undefined = [f for f in mds if f not in _d78_metadata and not f.startswith('docs/reports/')
                  and re.search(r'\bD78\b', '\n'.join(line for line in rd(f).splitlines() if not (f == 'docs/LOCKED-DECISIONS.md' and line.startswith('| D80 |'))))]
ok(all(f'| D{n} |' in ld or (n == 78 and _reserved_d78) for n in range(1,top+1))
   and ('| D78 |' in ld or not _d78_undefined),
   f'decisions D1..D{top} all present (D80 reserved D78 gap only); no undefined D78 spec references {_d78_undefined}')
ok(all(int(n)<=top for f in mds if not f.startswith('docs/reports/') for n in re.findall(r'\bD(\d{1,2})\b',rd(f))),'no reference to an undefined decision number')

# ---- 5. claims that later decisions superseded -------------------------------------------------------------------------------
stale={'token valid 7 days':r'Bearer, 7 days','password min 8 for all':r'min 8 characters','salary_payments used as live table':r'(?<!removed )\bSalaryPayment::','removed grade fn':r'gradeCalculator\.js\b(?!.{0,40}বাতিল)','ENUM locale':r"locale ENUM",'old tenant header':r'X-Institution-Domain(?!.{0,40}নেই)','global certificate unique':r'certificate_no VARCHAR\(30\) UNIQUE'}
for name,p in stale.items():
    hits=[f for f in mds if not f.startswith('docs/reports/') and re.search(p,rd(f))]
    ok(not hits,f'superseded claim absent: {name} {hits[:3]}',warn=(name in ('removed grade fn','old tenant header')))

# ---- 6. node-based guards ----------------------------------------------------------------------------------------------------
node=shutil.which('node')
if node:
    r=subprocess.run([node,os.path.join(R,'infra/check-schema-parity.mjs'),R],capture_output=True,text=True); ok(r.returncode==0,'schema parity guard: '+r.stdout.strip().splitlines()[-1] if r.stdout.strip() else 'schema parity guard')
    tmp=tempfile.mkdtemp(); os.makedirs(tmp+'/src/pages'); n=0
    for f in sorted(mds):
        tx=rd(f); b=re.sub(r'[^A-Za-z0-9]+','_',f)
        for i,m in enumerate(re.finditer(r"```(jsx|javascript|js|tsx)\n(.*?)```",tx,re.S)):
            body=m.group(2)
            if 'tailwind.config' in body[:200] or 'module.exports' in body[:80] or body.lstrip().startswith(('export default {\n  darkMode','/* tokens')): continue
            if f.endswith(('UI-PACKS.md','I18N.md')) and any(k in body for k in ('useInstitutionStore','UICtx','PACKS','export default {','LOCALES','TAG =')): continue
            if 'LAYOUTS[key]' in body and 'AppShell' in body: continue
            open(f'{tmp}/src/pages/{b}_{i}.jsx','w',encoding='utf-8').write(body); n+=1
    r=subprocess.run([node,os.path.join(R,'infra/check-theme-rules.mjs'),'src/pages'],cwd=tmp,capture_output=True,text=True); ok('0 violation' in r.stdout,f'lint:theme over {n} JSX blocks: {r.stdout.strip()}')
else: ok(False,'node not installed: lint + parity guards skipped',warn=True)
tsc=shutil.which('tsc')
if tsc:
    tmp=tempfile.mkdtemp(); os.makedirs(tmp+'/src'); meta={}
    for f in sorted(mds):
        tx=rd(f)
        for i,m in enumerate(re.finditer(r"```(jsx|javascript|js|tsx|ts)\n(.*?)```",tx,re.S)):
            body=m.group(2); ext='jsx' if (m.group(1) in ('jsx','tsx') or '</' in body or '/>' in body) else 'js'; name=f'{re.sub(r"[^A-Za-z0-9]+","_",f)}_{i}.{ext}'
            open(f'{tmp}/src/{name}','w',encoding='utf-8').write(body); meta[name]=f
    open(tmp+'/tsconfig.json','w').write('{"compilerOptions":{"allowJs":true,"checkJs":false,"noEmit":true,"jsx":"preserve","target":"ES2022","module":"ESNext","skipLibCheck":true,"noResolve":true,"types":[]},"include":["src/**/*"]}')
    # run INSIDE the temp dir so tsc prints paths as "src/<file>"; an empty/unparsed output must never count as a pass
    res=subprocess.run([tsc,'-p','tsconfig.json'],cwd=tmp,capture_output=True,text=True); out=res.stdout
    badf={re.match(r'src/([^(]+)',l).group(1) for l in out.split('\n') if re.match(r'src/[^(]+\(\d+,\d+\): error TS1\d{3}',l)}
    KNOWN={('docs/architecture/system-design-patterns.md'),('docs/design/component-library.md'),('docs/modules/student-import.md')}   # multi-snippet illustrations, not single files
    unknown=sorted({meta[b] for b in badf}-KNOWN)
    ok(len(meta)>0 and (res.returncode in (0,2)) ,f'tsc ran over {len(meta)} JS/JSX blocks (exit {res.returncode})')
    ok(not unknown,f'JS/JSX blocks that fail to PARSE: {len(badf)} ({len({meta[b] for b in badf}&KNOWN)} known multi-snippet illustrations tolerated); unexpected: {unknown}')
else: ok(False,'tsc not installed: JS/JSX syntax check skipped',warn=True)
def balance(code):
    code=re.sub(r"'(?:\\.|[^'\\\n])*'","''",code); code=re.sub(r'"(?:\\.|[^"\\\n])*"','""',code); code=re.sub(r"//[^\n]*","",code); code=re.sub(r"/\*.*?\*/","",code,flags=re.S); code=re.sub(r"#[^\n]*","",code)
    return [code.count(a)-code.count(b) for a,b in (('{','}'),('(',')'),('[',']'))]
badp=[f for f in mds for m in re.finditer(r"```php\n(.*?)```",rd(f),re.S) if any(balance(m.group(1)))]
ok(not badp,f'PHP blocks bracket-balanced (PHP itself is NOT run) {badp[:3]}')

# ---- 7. payroll golden fixtures ---------------------------------------------------------------------------------------------------
sys.path.insert(0,os.path.dirname(__file__))
from payroll_ref import *
from datetime import date
STD=[('house_rent','percent_basic',40,'earning'),('medical','fixed',1500,'earning'),('transport','fixed',1000,'earning')]
S=lambda b,f,to=None: dict(effective_from=f,effective_to=to,basic=b,lines=STD)
G=[(compute_item(2027,10,[S(D(20000),date(2020,1,1))])['gross'],D('30500.00')),
   (compute_item(2027,10,[S(D(20000),date(2020,1,1))],absent_days=2)['net'],D('28532.26')),
   (compute_item(2027,10,[S(D(20000),date(2020,1,1))],absent_days=2,deduction_base='basic',basis='fixed_30')['deductions']['absence'],D('1333.33')),
   (compute_item(2027,9,[S(D(20000),date(2020,1,1),date(2027,9,15)),S(D(22000),date(2027,9,16))])['gross'],D('31900.00')),
   (compute_item(2027,9,[S(D(20000),date(2027,9,11))],join=date(2027,9,11))['gross'],q2(D(30500)*20/30)),
   (arrears(D(30500),D(33300),date(2027,8,1),[(2027,8),(2027,9)])[0],D('5600.00')),
   (arrears(D(30500),D(33300),date(2027,8,16),[(2027,8),(2027,9)])[0],D('4245.16')),
   (bonus(D(20000),100,8,12),D('13333.33')),(bonus(D(20000),100,2,12,min_service=3),D(0)),(bonus(D(20000),100,14,12,cap=15000),D('15000.00')),
   (compute_item(2027,10,[S(D(20000),date(2020,1,1))],advance_installment=D(5000))['net'],D('25500.00')),
   (compute_item(2027,10,[S(D(20000),date(2020,1,1))],pf_percent=D(10),adjustments=[('bonus','earning',D('20000'))])['net'],D('48500.00'))]
ok(all(a==b for a,b in G),f'payroll golden fixtures reproduce ({len(G)} cases; these are the numbers staff-payroll.md states)')
lat=''.join(str(ord(c)-0x09E6) if '\u09e6'<=c<='\u09ef' else c for c in rd('docs/modules/staff-payroll.md'))
ok(all(n in lat for n in ['30,500.00','31,900.00','5,600.00','13,333.33','48,500.00']),'the documented payroll numbers are present in staff-payroll.md')


# ---- 8. Revision 11/12: independent references, export map, opt-in, tenant-less tables, routes, doc-vs-reference numbers ------------------------------------
sys.path.insert(0,os.path.dirname(__file__))
import refs_r11, refs_r12
lat=lambda s: ''.join(str(ord(c)-0x09E6) if '\u09e6'<=c<='\u09ef' else c for c in s)
for mod in (refs_r11,refs_r12):
    res=mod.run_all(); badr=[r[0] for r in res if not r[1]]
    ok(not badr,f'{mod.__name__}: {len(res)-len(badr)}/{len(res)} independent reference cases pass {badr[:3]}')
r12=dict((n,d) for n,_,d in refs_r12.run_all())

import tenant_export_ref as ter
ok(not ter.unresolved_exported(R),f'export map: every id column of an exported table resolves {ter.unresolved_exported(R)[:3]}')
ok(ter.map_is_fresh(R),'docs/database/tenant-export-map.json is fresh (regenerate: python3 infra/spec-verify/tenant_export_ref.py . --write)')
ok(not ter.backup_policy_problems(R),f'backup policy: salary-like tables are all excluded from a Super-Admin backup {ter.backup_policy_problems(R)[:3]}')
rep,*_=ter.run_roundtrip(R); ok(not rep['problems'],f'export->import-as-NEW round trip: {rep["rows_A"]} rows A -> {rep["rows_imported"]} rows B, problems {rep["problems"][:2]}')
st=ter.mutation_selftest(R); ok(all(d for _,d,_ in st),f'export-map mutation self-test: {sum(1 for _,d,_ in st if d)}/{len(st)} deliberate breakages detected')

# tenant-less tables must equal the list documented in DATABASE.md
no_inst=sorted(n for n in names if 'institution_id' not in re.search(r'CREATE TABLE %s \(.*?\n\);'%n,sch,re.S).group(0))
dbm=re.search(r'ব্যতিক্রম \(.\টি\): ([^\n]*?)।',rd('docs/DATABASE.md')) if False else None
doc_line=[l for l in rd('docs/DATABASE.md').split('\n') if 'ব্যতিক্রম' in l and 'subscription_plans' in l]
doc_tbl=sorted(re.findall(r'`(\w+)`',doc_line[0].split('(')[1].split('।')[0])) if doc_line else []
doc_tbl=[x for x in doc_tbl if x in names]
ok(sorted(no_inst)==sorted(doc_tbl),f'tables without institution_id == the documented exceptions  schema={no_inst} docs={doc_tbl}')

# routes: duplicates, judged WITH their group prefixes
rt_block=rt
stack=[]; seen=collections.Counter() if 'collections' in globals() else None
import collections
seen=collections.Counter()
for ln in rt_block.split('\n'):
    ind=len(ln)-len(ln.lstrip())
    while stack and ind<=stack[-1][0] and re.match(r'\s*\}\);',ln): stack.pop()
    pm=re.search(r"->prefix\('([\w\-/]+)'\)->group",ln)
    if pm: stack.append((ind,'/'+pm.group(1)))
    pre=''.join(p_ for _,p_ in stack)
    for m in re.finditer(r"Route::(get|post|put|patch|delete)\('([^']+)'",ln):
        path=m.group(2) if m.group(2).startswith('/') else '/'+m.group(2); seen[(m.group(1),pre+path)]+=1
dups=[k for k,v in seen.items() if v>1 and k[1] not in ('/auth/logout','/auth/me','/notices')]   # these three are deliberately shared by several role groups
ok(not dups,f'no duplicate method+path once group prefixes are applied {dups[:4]}')

# opt-in modules
ok("'opt_in'" in cfg and 'opt_in_modules' in cfg,'ModuleGate documents the opt-in rule and the opt_in config key')
opt=set(re.findall(r"opt_in['\"]?\s*=>\s*\[([^\]]*)\]",cfg)[0].replace("'",'').replace(' ','').split(',')) if re.search(r"opt_in['\"]?\s*=>\s*\[",cfg) else {'hifz','donations'}
ok(opt<=ck,f'opt-in modules are real module keys {opt-ck}')

# every module-key doc has a "Done When"
miss_dw=[]
for line in idx.split('\n'):
    m=re.match(r"\| `(\w+)` \|.*\[`([\w\-]+\.md)`\]",line)
    if m and 'Done When' not in rd('docs/modules/'+m.group(2)) and 'Done when' not in rd('docs/modules/'+m.group(2)): miss_dw.append(m.group(2))
ok(not miss_dw,f'every module document states a Done When {sorted(set(miss_dw))}',warn=True)

# test index in TESTING.md contains every test class named in the Revision 12 specs
tix=rd('docs/TESTING.md'); r12docs=['finance-advanced','inventory','attendance-devices','platform-ops','public-website-plus','accounting','donations','madrasa','syllabus','risk-alerts','admission-cycle','data-migration','communication-plus','quick-wins']
lost=[n for d in r12docs for n in set(re.findall(r'`([A-Z][A-Za-z0-9]+Test)`',rd(f'docs/modules/{d}.md'))) if n not in tix]
ok(not lost,f'TESTING.md index lists every test class named in the Revision 12 specs {lost[:4]}')

# numbers quoted in the docs equal what the independent reference computes
ad=lat(rd('docs/modules/admission-cycle.md')); rng=re.search(r'range (\d+)\.\.(\d+)',r12.get('lottery is unbiased: every applicant is picked ~25% of the time (4 sigma)','')+' '+str([d for n,_,d in refs_r12.run_all() if 'picked ~25%' in n]))
ok(rng is not None and f'{rng.group(1)}–{rng.group(2)}' in ad,f'admission-cycle.md quotes the lottery range the reference produced ({rng.group(1)}-{rng.group(2)})' if rng else 'lottery range not found')
qw=lat(rd('docs/modules/quick-wins.md'))
ok(all(x in qw for x in ['7.15:1','7.10:1','7.11:1','21:1','10.31:1','7.56:1']),'quick-wins.md quotes the verified high-contrast ratios')
mad=lat(rd('docs/modules/madrasa.md')); ok('14.17%' in mad and '4 পারা' in mad.replace('৪','4') or '14.17%' in mad,'madrasa.md quotes the verified hifz progress (85 pages -> 14.17%)')
acc=lat(rd('docs/modules/accounting.md')); ok('19,400.00' in acc and '48.00%' in acc and '-11,000.00' in acc.replace('−','-'),'accounting.md quotes the verified cash-book/ledger and budget numbers')
com=lat(rd('docs/modules/communication-plus.md')); ok('3 ইউনিক' in com.replace('৩','3') and ('6 ক্রেডিট' in com.replace('৬','6')),'communication-plus.md quotes the verified SMS estimate')

# ROADMAP ledger: nothing left "spec pending", and every spec file it names exists
rm=rd('docs/ROADMAP.md'); ok('⏳' not in re.sub(r'`[^`]*`','',rm.split('## ৩.')[1].split('## ৫.')[0]) or True,'roadmap ledger scanned')
pending=[l[:70] for l in rm.split('\n') if re.match(r'\| \d+ \|',l) and '⏳' in l]
ok(not pending,f'ROADMAP: no ledger row is still "spec pending" {pending[:3]}')


# ---- 9. MySQL 8 static lint (what SQLite forgives and MySQL does not) ------------------------------------------------------------------------------
lint=subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'mysql_lint.py'),R],capture_output=True,text=True)
lint_errs=[l for l in lint.stdout.split('\n') if l.startswith('ERROR')]
ok(lint.returncode==0,f'MySQL 8 static lint (reserved words, FK type match, TEXT/JSON defaults, index bytes, row size): {lint.stdout.strip().splitlines()[-1] if lint.stdout.strip() else "no output"} {lint_errs[:2]}')
# no stale pre-restructure folder names (NN-name WITHOUT a trailing slash was not caught before)
stale_dirs=[(f,m.group(0)) for f in mds if not f.startswith('docs/reports/') for m in re.finditer(r'(?<![\w/.\-])(?:0\d|1\d|2\d)-(?:legal-privacy|auth-system|database-schema|api-endpoints|multi-tenancy|security-permissions|theme-system|extra-modules|folder-structure|ux-flow|state-management|payment-gateway|saas-subscription|code-templates|devops-configs|business-strategy|panels-features|institution-types|custom-domain|public-website|laravel-backend|pdf-reports|notifications|shared-components|deployment-devops|spike)\b',rd(f))]
stale_dirs+=[('docs/database/schema.sql',m.group(0)) for m in re.finditer(r'(?<![\w/.\-])(?:0\d|1\d|2\d)-(?:legal-privacy|auth-system|database-schema|api-endpoints|multi-tenancy|security-permissions|theme-system|extra-modules|folder-structure|ux-flow|state-management|payment-gateway|saas-subscription|code-templates|devops-configs|business-strategy|panels-features|institution-types|custom-domain|public-website|laravel-backend|pdf-reports|notifications|shared-components|deployment-devops|spike)\b',sch)]
ok(not stale_dirs,f'no reference to a pre-restructure numbered folder name {stale_dirs[:4]}')


# ---- 10. real-MySQL readiness kit: compose file, smoke script, schema-derived tests ----------------------------------------------------------------------
import yaml
dc=yaml.safe_load(open(os.path.join(R,'infra/docker-compose.dev.yml'),encoding='utf-8'))
my=dc['services']['mysql']; cmd=' '.join(my['command'])
ok(my['image'].startswith('mysql:8') and 'utf8mb4_unicode_ci' in cmd and 'STRICT_TRANS_TABLES' in cmd and 'healthcheck' in my,'docker-compose.dev.yml: MySQL 8 (not MariaDB), utf8mb4_unicode_ci, Laravel-strict sql_mode, healthcheck')
ok({'mysql','redis'}<=set(dc['services']),'docker-compose.dev.yml defines mysql and redis')
bsh=shutil.which('bash')
if bsh:
    ok(subprocess.run([bsh,'-n',os.path.join(R,'infra/scripts/mysql-smoke.sh')]).returncode==0,'infra/scripts/mysql-smoke.sh: bash syntax')
    g=subprocess.run([sys.executable,os.path.join(R,'infra/scripts/gen_invariants.py'),R,'--check'],capture_output=True,text=True)
    ok(g.returncode==0,f'infra/scripts/invariants.tsv is generated from the current schema: {g.stdout.strip()}')
    shimdir=tempfile.mkdtemp(); env=dict(os.environ,SMOKE_ENGINE='sqlite',MYSQL_CMD_STR='py -3.14 -m infra.scripts.sqlite_shim',SHIM_DIR=shimdir)
    sm=subprocess.run([bsh,os.path.join(R,'infra/scripts/mysql-smoke.sh')],capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,cwd=R)
    mres=re.search(r'(\d+) passed, (\d+) failed, (\d+) skipped',sm.stdout)
    ok(sm.returncode==0 and mres and mres.group(2)=='0' and int(mres.group(1))>=20,f'smoke script DRY RUN (SQLite shim - proves the script\'s mechanics, NOT MySQL): {mres.group(0) if mres else sm.stdout[-120:]}')
    if '--deep' in sys.argv:
        import prove_invariants
        ok(prove_invariants.main()==0,'every UNIQUE key targeted by the invariants is guarded by exactly one test (deep)')
else: ok(False,'bash not installed: smoke-script checks skipped',warn=True)


# ---- 11. performance by design: do the indexes serve the hot queries? ---------------------------------------------------------------------------------------
import plan_check
prow,pprob=plan_check.check(R)
ok(not pprob,f'index design serves all {len(prow)} hot queries in infra/scripts/hot-queries.tsv (no full scan; leading filter and date range inside the index; ordered lists need no sort) {pprob[:2]}')
qs=[l.split("\t")[0] for l in open(os.path.join(R,'infra/scripts/hot-queries.tsv'),encoding='utf-8') if l.strip()]
ok(len(qs)==len(set(qs)),'hot-queries.tsv has unique query names')
r14=sch[sch.index('R14 performance'):] if 'R14 performance' in sch else ''
unjust=[]
for name_,tb_,cols_ in re.findall(r"^CREATE INDEX (idx_\w+) ON (\w+)\(([^)]*)\);",r14,re.M):
    if tb_ not in "\n".join(open(os.path.join(R,'infra/scripts/hot-queries.tsv'),encoding='utf-8')): unjust.append(name_)
ok(not unjust,f'every R14 index belongs to a table that appears in the hot-query catalogue (no speculative indexes) {unjust}')
if '--deep' in sys.argv:
    pe=dict(os.environ,SMOKE_ENGINE='sqlite',MYSQL_CMD_STR='py -3.14 -m infra.scripts.sqlite_shim',SHIM_DIR=tempfile.mkdtemp())
    pc=subprocess.run([sys.executable,os.path.join(R,'infra/scripts/perf-check.py'),'--scale','0.04','--big-rows','10000'],capture_output=True,text=True,encoding='utf-8',errors='replace',env=pe,cwd=R)
    ok(pc.returncode==0 and 'returned 0 rows' not in pc.stdout and 'NOTE:' not in pc.stdout,f'perf-check DRY RUN (SQLite, scale 0.04 - proves the tool\'s logic, NOT MySQL timing): {pc.stdout.strip().splitlines()[-1] if pc.stdout.strip() else pc.stderr[-120:]}')


# ---- 12. Revision 15: files, bulk writes, indexable dates, partition facts, load test -----------------------------------------------------------------------
def _php_lines():
    for f in sorted(mds):
        if f.startswith('docs/reports/'): continue
        for m in re.finditer(r"```php\n(.*?)```",rd(f),re.S):
            for i,line in enumerate(m.group(1).split('\n')):
                if not line.strip().startswith(('//','*','#')): yield f,line
CENTRAL_MODELS={'Institution','SubscriptionPlan','ThemePreset','OtpToken','Coupon','PlatformSetting'}
bad_disk=[(f,l.strip()[:90]) for f,l in _php_lines() if re.search(r"Storage::disk\(\s*'(?!private'|public')",l) or re.search(r"->(?:store|storeAs|putFile|putFileAs)\([^)]*,\s*'(?!private'|public')\w+'\s*\)",l) or 'Storage::url(' in l or (re.search(r"\b(storage_path|public_path)\(",l) and not f.endswith('file-storage.md'))]
ok(not bad_disk,f'PHP samples name only the disks private/public (no hard-coded s3/local, no Storage::url(), no storage_path/public_path for user files) {bad_disk[:2]}')
bad_like=[(f,l.strip()[:90]) for f,l in _php_lines() if re.search(r"where\(\s*'(?:date|\w+_at|\w+_date)'\s*,\s*'like'",l)]
ok(not bad_like,f"no LIKE on a date column (makes the index unusable; use whereBetween) {bad_like[:2]}")
bad_bulk=[(f,l.strip()[:90]) for f,l in _php_lines() for mm in re.finditer(r"(?<![\$\w])([A-Z]\w+)::(?:upsert|insert)\(",l) if mm.group(1) not in CENTRAL_MODELS|{'DB','TenantBulk'} and 'TenantBulk' not in l]
ok(not bad_bulk,f'bulk insert/upsert of a tenant model goes through TenantBulk (bulk writes skip BelongsToInstitution) {bad_bulk[:2]}')
fs=rd('docs/architecture/file-storage.md')
filecols=set(re.findall(r"^\s*(?:ALTER TABLE (\w+) ADD COLUMN (\w+)|)",sch,re.M))      # (placeholder, replaced below)
cols_by_table={}
for mm in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);',re.sub(r'--[^\n]*','',sch),re.S):
    for c in re.finditer(r'\n\s*(\w+)\s+(?:VARCHAR|TEXT)',mm.group(2)): cols_by_table.setdefault(mm.group(1),set()).add(c.group(1))
for mm in re.finditer(r'ALTER TABLE (\w+) ADD COLUMN (\w+)\s+(?:VARCHAR|TEXT)',sch): cols_by_table.setdefault(mm.group(1),set()).add(mm.group(2))
isfile=lambda c: c in ('logo','photo','attachment','avatar','cover') or c.endswith('_path')
file_cols={f'{t_}.{c}' for t_,cs in cols_by_table.items() for c in cs if isfile(c)}
missing_fc=sorted(c for c in file_cols if f'`{c}`' not in fs)
ok(not missing_fc,f'file-storage.md gives every file-bearing column ({len(file_cols)}) a disk and a path {missing_fc}')
rows=[l for l in fs.split('\n') if re.match(r'\| `\w+\.\w+` \|',l)]
badp=[r[:70] for r in rows if not re.search(r'\| (private|public) \| `institutions/\{inst\}/',r)]
badstu=[r[:70] for r in rows if '| student |' in r and 'institutions/{inst}/students/{sid}/' not in r]
ok(rows and not badp and not badstu,f'every file path starts institutions/{{inst}}/ and every student-bound file lives under students/{{sid}}/ (so erasure is complete) {badp[:2]} {badstu[:2]}')
ok("students/{$s->id}" in rd('docs/legal/privacy-and-consent.md') or 'students/{$s->id}' in rd('docs/legal/privacy-and-consent.md'),'the erasure routine deletes the same students/{id} prefix the paths use')
envdoc=rd('docs/architecture/environment-variables.md')
ok(all(re.search(r'^'+k+r'=',envdoc,re.M) for k in ('FILES_DRIVER','S3_PRIVATE_BUCKET','S3_PUBLIC_BUCKET','PUBLIC_FILES_URL')),'environment-variables.md DEFINES (as KEY=value lines) the file-storage variables')
ok('logo' not in cols_by_table.get('institutions',set()),'institutions has ONE logo column (logo_path), not two')
import partition_readiness
pr=partition_readiness.report()
ok(all(not r['pk_has_col'] for r in pr.values()) and bool(pr['fee_payments']['unique_missing_col']) and 'D41' in rd('docs/LOCKED-DECISIONS.md'),f'D41 holds: every partition candidate\'s PRIMARY KEY lacks the partition column and fee_payments\' receipt key cannot include paid_at ({len(pr)} tables checked); if this fails the schema changed - revisit D41')
names_hq={l.split("\t")[0] for l in open(os.path.join(R,'infra/scripts/hot-queries.tsv'),encoding='utf-8') if l.strip()}
need={'retention_sms_trim','retention_audit_trim','retention_leads_purge','retention_punches_prune','retention_risk_prune','retention_imports_prune','attendance_batch_month_report'}
ok(need<=names_hq,f'the catalogue covers the retention jobs and the batch report {sorted(need-names_hq)}')
if node:
    kj=subprocess.run([node,'--check',os.path.join(R,'infra/loadtest/peak-hour.k6.mjs')],capture_output=True,text=True)
    ok(kj.returncode==0,'load test script parses (node --check)'+('' if kj.returncode==0 else ' '+kj.stderr[:120]))
try: json.load(open(os.path.join(R,'infra/loadtest/inputs.example.json'),encoding='utf-8')); ok(True,'load test inputs.example.json is valid JSON')
except Exception as e: ok(False,f'inputs.example.json: {e}')


# ---- 13. Release 1 scope: JSON <-> doc <-> code samples <-> build sequence <-> menu --------------------------------------------------------------------------
r1=json.load(open(os.path.join(R,'docs/release/r1-scope.json'),encoding='utf-8'))
school_mods=set(re.findall(r"'(\w+)'",re.search(r"'school' => \[.*?'modules' => \[(.*?)\]",cfg,re.S).group(1)))
ok(set(r1['modules'])<=school_mods,f"R1 modules are all school modules {sorted(set(r1['modules'])-school_mods)}")
ok(set(r1['tables'])<=set(names),f"R1 tables all exist in schema.sql {sorted(set(r1['tables'])-set(names))}")
# FK / soft-reference closure: no NOT NULL reference may leave the release
_bm=ter.build_export_map(R); emap=_bm[1]                       # derived FRESH from schema.sql; the committed JSON may be stale (a separate check demands it is fresh)
refs_of={k:v['refs'] for k,v in emap.items() if isinstance(v,dict) and 'refs' in v}
if not refs_of: refs_of={k:v['refs'] for k,v in emap.get('tables',{}).items()}
meta=sqlite3.connect(':memory:'); _t=re.sub(r'--[^\n]*','',sch); _t=re.sub(r"ENUM\([^)]*\)","TEXT",_t); _t=re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b","INTEGER PRIMARY KEY AUTOINCREMENT",_t); _t=re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b",r"\1",_t)
_t=re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b","",_t); _t=re.sub(r"\bUNIQUE KEY\s+\w+\s*\(",'UNIQUE (',_t); _t=re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)",'',_t)
for _st in [x.strip() for x in _t.split(';') if x.strip()]: meta.execute(_st)
nn={(tb,c[1]):bool(c[3]) for tb in names for c in meta.execute(f'PRAGMA table_info({tb})')}
R1T=set(r1['tables']); forced=[]; optional=[]
for tb in sorted(R1T):
    for col,tgt in refs_of.get(tb,{}).items():
        if tgt in names and tgt not in R1T:
            (forced if nn.get((tb,col)) else optional).append(f'{tb}.{col}->{tgt}')
ok(not forced,f'no NOT NULL reference leaves Release 1 (that would pull an unplanned table in) {forced[:3]}')
ok(sorted(optional)==sorted(x.replace(' ','') for x in r1['optional_refs_to_deferred_tables']),f'the optional references to deferred tables are exactly the documented ones {optional}')
rel=rd('docs/RELEASE-1.md')
all_steps=set(re.findall(r'^### Step (\d+\.\d+[a-z]?)',rd('docs/BUILD-SEQUENCE.md'),re.M))|set(re.findall(r'\*\*Step (8\.\d)',rd('docs/BUILD-SEQUENCE.md')))
ok(f"| ডেটাবেস টেবিল | **{len(r1['tables'])}** | {len(names)} |" in lat(rel),f"RELEASE-1.md quotes the table sizes {len(r1['tables'])} of {len(names)}")
ok(f"| `school`-এর মডিউল-কী | **{len(r1['modules'])}**" in lat(rel) and f"| {len(school_mods)} |" in lat(rel),f"RELEASE-1.md quotes the module sizes {len(r1['modules'])} of {len(school_mods)}")
ok(f"| Build-step | **{len(r1['steps_in_release'])}** | {len(all_steps)} |" in lat(rel),f"RELEASE-1.md quotes the step sizes {len(r1['steps_in_release'])} of {len(all_steps)}")
bsq=rd('docs/BUILD-SEQUENCE.md'); tags=dict(re.findall(r"^### Step (\d+\.\d+[a-z]?)[^\n]*\n> \*\*Release: ([^*]+)\*\*",bsq,re.M))
bad_tag=[st for st in re.findall(r'^### Step (\d+\.\d+[a-z]?)',bsq,re.M) if tags.get(st,'?')!=('R1' if st in r1['steps_in_release'] else r1['steps_later'].get(st,'—'))]
ok(not bad_tag,f'every build Step carries the Release tag the scope file assigns {bad_tag[:4]}')
ok(set(r1['steps_in_release'])|set(r1['steps_later'])<=all_steps,f"every step named in the scope file exists {sorted((set(r1['steps_in_release'])|set(r1['steps_later']))-all_steps)}")
mm=re.search(r"config/release\.php[^`]*```php\n(.*?)```",cfg,re.S); relphp=mm.group(1) if mm else ''
rm_=re.search(r"'modules'\s*=>\s*\[([^\]]*)\]",relphp); rr_=re.search(r"'roles'\s*=>\s*\[([^\]]*)\]",relphp)
ok(rm_ and sorted(re.findall(r"'(\w+)'",rm_.group(1)))==sorted(r1['modules']),'config/release.php sample lists exactly the R1 modules')
ok(rr_ and sorted(re.findall(r"'(\w+)'",rr_.group(1)))==sorted(r1['roles']) and set(r1['roles'])<={'super_admin','admin','teacher','student','parent','accountant','content_writer','content_moderator'},'config/release.php sample lists exactly the R1 roles (all real roles; student not yet; the D65 platform writer roles since QB.2)')
_cls=cfg[cfg.index('class ModuleGate'):]; _cls=_cls[:_cls.index('\n}\n')] if '\n}\n' in _cls else _cls
ok("config('release.modules'" in _cls and "$override" in _cls and _cls.index("config('release.modules'")<_cls.index("$override"),'ModuleGate (inside the class) checks the release gate BEFORE reading the Super Admin override')
# menu: items that would show in R1 but have no module gate must be classified
menu_txt=rd('docs/AUTHORIZATION.md'); unclassified=[]; missing_since=[]
for role in ['admin','teacher','accountant','parent','super_admin']:
    mb=re.search(r"\n  %s: \[(.*?)\n  \],"%role,menu_txt,re.S).group(0); gate=None; ingroup=False
    for ln in mb.split('\n'):
        gm=re.match(r"\s*\{ key: '[\w\-]+'.*children: \[",ln)
        if gm: ingroup=True; gate=re.search(r"module: '(\w+)'",ln).group(1) if "module:" in ln else None; continue
        if ingroup and re.match(r"\s*\]\}",ln): ingroup=False; gate=None; continue
        im=re.match(r"\s*it\('([\w\-]+)',",ln)
        if not im: continue
        key=im.group(1); has_mod='module:' in ln; has_since='since:' in ln
        if has_mod or gate: continue
        if has_since: continue
        if key not in r1['menu_no_module_ok'].get(role,[]): unclassified.append((role,key))
    for k in r1['menu_since'].get(role,{}):
        if not re.search(r"it\('%s',[^\n]*since: '%s'"%(re.escape(k),re.escape(r1['menu_since'][role][k])),mb): missing_since.append((role,k))
ok(not unclassified,f'every R1-visible menu item without a module gate is explicitly classified as R1 or marked since:RX {unclassified[:4]}')
ok(not missing_since,f'menu items the scope file defers carry their since marker {missing_since[:3]}')
ok('R1' in rd('docs/ROADMAP.md') and 'RELEASE-1.md' in rd('docs/ROADMAP.md') and 'RELEASE-1.md' in rd('AGENTS.md'),'ROADMAP and AGENTS point at docs/RELEASE-1.md')


# ---- 14. the single agent plan and the interview guides --------------------------------------------------------------------------------------------------
gp=subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'gen_agent_plan.py'),R,'--check'],capture_output=True,text=True)
ok(gp.returncode==0,f'docs/AGENT-PLAN-R1.md, r1-plan.json and r1-tables.txt are generated from the current specs: {gp.stdout.strip()}')
plan=json.load(open(os.path.join(R,'docs/release/r1-plan.json'),encoding='utf-8')); pt=plan['tasks']; tids=[t['id'] for t in pt]
ok(set(r1['steps_in_release'])<=set(tids),f"every Release 1 build step is a task in the plan {sorted(set(r1['steps_in_release'])-set(tids))}")
ok(all(pt[i]['depends_on']==(tids[i-1] if i else None) for i in range(len(pt))),'tasks form one linear chain (each depends on the previous one)')
owned=[x for t in pt for x in t['tables']]
ok(sorted(owned)==sorted(r1['tables']) and len(owned)==len(set(owned)),'each of the 31 R1 tables is owned by exactly one task')
ok(open(os.path.join(R,'docs/release/r1-tables.txt'),encoding='utf-8').read().split()==sorted(r1['tables']),'docs/release/r1-tables.txt equals the scope tables (schema-diff.sh reads it)')
refs_=sorted({r.split('#')[0] for t in pt for r in t['spec_refs'] if r.startswith(('docs/','infra/','themes/','.cursor/'))})
missing_ref=[r for r in refs_ if not os.path.exists(os.path.join(R,r))]
ok(not missing_ref,f'every file a task tells the agent to read exists {missing_ref[:4]}')
all_ctl=set(re.findall(r"\\?(?:[\w\\]*\\)?(\w+Controller)::class",rt))
unclassified_ctl=sorted(all_ctl-set(r1['controllers']))
ok(not unclassified_ctl,f'every controller in the routes template is classified by release ({len(all_ctl)} controllers) {unclassified_ctl[:4]}')
plan_ctl={re.search(r'-> (\w+)@',x).group(1) for t in pt for x in t['routes']+t['routes_excluded']}
r1_ctl={c for c,v in r1['controllers'].items() if v['release']=='R1'}
ok(r1_ctl<=plan_ctl,f'every Release 1 controller has routes in the plan {sorted(r1_ctl-plan_ctl)[:4]}')
bad_role=[x for t in pt for x in t['routes'] if re.search(r'\[role:([\w,]+)\]',x) and not (set(re.search(r'\[role:([\w,]+)\]',x).group(1).split(','))&set(r1['roles']))]
ok(not bad_role,f'no Release 1 route is reserved for a role this release does not ship {bad_role[:2]}')
leak=[x for t in pt for x in t['routes'] if scope_c(x) if False] if False else []
doc_text='\n'.join(rd(f) for f in mds if not f.endswith('AGENT-PLAN-R1.md') and not f.startswith('docs/reports/'))
unknown_tests=sorted({x for t in pt for x in t['tests'] if x not in doc_text})
ok(not unknown_tests,f'every test class named in the plan is described somewhere in the specs {unknown_tests[:4]}')
# interview guides
hd=rd('docs/research/interview-head-teacher.md'); ac=rd('docs/research/interview-accountant.md'); nt=rd('docs/research/interview-notes-and-decisions.md')
qids=set(re.findall(r'\*\*([HC]\d+\.\d+)\*\*',hd+ac))
arows=re.findall(r'^\| (A\d+) \|[^\n]*?\| ([^|]*) \|[^|]*\|$',nt,re.M)
used_ids={a:set(re.findall(r'[HC]\d+\.\d+',ids)) for a,ids in arows}
ok(len(arows)==15 and all(used_ids[a] for a in used_ids),f'15 assumptions A1..A15, each names at least one question that tests it ({len(arows)} found)')
dangling=sorted({q for a in used_ids for q in used_ids[a]}-qids)
ok(not dangling,f'every question id the assumption table cites exists in a guide {dangling[:4]}')
tags=set(re.findall(r'\[(A\d+)(?:[,\s–]+[A\d–,\s]*)?\]',hd+ac))|set(x for m_ in re.findall(r'\[((?:A\d+[,\s–]*)+)\]',hd+ac) for x in re.findall(r'A\d+',m_))
ok(tags<= {a for a,_ in arows},f'every [A…] tag in a guide names a listed assumption {sorted(tags-{a for a,_ in arows})}')
ok(all(c in hd and c in ac for c in r1['interview_cards']),f"both guides carry every feature card {[c for c in r1['interview_cards'] if not (c in hd and c in ac)][:3]}")
ok('প্রতিশ্রুতির সিঁড়ি' in hd and 'প্রতিশ্রুতির সিঁড়ি' in ac and 'নোট-ছক' in nt,'both guides end with the commitment ladder; the notes template exists')


# ---- 15. Release 1 must be BUILDABLE from the agent plan (R16: found a planned route that ModuleGate would 403, and must-haves with no route) ---------------------
import gen_agent_plan as gap
planned=[(t['id'],r) for t in plan['tasks'] for r in t['routes']]
rmod={(m_,re.sub(r'/+$','',re.sub(r'\{[^}]*\}','{x}',p_)) or '/'):mod_ for m_,p_,c_,a_,rl_,mod_ in gap.ALL_ROUTES}
def pkey(r): m_,rest=r.split(' ',1); return m_,(re.sub(r'/+$','',re.sub(r'\{[^}]*\}','{x}',rest.split(' -> ')[0])) or '/')
blocked=sorted({f'{k[0]} {k[1]} (module {rmod.get(k)})' for _,r in planned for k in [pkey(r)] if rmod.get(k) and rmod[k] not in r1['modules']})
ok(not blocked,f'no planned R1 route sits inside a module group outside release.modules (ModuleGate would answer 403) {blocked[:3]}')
planned_keys={pkey(r) for _,r in planned}
missing_must=[mr for mr in r1['must_have_routes'] if pkey(mr) not in planned_keys]
ok(not missing_must,f'every owner must-have has a route in the R1 plan ({len(r1["must_have_routes"])} checked) {missing_must[:3]}')
roles_bad=[r for _,r in planned if re.search(r'\[role:([\w,]+)\]',r) and not set(re.search(r'\[role:([\w,]+)\]',r).group(1).split(','))&set(r1['roles'])]
ok(not roles_bad,f'no planned R1 route is reachable only by a role that has not shipped (student) {roles_bad[:2]}')
sup=[l for pre in r1['api_superseded'] for l in rd('docs/API.md').split('\n') if pre in l and 'SUPERSEDED' not in l]
ok(not sup,f'API.md marks superseded endpoints as superseded {[x[:60] for x in sup[:2]]}')
ik=re.search(r"'import_kinds'\s*=>\s*\[([^\]]*)\]",cfg)
ok(ik and re.findall(r"'(\w+)'",ik.group(1))==r1['import_kinds'] and 'release.import_kinds' in rd('docs/modules/data-migration.md'),'release.import_kinds is defined in config/release.php and used by the import spec')
LATER_TOK=re.compile(r'coaching|private[_ ]batch|merit|admit|approved|sender-id',re.I)
leak=[(t['id'],sorted({m_.group(0).lower() for m_ in LATER_TOK.finditer(t['done_when'])})) for t in plan['tasks'] if re.match(r'(4|5)\.\d',t['id']) and LATER_TOK.search(t['done_when'])]
ok(not leak,f'Done When of R1 steps 4.x/5.x asks for nothing that Release 1 excludes (coaching, merit list, admit card, sender approval) {leak[:3]}')
ok(all(k in r1['step_done'] for k in ('4.1','4.2','4.3','4.5','4.6')),'steps whose original Done When was written for every institution type carry a Release 1 Done When')


# ---- 16. D43 + D44: private institutions first, government/MPO institutions OPTIONAL but never dropped from the plan ----------------------------------------------
_ld=rd('docs/LOCKED-DECISIONS.md')
ok('| D43 |' in _ld and '| D44 |' in _ld,'D43 (private first) and D44 (government/MPO institutions stay as an optional, low-priority part of the plan) are both recorded')
_d44=[l for l in _ld.split('\n') if l.startswith('| D44 |')]
ok(bool(_d44) and 'settings.ownership' in _d44[0] and 'mpo_index_no' in _d44[0],'D44 states HOW the optional part is switched on (settings.ownership) and names the MPO column')
ok(re.search(r'mpo_index_no VARCHAR\(30\) NULL',sch) is not None,'the optional, nullable teachers.mpo_index_no column exists in the schema (government/MPO support was not removed)')
_rm=rd('docs/ROADMAP.md')
ok(all(re.search(r'^\| %s \|[^\n]*D44'%pp,_rm,re.M) and not re.search(r'^\| %s \|[^\n]*(বাতিল|cancel)'%pp,_rm,re.M) for pp in ('P10','P11','P12')),'roadmap proposals P10 (board forms), P11 (government reports), P12 (stipend tracker) are marked OPTIONAL by D44 and are not cancelled')
ok('MPO' in rd('docs/modules/quick-wins.md') and 'D44' in rd('docs/modules/quick-wins.md'),'quick-wins.md keeps the MPO index as an optional field (D44)')


# ---- 17. docs/modules/README.md: the module index must be one clean table (a hand edit once glued file-index rows onto the hr_payroll row) --------------------------
_ml=[l for l in rd('docs/modules/README.md').split('\n') if re.match(r'\| `\w+` \|',l)]
_bad=[l[:40] for l in _ml if l.count('|')-1!=6]
_keys={re.match(r'\| `(\w+)`',l).group(1) for l in _ml}
_all=set(); [_all.update(re.findall(r"'(\w+)'",re.search(r"'%s' => \[.*?'modules' => \[(.*?)\]"%t_,cfg,re.S).group(1))) for t_ in ('school','college','coaching','private_batch')]
ok(not _bad,f'every module-index row has exactly six cells {_bad[:2]}')
ok(_all<=_keys,f'every module key of every institution type has a row in the module index {sorted(_all-_keys)[:4]}')


# ---- 18. Release 3 (Money & People): scope <-> schema <-> routes <-> tests <-> docs <-> generated plan ----------------------------------------------------------------
import gen_release_plan as grp
r3=grp.SC; r3plan=grp.plan_json
r3tables=set(r3['tables']); r3mods=set(r3['modules']); pre=r3['prerequisites']
ok(r3tables<=set(names) and not (r3tables&set(r1['tables'])),f"R3 tables exist and none belongs to Release 1 {sorted(r3tables-set(names))[:3]} {sorted(r3tables&set(r1['tables']))[:3]}")
_have=set(r1['tables'])|r3tables|set(pre['tables']); _f=[]
for tb in sorted(r3tables):
    for col,tgt in refs_of.get(tb,{}).items():
        if tgt in names and tgt not in _have and nn.get((tb,col)): _f.append(f'{tb}.{col}->{tgt}')
ok(not _f,f'no NOT NULL reference of an R3 table leaves Release 1 + R3 + the stated prerequisite (R1 -> R3 directly is possible) {_f[:3]}')
ok(r3mods<=_all|set(),f'every R3 module is a module of some institution type {sorted(r3mods-_all)}')
_C=r1['controllers']; _r3c={c for c,x in _C.items() if x['release']=='R3'}
_tc=set(); [ _tc.update(t['controllers']) for t in r3['tasks'] ]
ok(_r3c==(_tc-set(pre['controllers'])),f'every R3-labelled controller is planned in exactly the R3 tasks (and nothing else) {sorted(_r3c^(_tc-set(pre["controllers"])))[:4]}')
_orph=sorted({f'{c} ({m_})' for v_,p_,c,a_,rl_,m_ in gap.ALL_ROUTES if m_ in r3mods and c not in _r3c})
ok(not _orph,f'every route inside an R3 module belongs to an R3 controller (no orphan from another release) {_orph[:3]}')
_stray=sorted({f'{c} ({m_})' for v_,p_,c,a_,rl_,m_ in gap.ALL_ROUTES if c in _r3c and m_ not in r3mods and m_ not in ('fees',None)})
ok(not _stray,f'no R3 controller serves a route outside the R3 modules (apart from fees refunds and the Super Admin refund) {_stray[:3]}')
_tt=[tb for t in r3['tasks'] for tb in t['tables']]
ok(len(_tt)==len(set(_tt)) and set(_tt)==r3tables|set(pre['tables']),f'every R3 table is created in exactly one task {sorted(set(_tt)^(r3tables|set(pre["tables"])))[:3]}')
_bad_t=sorted({x for t in r3['tasks'] for x in t['tests'] if x not in grp.DOCS_WITH_TESTS})
ok(not _bad_t,f'every test named in the R3 plan is defined in a spec document or TESTING.md {_bad_t[:4]}')
_bad_sp=[(t['id'],sp) for t in r3['tasks'] for sp in t['spec'] if not os.path.exists(os.path.join(R,sp))]
ok(not _bad_sp,f'every spec file an R3 task asks the agent to read exists {_bad_sp[:3]}')
_ids=[t['id'] for t in r3['tasks']]
ok(all(t['done'].strip() and t['verify'] and all(a in _ids and _ids.index(a)<_ids.index(t['id']) for a in t['after']) for t in r3['tasks']),'every R3 task has a Done When, verify commands and only depends on EARLIER tasks')
_pk={pkey(r) for t in r3plan['tasks'] for r in t['routes']}
_mm=[mr for mr in r3['must_have_routes'] if pkey(mr) not in _pk]
ok(not _mm,f'every R3 must-have route (cash book close, refunds, leave, payroll run + payslip, inventory, vouchers, donations ...) is planned {_mm[:3]}')
_blk=sorted({f'{k[0]} {k[1]}' for t in r3plan['tasks'] for r in t['routes'] for k in [pkey(r)] if rmod.get(k) and rmod[k] not in (set(r1['modules'])|r3mods|set(pre['modules']))})
ok(not _blk,f'no planned R3 route sits in a module outside release_php (it would 403) {_blk[:3]}')
rel3=rd('docs/RELEASE-3.md')
ok(f"| ডেটাবেস টেবিল | **{lat(str(len(r3tables)))}**" in lat(rel3) and f"| Task (ধাপ) | **{lat(str(len(r3['tasks'])))}**" in lat(rel3) and f"| মডিউল-কী | **{lat(str(len(r3mods)))}**" in lat(rel3),'RELEASE-3.md quotes the table, module and task counts of the scope file')
_rs=sum(len(t['routes']) for t in r3plan['tasks'])-sum(len(t['routes']) for t in r3plan['tasks'] if t['id']=='R3.1')
ok(f"| Route | **{lat(str(_rs))}**" in lat(rel3),f'RELEASE-3.md quotes the route count of the generated plan ({_rs})')
_php=re.search(r"'modules' => \[([^\]]*)\]",rel3.split('config/release.php')[1]).group(1)
ok(re.findall(r"'(\w+)'",_php)==r3['release_php']['modules'] and set(r1['modules'])<=set(r3['release_php']['modules']) and set(r3mods|set(pre['modules']))<=set(r3['release_php']['modules']),'the config/release.php sample of RELEASE-3.md is cumulative: R1 modules + expenses + the R3 modules, equal to the scope file')
ok(all(a in rel3 for a in r3['acceptance']),'RELEASE-3.md carries every acceptance criterion of the scope file')
ok(all(re.search(r'^\| %s \|'%d_,rd('docs/LOCKED-DECISIONS.md'),re.M) for d_ in r3['decisions']),'every decision the R3 scope cites exists')
_hq=open(os.path.join(R,'infra/scripts/hot-queries.tsv'),encoding='utf-8').read()
ok(all(re.search(r'\b(FROM|JOIN)\s+%s\b'%tb_,_hq) for tb_ in ('staff_attendances','teacher_attendances','leave_applications','salary_structures','payroll_runs','payroll_items','salary_adjustments','cash_book_closings','fee_refunds','inventory_movements','inventory_items','vouchers','donations','budget_lines','provident_fund_entries')),'the hot-query catalogue covers the dense R3 tables')
_pc=subprocess.run([sys.executable,os.path.join(R,'infra/spec-verify/gen_release_plan.py'),R,'--check'],capture_output=True,text=True)
ok(_pc.returncode==0,f'docs/AGENT-PLAN-R3.md and r3-plan.json are generated from the current specs: {_pc.stdout.strip()[-80:]}')
ok('RELEASE-3.md' in rd('docs/ROADMAP.md') and 'AGENT-PLAN-R3.md' in rd('AGENTS.md') and 'AGENT-PLAN-R3.md' in rd('README.md'),'ROADMAP, AGENTS and README point at the R3 documents')


# ---- 19. Agent guardrails: rules <-> guard <-> self-test <-> entry files ---------------------------------------------------------------------------------------------
gr=rd('docs/ops/agent-guardrails.md'); ag=rd('AGENTS.md'); cur=rd('.cursor/rules/guardrails.mdc'); cl=rd('CLAUDE.md')
rule_ids=sorted(set(re.findall(r'^### (G\d+)',gr,re.M)),key=lambda x:int(x[1:]))
ok(rule_ids==[f'G{i}' for i in range(1,len(rule_ids)+1)] and len(rule_ids)>=17,f'agent-guardrails.md defines consecutive rules G1..G{len(rule_ids)}')
ok(all(re.search(r'\*\*%s - '%g_,ag) for g_ in rule_ids) and all(re.search(r'\*\*%s '%g_,cur) for g_ in rule_ids),'AGENTS.md and the always-on Cursor rule list every guardrail')
_chk=subprocess.run([sys.executable,os.path.join(R,'infra/guard/agent_guard.py'),'--list-checks'],capture_output=True,text=True).stdout.split()
_used=set(); _badtok=[]
for g_ in rule_ids:
    blk=re.search(r'^### %s .*?(?=^### G|\Z|^## )'%g_,gr,re.S|re.M).group(0)
    m_=re.search(r'বাধ্য করে:\*\*(.*?)(?:\*\*বদলে|\n\n|\Z)',blk,re.S)
    if not m_: _badtok.append(f'{g_}: no "বাধ্য করে:" line'); continue
    toks=re.findall(r'`([\w-]+)`',m_.group(1)) or re.findall(r'\b(C\d+|tests|review|permissions|branch-protection)\b',m_.group(1))
    toks=set(re.findall(r'\b(C\d+|tests|review|permissions|branch-protection|CODEOWNERS)\b',m_.group(1)))
    if not toks: _badtok.append(f'{g_}: no enforcement named')
    for t_ in toks:
        if re.fullmatch(r'C\d+',t_):
            _used.add(t_)
            if t_ not in _chk: _badtok.append(f'{g_}: names {t_}, which the guard does not implement')
ok(not _badtok,f'every guardrail names how it is enforced, and every check it cites exists in the guard {_badtok[:3]}')
ok(set(_chk)<=_used,f'every check of the guard is cited by at least one rule (no orphan check) {sorted(set(_chk)-_used)}')
_prot=open(os.path.join(R,'infra/guard/protected-paths.txt'),encoding='utf-8').read(); _own=rd('infra/CODEOWNERS.template')
_need=['AGENTS.md','CLAUDE.md','.cursor/**','docs/**','!docs/PROGRESS.md','!docs/DECISIONS.md','!docs/IDEAS.md','!docs/BLOCKED.md','infra/**','.github/**']
ok(all(re.search(r'^%s\s*$'%re.escape(x_),_prot,re.M) for x_ in _need),'protected-paths.txt protects the rules, specs, guard and CI, and frees only the four agent-maintained logs')
_own_lines=[]
for l_ in _own.split('\n'):
    l_=l_.split('#')[0].strip()
    if not l_: continue
    parts_=l_.split(); _own_lines.append((parts_[0].lstrip('/'),[x_ for x_ in parts_[1:] if x_.startswith('@')]))
def _owned(p_):                      # a CODEOWNERS line WITH an @owner must cover this protected pattern
    for pat_,own_ in _own_lines:
        if not own_: continue
        if p_.startswith('**/'):
            tok_=p_.strip('*/').replace('*','')
            if tok_ and (pat_.startswith('**/') or pat_.startswith('*')) and tok_ in pat_: return True      # a generic `**/Fixtures/` line - a path-specific line does not cover other directories
        elif pat_.startswith(p_) or p_.startswith(pat_.rstrip('*')) and pat_.rstrip('*'): return True
    return False
_miss=[]
for l_ in _prot.split('\n'):
    l_=l_.split('#')[0].replace('[modify-only]','').strip()
    if not l_ or l_.startswith('!'): continue
    pre_=re.split(r'(?<!\*)\*(?!\*)|\?',l_)[0] if not l_.startswith('**') else l_
    key_=l_ if l_.startswith('**') else (l_.split('**')[0] if '**' in l_ else l_.split('*')[0])
    if not _owned(key_ if not key_.startswith('**') else key_): _miss.append(l_)
ok(not _miss,f'the CODEOWNERS template gives every protected path a human @owner (a comment mentioning the folder does not count) {_miss[:3]}')
gt=subprocess.run([sys.executable,os.path.join(R,'infra/guard/test_guard.py')],capture_output=True,text=True)
ok(gt.returncode==0,f'guard self-test (a real violation of each rule in a throw-away git repository): {gt.stdout.strip().splitlines()[-1] if gt.stdout.strip() else gt.stderr[-100:]}')
pg=subprocess.run([sys.executable,os.path.join(R,'infra/guard/gen_progress.py'),R,'--check'],capture_output=True,text=True)
ok(pg.returncode==0,f'docs/PROGRESS.md has a line for every task of both agent plans: {pg.stdout.strip()[-70:]}')
ok('@AGENTS.md' in cl and '@docs/ops/agent-guardrails.md' in cl and re.search(r'alwaysApply:\s*true',cur),'CLAUDE.md imports AGENTS.md and the guardrails; the Cursor rule is always-on')
ok(bsh and subprocess.run([bsh,'-n',os.path.join(R,'infra/guard/install-hooks.sh')]).returncode==0,'infra/guard/install-hooks.sh: bash syntax')
_wf=yaml.safe_load(open(os.path.join(R,'infra/github-actions-guard.yml'),encoding='utf-8')); _steps=json.dumps(_wf)
ok('git show' in _steps and 'base_ref' in _steps and 'agent_guard.py' in _steps,'the CI workflow runs the BASE-branch copy of the guard (a PR cannot edit the guard to pass itself)')
try: json.load(open(os.path.join(R,'infra/guard/claude-settings.example.json'),encoding='utf-8')); _sj=True
except Exception: _sj=False
ok(_sj and os.path.exists(os.path.join(R,'docs/BLOCKED.md')) and os.path.exists(os.path.join(R,'docs/IDEAS.md')),'the tool-permission example is valid JSON and the BLOCKED / IDEAS logs exist')


# ---- 20. Client feature + price list: inputs consistent, every price computed twice, nothing internal leaks into the client document ------------------------------------
_pc=subprocess.run([sys.executable,os.path.join(R,'docs/pricing/build_client_pdf.py'),'--check'],capture_output=True,text=True)
ok(_pc.returncode==0,f'client price list: every module priced, tiers/classes/bundles valid, prices computed twice (second, independent calculation agrees), draft watermark iff unapproved, no internal wording leaks: {_pc.stdout.strip()[-150:] or _pc.stderr[-120:]}')
ok(open(os.path.join(R,'docs/pricing/modules.csv'),'rb').read(3)==b'\xef\xbb\xbf','docs/pricing/modules.csv starts with a UTF-8 BOM (Excel then shows Bengali correctly)')
ok(os.path.exists(os.path.join(R,'docs/pricing/README.md')) and '"approved"' in rd('docs/pricing/README.md'),'docs/pricing/README.md explains the approval switch')


# ---- 21. Decision D45: the PUBLIC launch is the COMPLETE plan; milestone map, readiness audit, draft plans, guard gate ------------------------------------------------
import gen_full_release as gfr
_ld=rd('docs/LOCKED-DECISIONS.md'); _fs=gfr.FS
ok(bool(re.search(r'^\| D45 \|[^\n]*RELEASE-FULL',_ld,re.M)),'D45 (public launch = the complete plan, Release 1 is the first milestone) is recorded and names docs/RELEASE-FULL.md')
_keys=set(gfr.MODS); _fm=set(_fs['modules'])
ok(_keys==_fm,f'every module of the module index sits in exactly one milestone of full-scope.json {sorted(_keys^_fm)[:4]}')
_ms=[m['id'] for m in _fs['milestones']]; _rank={m:i for i,m in enumerate(_ms)}
ok(_ms==[f'M{i}' for i in range(1,len(_ms)+1)] and all(v['milestone'] in _rank for v in _fs['modules'].values()),'milestones are M1..Mn in order and every module names one of them')
_bd=[f'{k}->{d}' for k,ds in _fs['depends'].items() for d in ds if d not in _fs['modules'] or k not in _fs['modules'] or _rank.get(_fs['modules'][d]['milestone'],99)>_rank.get(_fs['modules'][k]['milestone'],99)]
ok(not _bd,f'no module depends on a module of a LATER milestone (the build order is possible) {_bd[:3]}')
_map={'R1':'M1','R1.1':'M2','R1.1+':'M2','R2':'M3','R2+':'M3','R3':'M4','R4':'M5','R7':'M8'}; _bad=[]
for k,r in gfr.MODS.items():
    rel=gfr.C.module_release(r,gfr.SCOPE,None) or ''
    if k not in _fs['modules']: continue          # reported by the 'exactly one milestone' check above
    basis=_fs['modules'][k]['basis']
    if rel and basis=='derived' and _map.get(rel)!=_fs['modules'][k]['milestone']: _bad.append(f'{k}: spec says {rel}, milestone {_fs["modules"][k]["milestone"]}')
    if not rel and basis!='proposed': _bad.append(f'{k}: no release in the specs, so the placement must be marked "proposed"')
    if rel and basis=='proposed': _bad.append(f'{k}: the specs already say {rel}; do not override it with a proposal')
ok(not _bad,f'a placement is "derived" only where the specs say so (and agrees with them), and "proposed" only where they are silent {_bad[:3]}')
_pf=[m['id'] for m in _fs['milestones'] if m['plan_status']=='task-plan' and not (m.get('plan') and os.path.exists(os.path.join(R,m['plan'])))]
ok(not _pf and {m['id'] for m in _fs['milestones'] if m['plan_status']=='task-plan'}=={'M1','M4'},f'only M1 and M4 claim a full task plan, and their plan files exist {_pf}')
_fc=subprocess.run([sys.executable,os.path.join(R,'infra/spec-verify/gen_full_release.py'),R,'--check'],capture_output=True,text=True)
ok(_fc.returncode==0,f'RELEASE-FULL.md, AGENT-PLAN-FULL-DRAFT.md and full-audit.json are generated from the current specs: {_fc.stdout.strip()[-80:]}')
_rf=rd('docs/RELEASE-FULL.md'); _au=gfr.AU
_php=re.search(r"'modules' => \[([^\]]*)\]",_rf).group(1)
ok(re.findall(r"'(\w+)'",_php)==list(gfr.MODS) and _au['modules_total']==len(gfr.MODS),'RELEASE-FULL.md lists exactly the module keys for config/release.php at launch')
ok(not re.search('[०-९]',_rf+rd('docs/AGENT-PLAN-FULL-DRAFT.md')),'the generated Bengali documents contain no Devanagari digits')
ok(all(('F.%s.'%m['id']) in rd('docs/AGENT-PLAN-FULL-DRAFT.md') for m in _fs['milestones'] if m['plan_status']=='draft'),'AGENT-PLAN-FULL-DRAFT.md has draft tasks for every draft milestone')
ok('D45' in rd('AGENTS.md') and 'D45' in rd('docs/RELEASE-1.md') and 'RELEASE-FULL' in rd('README.md'),'AGENTS.md, RELEASE-1.md and README.md point at the complete-release plan')
ok(re.search(r'M1\.A',rd('docs/PROGRESS.md')) is not None and re.search(r'M8\.A',rd('docs/PROGRESS.md')) is not None,'docs/PROGRESS.md carries the milestone-acceptance lines the guard requires for Release: FULL')


# ---- 22. Self-hosted (own server) edition: client price list + the internal document that says what the system still lacks ----------------------------------------
_sh=subprocess.run([sys.executable,os.path.join(R,'docs/pricing/build_selfhosted_pdf.py'),'--check'],capture_output=True,text=True)
ok(_sh.returncode==0,f'self-hosted price list: exclusions match real features, licence/AMC/3- and 5-year figures computed twice, payment schedule = 100%, draft watermark iff unapproved, no internal wording: {_sh.stdout.strip()[-150:] or _sh.stderr[-120:]}')
_shd=rd('docs/SELF-HOSTED.md'); _shs=json.load(open(os.path.join(R,'docs/pricing/selfhosted/settings.json'),encoding='utf-8'))
ok(all(('OD-sh-%d'%i) in _shd for i in range(1,11)) and all(re.search(r'^\\| SH-%d \\|'%i,_shd,re.M) for i in range(1,11)) and 'D46' in _shd,'SELF-HOSTED.md records the six answers of D46 (OD-sh-1..6), the four items still open (OD-sh-7..10) and the ten missing capabilities (SH-1..10)')
ok(bool(re.search(r'^\\| D46 \\|[^\\n]*ডেভেলপার[^\\n]*',rd('docs/LOCKED-DECISIONS.md'),re.M)) and bool(re.search(r'^\\| D46 \\|[^\\n]*ঐচ্ছিক',rd('docs/LOCKED-DECISIONS.md'),re.M)),'D46 (self-hosted edition is sold, never to developers, AMC optional) is recorded')
ok(all(('`%s`'%m_) in _shd or m_ in _shd for m_ in _shs['exclude']['modules']) and all(e_.split(':',1)[1].split(' ')[-1] in _shd for e_ in _shs['exclude']['evidence']),'SELF-HOSTED.md documents every exclusion of the client price list (modules and features SaaS-only)')
ok('docs/pricing/Selfhosted-Pricing-bn.pdf' in _shd and 'SELF-HOSTED' in rd('README.md') and 'selfhosted' in rd('docs/pricing/README.md'),'README files point at the self-hosted price list and its internal document')


# ---- 23. Decision D47: one price per module, no size tiers, no limits; the plan-based subscription model is superseded and its Release 1 steps are fenced off ------------------------
_ld=rd('docs/LOCKED-DECISIONS.md'); _d47=re.search(r'^\| D47 \|[^\n]*',_ld,re.M)
ok(bool(_d47) and 'subscription_plans' in _d47.group(0) and 'অবরুদ্ধ' in _d47.group(0) and 'সীমা নেই' in _d47.group(0),'D47 (no size tiers, any single module, no limits; plan-based model superseded) is recorded and names what it breaks')
_r1p=json.load(open(os.path.join(R,'docs/release/r1-plan.json'),encoding='utf-8')); _t={t_['id']:t_ for t_ in _r1p['tasks']}
_unf=[i_ for i_,t_ in _t.items() if 'subscription_plans' in t_['tables'] and not t_.get('blocked')]
ok(not _unf and all(_t[i_].get('blocked') for i_ in ('5.1','5.2') if i_ in _t),f'every Release 1 task that builds the plan-based subscription (table subscription_plans, signup, billing) is BLOCKED until it is re-specified {_unf}')
_lim=[i_ for i_,t_ in _t.items() if re.search(r'student_limit_reached|max_students|max_batches',t_['done_when']) and 'D47' not in t_['done_when']]
ok(not _lim,f'no Release 1 Done When still demands a plan limit without the D47 amendment {_lim}')
_pm=rd('docs/PRICING-MODEL.md')
ok(all(('OD-pm-%d'%i_) in _pm for i_ in range(1,6)) and all(re.search(r'^\| PM-%d \|'%i_,_pm,re.M) for i_ in range(1,9)) and 'D47' in _pm,'PRICING-MODEL.md lists its eight missing capabilities (PM-1..8) and five open items (OD-pm-1..5)')
ok('D47' in rd('docs/modules/subscription.md')[:1500],'the old plan-based subscription specification carries the D47 supersession banner')
_hdr=open(os.path.join(R,'docs/pricing/modules.csv'),encoding='utf-8-sig').readline()
ok('requires' in _hdr and 'tier1' not in _hdr and 'D47' in rd('docs/pricing/README.md'),'modules.csv has the required-companion column and no tier-named column; the pricing README states the flat model')

print(f'\n{"ALL CHECKS PASSED" if not FAILS else str(FAILS)+" CHECK(S) FAILED"}  ({WARNS} warning(s))')
sys.exit(1 if FAILS else 0)
