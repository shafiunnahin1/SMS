#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
infra/guard/test_guard.py - proves agent_guard.py fires. Builds a throw-away git repository, then for EVERY rule commits one real violation (and one clean commit) and checks the verdict.
    python3 infra/guard/test_guard.py            exit 0 = every scenario behaved as expected (needs `git`)
"""
import os, re, sys, json, shutil, subprocess, tempfile
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
GUARD = os.path.join(HERE, 'agent_guard.py')
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
def git(d, *a): return subprocess.run(['git', '-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'] + list(a), capture_output=True, text=True)
def write(d, rel, text):
    p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w', encoding='utf-8').write(text)
r1p = json.loads(rd('docs/release/r1-plan.json')); r1s = json.loads(rd('docs/release/r1-scope.json')); r3s = json.loads(rd('docs/release/r3-scope.json'))
def deps(t): return re.findall(r'[\w.]+', t['depends_on']) if isinstance(t['depends_on'], str) else list(t['depends_on'] or [])
TASK0 = next(t['id'] for t in r1p['tasks'] if not deps(t))
TASK_DEP = next(t['id'] for t in r1p['tasks'] if deps(t) and t['id'] not in ('0.1', '0.2', '0.3'))      # a NON-scaffold task whose dependencies are not done
SCAFFOLD = TASK0 if TASK0 in ('0.1', '0.2', '0.3') else '0.1'      # a scaffold task WITHOUT unfinished dependencies
PROGRESS = re.sub(r'(?m)^([ \t]*- \[)[xX](\])', r'\1 \2', rd('docs/PROGRESS.md'))
DECISIONS = "# Decisions\n\n| # | Decision | Detail |\n|---|---|---|\n| D1 | Stack | Laravel |\n| D2 | Tenancy | institution_id |\n| D3 | Money | Decimal |\n"
MIG = "<?php\nuse Illuminate\\Support\\Facades\\Schema;\nreturn new class { public function up() { Schema::create('%s', function ($t) { $t->id(); }); } };\n"
RELEASE_PHP = "<?php\nreturn [\n    'id' => 'R1',\n    'modules' => [%s],\n];\n" % ', '.join(f"'{m}'" for m in r1s['modules'])
TEST_PHP = "<?php\nclass StudentTest extends TestCase { public function test_a() {\n" + ''.join(f"  $this->assertSame({i}, {i});\n" for i in range(8)) + "} }\n"

def make_base():
    d = tempfile.mkdtemp(prefix='guardtest_')
    git(d, 'init', '-q', '-b', 'main')
    for f in ('docs/release/r1-scope.json', 'docs/release/r1-plan.json', 'docs/release/r3-scope.json', 'docs/release/r3-plan.json', 'docs/release/full-scope.json', 'infra/guard/protected-paths.txt'):
        write(d, f, rd(f))
    write(d, 'docs/LOCKED-DECISIONS.md', DECISIONS); write(d, 'docs/PROGRESS.md', PROGRESS); write(d, 'docs/modules/x.md', '# spec\n'); write(d, 'docs/DECISIONS.md', '# agent log\n')
    write(d, 'api/config/release.php', RELEASE_PHP); write(d, 'api/database/migrations/2026_01_01_000000_create_users_table.php', MIG % 'users')
    write(d, 'api/routes/api.php', "<?php\nRoute::get('/students', [StudentController::class, 'index']);\n"); write(d, 'api/tests/Feature/StudentTest.php', TEST_PHP)
    write(d, 'api/tests/Fixtures/payroll_golden.json', '{"gross": "30500.00"}\n')
    write(d, 'api/composer.json', json.dumps({'require': {'laravel/framework': '^11.0'}})); write(d, 'api/composer.lock', '{}\n')
    write(d, 'frontend/package.json', json.dumps({'dependencies': {'react': '^18.0.0'}})); write(d, 'frontend/src/App.jsx', 'export default function App(){ return null }\n')
    write(d, 'api/app/Services/Util.php', "<?php\nclass Util {}\n")
    git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'base')
    return d

def check_off(task):
    return PROGRESS.replace(f'- [ ] {task} ', f'- [x] {task} ', 1)

class Scn:
    def __init__(s, name, changes, msg, expect_fail=(), expect_pass=False, base_extra=None): s.name, s.changes, s.msg, s.expect_fail, s.expect_pass = name, changes, msg, set(expect_fail), expect_pass
S = []
def add(*a, **k): S.append(Scn(*a, **k))
ok_msg = f'feat: scaffold\n\nTask: {TASK0}'
# ---------- clean ----------
add('clean scaffold commit (code + its own PROGRESS line)', {'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, expect_pass=True)
add('clean: new migration for an R1 table, new test, TenantBulk call', {'api/database/migrations/2026_02_01_000000_create_students_table.php': MIG % 'students', 'api/app/Services/Bulk.php': "<?php\nTenantBulk::upsert(Attendance::class, $rows, ['a'], ['b']);\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, expect_pass=True)
add('clean: guard:allow turns a forbidden pattern into a warning only', {'api/app/Services/D.php': "<?php\ndd($x); // guard:allow(debug)\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, expect_pass=True)
# ---------- C1 protected ----------
# D119: the pinned qbank copy - C7/C11 skip it, but it moves only with a matching manifest under a Change-Request
import hashlib as _h
_V = 'frontend/public/vendor/qbank/'
_vjs = "console.log('qbank');\n" + "var x = 1;\n" * 4100
_man = lambda body: f"{_h.sha256(body.encode()).hexdigest()}  js/tool.js\n"
add('D119 a qbank copy with its manifest skips C7/C11', {_V + 'js/tool.js': _vjs, _V + 'MANIFEST.sha256': _man(_vjs), 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg + '\nChange-Request: D2', expect_pass=True)
add('D119 a qbank file without the manifest', {_V + 'js/tool.js': "var x = 1;\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg + '\nChange-Request: D2', {'C1'})
add('D119 a qbank file that differs from its manifest', {_V + 'js/tool.js': "var x = 2;\n", _V + 'MANIFEST.sha256': _man("var x = 1;\n"), 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg + '\nChange-Request: D2', {'C1'})
add('D119 a qbank copy without a Change-Request', {_V + 'js/tool.js': "var x = 1;\n", _V + 'MANIFEST.sha256': _man("var x = 1;\n"), 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C1'})
add('C1 a spec document is edited without a Change-Request', {'docs/modules/x.md': '# spec CHANGED\n'}, 'docs: tweak spec', {'C1'})
add('C1 a spec edit with a valid Change-Request (decision D2 exists) passes', {'docs/modules/x.md': '# spec CHANGED\n'}, 'docs: owner-approved change\n\nChange-Request: D2', expect_pass=True)
add('C1 a Change-Request naming a decision that does not exist', {'docs/modules/x.md': '# spec CHANGED\n'}, 'docs: x\n\nChange-Request: D99', {'C1'})
add('C1 an existing decision is edited', {'docs/LOCKED-DECISIONS.md': DECISIONS.replace('Decimal', 'float')}, 'oops\n\nChange-Request: D3', {'C1'})
add('C1 a decision row is deleted', {'docs/LOCKED-DECISIONS.md': DECISIONS.replace('| D3 | Money | Decimal |\n', '')}, 'oops', {'C1'})
add('C1 a new decision is appended WITHOUT the matching trailer', {'docs/LOCKED-DECISIONS.md': DECISIONS + '| D4 | New | x |\n'}, 'owner: decision', {'C1'})
add('C1 a new decision with its trailer passes (a human commit)', {'docs/LOCKED-DECISIONS.md': DECISIONS + '| D4 | New | x |\n'}, 'owner: decision\n\nChange-Request: D4', expect_pass=True)
add('C1 the commit edits the protected-paths list AND a spec (cannot edit its own rules away)', {'infra/guard/protected-paths.txt': '# nothing is protected now\n', 'docs/modules/x.md': '# spec CHANGED\n'}, 'sneaky', {'C1'})
add('C1 a golden fixture is modified', {'api/tests/Fixtures/payroll_golden.json': '{"gross": "30000.00"}\n'}, 'make the test pass', {'C1'})
add('C1 agent rules file (AGENTS.md) edited', {'AGENTS.md': '# new rules\n'}, 'relax rules', {'C1'})
# ---------- C2 / C3 migrations ----------
add('C2 an existing migration is edited', {'api/database/migrations/2026_01_01_000000_create_users_table.php': (MIG % 'users') + '// changed\n', 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C2'})
add('C2 an existing migration is deleted', {'api/database/migrations/2026_01_01_000000_create_users_table.php': None, 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C2'})
add('C3 a migration for a table of a LATER release (fee_refunds, R3) at release R1', {'api/database/migrations/2026_02_01_000000_create_fee_refunds_table.php': MIG % 'fee_refunds', 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C3'})
add('C3 a migration for a table that is in no release plan', {'api/database/migrations/2026_02_01_000000_create_nonsense_table.php': MIG % 'nonsense', 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C3'})
# ---------- C4 routes ----------
add('C4 a route to a controller of a later release', {'api/routes/api.php': "<?php\nRoute::get('/students', [StudentController::class, 'index']);\nRoute::post('/fee-refunds', [FeeRefundController::class, 'store']);\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C4'})
# ---------- C5 tests ----------
add('C5 a test file is deleted', {'api/tests/Feature/StudentTest.php': None, 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C5'})
add('C5 a test gets markTestSkipped', {'api/tests/Feature/StudentTest.php': TEST_PHP.replace('public function test_a() {', 'public function test_a() { $this->markTestSkipped("later");'), 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C5'})
add('C5 a test loses most of its assertions', {'api/tests/Feature/StudentTest.php': "<?php\nclass StudentTest extends TestCase { public function test_a() { $this->assertTrue(true); } }\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C5'})
add('C5 a JavaScript test gets it.only', {'frontend/src/a.test.jsx': "it.only('x', () => { expect(1).toBe(1) })\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C5'})
# ---------- C7 forbidden code ----------
for nm, path, code in [('withoutGlobalScope (tenant bypass)', 'api/app/Services/A.php', "<?php\n$x = Student::withoutGlobalScope('tenant')->get();\n"),
                       ('raw bulk upsert on a model', 'api/app/Services/A.php', "<?php\nAttendance::upsert($rows, ['a'], ['b']);\n"),
                       ('money as float', 'api/app/Services/FeeService.php', "<?php\n$total = (float) $amount;\n"),
                       ('env() inside application code', 'api/app/Services/A.php', "<?php\n$k = env('SMS_KEY');\n"),
                       ('dd() left in', 'api/app/Services/A.php', "<?php\ndd($x);\n"),
                       ('hard-coded disk s3', 'api/app/Services/A.php', "<?php\nStorage::disk('s3')->put($p, $c);\n"),
                       ('console.log in the frontend', 'frontend/src/A.jsx', "export const A = () => { console.log('x'); return null }\n"),
                       ('hex colour in a component', 'frontend/src/A.jsx', "export const A = () => <div style={{color:'#17599B'}}/>\n"),
                       ('token in localStorage', 'frontend/src/auth.js', "localStorage.setItem('auth_token', t)\n")]:
    add('C7 ' + nm, {path: code, 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C7'})
# ---------- C8 secrets ----------
add('C8 an AWS access key in code', {'api/app/Services/A.php': "<?php\n$k = 'AKIAABCDEFGHIJKLMNOP';\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C8'})
add('C8 a committed .env file', {'api/.env': 'APP_KEY=base64:abc\n', 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C8'})
add('C8 a hard-coded credential', {'api/app/Services/A.php': "<?php\n$password = 'Sup3rSecretValue99';\n", 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C8'})
# ---------- C9 / C10 ----------
add('C9 a code commit without a Task trailer', {'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK0)}, 'feat: something', {'C9'})
add('C9 a task whose dependencies are not done yet', {'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK_DEP)}, f'feat: out of order\n\nTask: {TASK_DEP}', {'C9'})
add('C9 a task of a later release (R3.2 while the release is R1)', {'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off('R3.2')}, 'feat: cash book\n\nTask: R3.2', {'C9'})
add('C9 an unknown task id', {'api/app/Foo.php': "<?php\nclass Foo {}\n"}, 'feat: x\n\nTask: 99.9', {'C9'})
add('C10 a code commit that does not touch PROGRESS', {'api/app/Foo.php': "<?php\nclass Foo {}\n"}, ok_msg, {'C10'})
add('C10 a commit checks off a task that is not its own', {'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK0).replace('- [ ] 0.3 ', '- [x] 0.3 ', 1)}, ok_msg, {'C10'})
add('C10 a done line is deleted from PROGRESS', {'docs/PROGRESS.md': PROGRESS.replace(f'- [ ] {TASK0} ', '')}, 'tidy progress', set())   # base has nothing checked: deletion of an UNCHECKED line is allowed; the checked case is a second-stage scenario below
# ---------- C11 size ----------
add('C11 a commit touching 90 files', {**{f'api/app/G{i}.php': f"<?php\nclass G{i} {{}}\n" for i in range(90)}, 'docs/PROGRESS.md': check_off(TASK0)}, ok_msg, {'C11'})
# ---------- C12 release flip ----------
add('C12 release.php changed without a Release trailer', {'api/config/release.php': RELEASE_PHP.replace("'R1'", "'R3'")}, 'flip', {'C12'})
add('C12 switching to R3 before Release 1 is accepted (task A not done)', {'api/config/release.php': "<?php\nreturn [\n    'id' => 'R3',\n    'modules' => [%s],\n];\n" % ', '.join(f"'{m}'" for m in r3s['release_php']['modules'])}, 'flip\n\nRelease: R3', {'C12'})
add('C12 release.php with a module list that is not the scope file', {'api/config/release.php': RELEASE_PHP.replace("'students'", "'students', 'payroll_secret'")}, 'flip\n\nRelease: R1', {'C12'})
FULLS = json.loads(rd('docs/release/full-scope.json'))
FULL_PHP = lambda mods: "<?php\nreturn [\n    'id' => 'FULL',\n    'modules' => [%s],\n];\n" % ', '.join(f"'{m}'" for m in mods)
add('C12 the COMPLETE release (D45) before the milestones are accepted', {'api/config/release.php': FULL_PHP(sorted(FULLS['modules']))}, 'flip\n\nRelease: FULL', {'C12'})
add('C12 the COMPLETE release with a module list that is not all 56', {'api/config/release.php': FULL_PHP(sorted(FULLS['modules'])[:-1])}, 'flip\n\nRelease: FULL', {'C12'})
# ---------- C14 dependencies ----------
add('C14 a new composer package outside the scaffold tasks', {'api/composer.json': json.dumps({'require': {'laravel/framework': '^11.0', 'evil/package': '^1.0'}}), 'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK_DEP)}, f'feat: add pkg\n\nTask: {TASK_DEP}', {'C14'})
add('C14 the same change inside a scaffold task passes', {'frontend/package.json': json.dumps({'dependencies': {'react': '^18.0.0', 'axios': '^1.0.0'}}), 'docs/PROGRESS.md': check_off(SCAFFOLD)}, f'chore: scaffold\n\nTask: {SCAFFOLD}', expect_pass=True)
add('C14 a lockfile changes without a manifest change', {'api/composer.lock': '{"changed": true}\n', 'api/app/Foo.php': "<?php\nclass Foo {}\n", 'docs/PROGRESS.md': check_off(TASK_DEP)}, f'feat: x\n\nTask: {TASK_DEP}', {'C14'})

add('D83 R2.1 code remains blocked with a Task trailer',
    {'api/app/Services/Parity.php': '<?php\nclass Parity {}\n',
     'docs/PROGRESS.md': PROGRESS + '\n- [ ] R2.1.0 — blocked planning\n'},
    'feat: parity\n\nTask: R2.1.0', {'C9'})
add('D83 documentation-only feature checkoff remains blocked',
    {'docs/PROGRESS.md': PROGRESS + '\n- [x] R2.1.0 — unsupported acceptance\n'},
    'docs: false acceptance\n\nTask: R2.1.0', {'C10'})
add('D83 R2.1 runtime label remains blocked',
    {'api/config/release.php': RELEASE_PHP.replace("'R1'", "'R2.1'"),
     'docs/PROGRESS.md': check_off(TASK0)},
    f'feat: parity switch\n\nTask: {TASK0}\nRelease: R2.1', {'C12'})
add('D83 R2.1 runtime body cannot hide behind an R1 trailer',
    {'api/config/release.php': RELEASE_PHP.replace("'R1'", "'R2.1'"),
     'docs/PROGRESS.md': check_off(TASK0)},
    f'feat: spoofed parity switch\n\nTask: {TASK0}\nRelease: R1', {'C12'})

def run_guard(d, base, head):
    r = subprocess.run([sys.executable, GUARD, '--root', d, '--base', base, '--head', head], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, r.stdout + r.stderr

def d139_probe():
    d = make_base()
    decisions = DECISIONS + '| D138 | Flexible curriculum | approved |\n| D139 | Language curriculum task | approved |\n| D144 | Class-scoped language curricula | approved |\n| D145 | Class-scoped curriculum version mapping | approved |\n'
    progress = PROGRESS + '\n- [x] R2.1.2 — accepted D114 scope\n'
    write(d, 'docs/LOCKED-DECISIONS.md', decisions)
    write(d, 'docs/PROGRESS.md', progress)
    git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'owner: approved D139 base')
    git(d, 'tag', 'd139base')
    write(d, 'api/app/Services/Curriculum.php', "<?php\nclass Curriculum {}\n")
    write(d, 'api/database/migrations/2026_10_21_000001_create_qb_curriculum_version_class_level.php', MIG % 'qb_curriculum_version_class_level')
    write(d, 'docs/PROGRESS.md', progress + '- [ ] R2.1.2-language-curriculum — in progress\n')
    git(d, 'add', '-A')
    git(d, 'commit', '-q', '-m', 'feat: D145 class mapping slice\n\nTask: R2.1.2-language-curriculum\nChange-Request: D145')
    code, out = run_guard(d, 'd139base', 'HEAD')
    shutil.rmtree(d, ignore_errors=True)
    return code, out

def d142_probe():
    d = make_base()
    decisions = DECISIONS + '| D142 | Inline gap-fill authoring | approved |\n'
    progress = PROGRESS + '\n- [x] R2.1.2 — accepted D114 scope\n'
    write(d, 'docs/LOCKED-DECISIONS.md', decisions)
    write(d, 'docs/PROGRESS.md', progress)
    git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'owner: approved D142 base')
    git(d, 'tag', 'd142base')
    write(d, 'frontend/src/features/qb/Structured.jsx', 'export const inlineGaps = true\n')
    write(d, 'docs/PROGRESS.md', progress + '- [ ] R2.1.2-gap-fill-authoring — in progress\n')
    git(d, 'add', '-A')
    git(d, 'commit', '-q', '-m', 'feat: D142 inline gaps\n\nTask: R2.1.2-gap-fill-authoring\nChange-Request: D142')
    code, out = run_guard(d, 'd142base', 'HEAD')
    shutil.rmtree(d, ignore_errors=True)
    return code, out

def d146_probe():
    d = make_base()
    decisions = DECISIONS + '| D146 | Graph tool viewport | approved |\n'
    progress = PROGRESS + '\n- [x] R2.1.2 — accepted D114 scope\n'
    write(d, 'docs/LOCKED-DECISIONS.md', decisions)
    write(d, 'docs/PROGRESS.md', progress)
    git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'owner: approved D146 base')
    git(d, 'tag', 'd146base')
    write(d, 'frontend/src/GraphViewport.jsx', 'export const graphViewport = true\n')
    write(d, 'docs/PROGRESS.md', progress + '- [ ] R2.1.2-graph-tool-viewport — in progress\n')
    git(d, 'add', '-A')
    git(d, 'commit', '-q', '-m', 'feat: D146 graph viewport\n\nTask: R2.1.2-graph-tool-viewport\nChange-Request: D146')
    code, out = run_guard(d, 'd146base', 'HEAD')
    shutil.rmtree(d, ignore_errors=True)
    return code, out

def main():
    if subprocess.run(['git', '--version'], capture_output=True).returncode != 0: print('git is not installed - cannot run the guard self-test'); return 2
    base_dir = make_base(); bad = 0; n = 0
    git(base_dir, 'tag', 'base')
    for sc in S:
        n += 1; branch = f's{n}'
        git(base_dir, 'checkout', '-q', '-b', branch, 'base')
        for path, content in sc.changes.items():
            p = os.path.join(base_dir, path)
            if content is None:
                if os.path.exists(p): os.remove(p)
            else: write(base_dir, path, content)
        git(base_dir, 'add', '-A'); cr = git(base_dir, 'commit', '-q', '-m', sc.msg)
        if cr.returncode != 0 and 'nothing to commit' not in cr.stdout + cr.stderr: print('could not commit scenario', sc.name, cr.stderr[:200]); bad += 1; continue
        code, out = run_guard(base_dir, 'base', branch)
        fails = set(re.findall(r'^FAIL\s+\[(C\d+)\]', out, re.M))
        good = (code == 0) if sc.expect_pass else (sc.expect_fail <= fails and code == 1)
        if sc.expect_pass is False and not sc.expect_fail: good = (code == 0)
        print(('ok    ' if good else 'WRONG ') + sc.name + ('' if good else f'  (exit {code}, fails {sorted(fails)}, expected {sorted(sc.expect_fail) or "pass"})\n' + out[-400:]))
        bad += 0 if good else 1
        git(base_dir, 'checkout', '-q', 'main')
    n += 1
    code, out = d139_probe()
    good = code == 0
    print(('ok    ' if good else 'WRONG ') + 'D145 custom task, dependency and new-table allowlist' + ('' if good else f' (exit {code})\n' + out[-500:]))
    bad += 0 if good else 1
    n += 1
    code, out = d142_probe()
    good = code == 0
    print(('ok    ' if good else 'WRONG ') + 'D142 custom task, accepted dependency and zero-new-object allowlist' + ('' if good else f' (exit {code})\n' + out[-500:]))
    bad += 0 if good else 1
    n += 1
    code, out = d146_probe()
    good = code == 0
    print(('ok    ' if good else 'WRONG ') + 'D146 custom task, accepted dependency and zero-new-object allowlist' + ('' if good else f' (exit {code})\n' + out[-500:]))
    bad += 0 if good else 1
    # stage two: a done line exists, then someone un-checks it
    git(base_dir, 'checkout', '-q', '-b', 'stage2', 'base'); write(base_dir, 'api/app/Foo.php', "<?php\nclass Foo {}\n"); write(base_dir, 'docs/PROGRESS.md', check_off(TASK0)); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', ok_msg)
    git(base_dir, 'tag', 'base2'); n += 1
    write(base_dir, 'docs/PROGRESS.md', PROGRESS); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', 'tidy progress')
    code, out = run_guard(base_dir, 'base2', 'stage2'); good = code == 1 and 'C10' in out
    print(('ok    ' if good else 'WRONG ') + 'C10 a CHECKED line is un-checked in PROGRESS' + ('' if good else '\n' + out[-300:])); bad += 0 if good else 1
    # then a legitimate next task passes once its dependency is [x]
    git(base_dir, 'checkout', '-q', '-B', 'stage3', 'base2'); nxt = next(t['id'] for t in r1p['tasks'] if deps(t) and all(x == TASK0 for x in deps(t)))
    write(base_dir, 'api/app/Bar.php', "<?php\nclass Bar {}\n"); write(base_dir, 'docs/PROGRESS.md', check_off(TASK0).replace(f'- [ ] {nxt} ', f'- [x] {nxt} ', 1)); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', f'feat: next\n\nTask: {nxt}')
    code, out = run_guard(base_dir, 'base2', 'stage3'); good = code == 0
    print(('ok    ' if good else 'WRONG ') + f'clean: task {nxt} after its dependency {TASK0} is [x]' + ('' if good else '\n' + out[-300:])); bad += 0 if good else 1
    # stage five: a task BLOCKED by a decision (D47) is refused even when every other task is done
    BLOCKED = next(t['id'] for t in r1p['tasks'] if t.get('blocked'))
    git(base_dir, 'checkout', '-q', '-B', 'stage5', 'base'); acc5 = PROGRESS
    for t_ in r1p['tasks']:
        if t_['id'] != BLOCKED: acc5 = acc5.replace(f"- [ ] {t_['id']} ", f"- [x] {t_['id']} ", 1)
    write(base_dir, 'docs/PROGRESS.md', acc5); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', 'owner: everything except the blocked task'); git(base_dir, 'tag', 'base5'); n += 1
    write(base_dir, 'api/app/Foo.php', "<?php\nclass Foo {}\n"); write(base_dir, 'docs/PROGRESS.md', acc5.replace(f'- [ ] {BLOCKED} ', f'- [x] {BLOCKED} ', 1)); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', f'feat: blocked\n\nTask: {BLOCKED}')
    code, out = run_guard(base_dir, 'base5', 'stage5'); good = code == 1 and 'BLOCKED' in out
    print(('ok    ' if good else 'WRONG ') + f'C9 task {BLOCKED} is BLOCKED by decision D47 although its dependencies are done' + ('' if good else '\n' + out[-300:])); bad += 0 if good else 1
    # staged mode
    # stage four: the owner has accepted every milestone; the flip to the COMPLETE release with the exact module list passes the guard
    git(base_dir, 'checkout', '-q', '-B', 'stage4', 'base'); acc = PROGRESS
    for m in FULLS['milestones']: acc = acc.replace(f"- [ ] {m['id']}.A ", f"- [x] {m['id']}.A ", 1)
    write(base_dir, 'docs/PROGRESS.md', acc); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', 'owner: milestone acceptance'); git(base_dir, 'tag', 'base4'); n += 1
    write(base_dir, 'api/config/release.php', FULL_PHP(sorted(FULLS['modules']))); write(base_dir, 'docs/PROGRESS.md', acc.replace(f'- [ ] {TASK0} ', f'- [x] {TASK0} ', 1)); git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', f'chore: launch\n\nTask: {TASK0}\nRelease: FULL')
    code, out = run_guard(base_dir, 'base4', 'stage4'); good = code == 0
    print(('ok    ' if good else 'WRONG ') + 'clean: the COMPLETE release flip after every milestone is accepted' + ('' if good else '\n' + out[-400:])); bad += 0 if good else 1
    # D63 R1 -> R3 transition admits only R3.0, preserving C9/C12 scope gates.
    git(base_dir, 'checkout', '-q', '-B', 'r3-accepted', 'base')
    accepted = PROGRESS.replace('- [ ] A ', '- [x] A ', 1)
    write(base_dir, 'docs/PROGRESS.md', accepted)
    git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', 'owner: accept R1'); git(base_dir, 'tag', 'r3-parent')
    for label, task_id, mods, expected in [
        ('clean: R3.0 release switch after R1 acceptance', 'R3.0', r3s['release_php']['modules'], None),
        ('C9 later R3 task cannot piggyback on the release switch', 'R3.1', r3s['release_php']['modules'], 'C9'),
        ('C12 R3.0 still rejects an incorrect module list', 'R3.0', r3s['release_php']['modules'][:-1], 'C12'),
    ]:
        git(base_dir, 'checkout', '-q', '-B', 'r3-probe', 'r3-parent')
        write(base_dir, 'api/config/release.php', "<?php\nreturn ['id' => 'R3', 'modules' => [%s]];\n" % ', '.join(f"'{m}'" for m in mods))
        write(base_dir, 'docs/PROGRESS.md', accepted.replace(f'- [ ] {task_id} ', f'- [x] {task_id} ', 1))
        git(base_dir, 'add', '-A'); git(base_dir, 'commit', '-q', '-m', f'feat: release switch\n\nTask: {task_id}\nRelease: R3')
        code, out = run_guard(base_dir, 'r3-parent', 'r3-probe')
        good = code == 0 if expected is None else code == 1 and expected in out
        n += 1; bad += 0 if good else 1
        print(('ok    ' if good else 'WRONG ') + label + ('' if good else '\n' + out[-400:]))
    git(base_dir, 'checkout', '-q', 'main'); write(base_dir, 'api/app/Services/A.php', "<?php\ndd($x);\n"); git(base_dir, 'add', '-A')
    r = subprocess.run([sys.executable, GUARD, '--root', base_dir, '--staged'], capture_output=True, text=True); good = r.returncode == 1 and 'C7' in r.stdout
    print(('ok    ' if good else 'WRONG ') + '--staged mode catches a violation in the index' + ('' if good else '\n' + r.stdout[-300:])); bad += 0 if good else 1
    shutil.rmtree(base_dir, ignore_errors=True)
    print(f'\nguard self-test: {n + 2 - bad} of {n + 2} scenarios behaved as expected'); return 1 if bad else 0

if __name__ == '__main__': sys.exit(main())
