#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""infra/guard/gen_progress.py - writes the SKELETON of docs/PROGRESS.md from the generated agent plans (one unchecked line per task).
The agent only ever flips `[ ]` to `[x]` for ITS task (agent_guard.py check C10); it never deletes or un-checks a line.
   python3 infra/guard/gen_progress.py .            write (refuses to overwrite a file that already has a checked task)
   python3 infra/guard/gen_progress.py . --check    exit 1 if a plan task has no line in docs/PROGRESS.md"""
import os, re, sys, json
ROOT = os.path.abspath(next((a for a in sys.argv[1:] if not a.startswith('--')), os.path.join(os.path.dirname(__file__), '..', '..')))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
plans = [('R1', 'docs/release/r1-plan.json', 'docs/AGENT-PLAN-R1.md'), ('R3', 'docs/release/r3-plan.json', 'docs/AGENT-PLAN-R3.md')]
def build():
    L = ['# Progress (agent-maintained)\n',
         'Rules (checked by `infra/guard/agent_guard.py`, C9/C10): one task per commit, in plan order; flip ONLY your own task from `[ ]` to `[x]` in the same commit as the code; NEVER delete or un-check a line; ',
         'a task is `[x]` only when EVERY command of its Done When / verify list ran green - write the evidence after the dashes. If you could not run something, leave `[ ]` and say why in `docs/BLOCKED.md`.\n',
         'Line format:  `- [x] <task-id> — <commit-sha> — <tests added / run> — <evidence: command and result>`\n']
    fs = json.loads(rd('docs/release/full-scope.json'))
    L.append('\n## Milestone acceptance (decision D45 - ALL of these must be [x] before the public launch; the guard checks them for `Release: FULL`)\n')
    for m in fs['milestones']: L.append(f"- [ ] {m['id']}.A — {m['name']} (release {m['release']}): owner-signed acceptance")
    for rel, jp, md in plans:
        j = json.loads(rd(jp)); L.append(f'\n## Release {rel}  (`{md}`)' + ('  — start only after Release 1 is accepted (task `A`)' if rel == 'R3' else '') + '\n')
        for t in j['tasks']: L.append(f"- [ ] {t['id']} — {t['title']}")
    return '\n'.join(L) + '\n'
def ids():
    return [t['id'] for _, jp, _ in plans for t in json.loads(rd(jp))['tasks']] + [m['id'] + '.A' for m in json.loads(rd('docs/release/full-scope.json'))['milestones']]
if '--check' in sys.argv:
    cur = rd('docs/PROGRESS.md'); have = set(re.findall(r'^\s*[-*]\s*\[[ xX]\]\s*([\w.]+)\b', cur, re.M))
    miss = [i for i in ids() if i not in have]; print('PROGRESS has a line for every plan task' if not miss else f'PROGRESS is missing tasks: {miss}'); sys.exit(1 if miss else 0)
cur = rd('docs/PROGRESS.md') if os.path.exists(os.path.join(ROOT, 'docs/PROGRESS.md')) else ''
if re.search(r'^\s*[-*]\s*\[[xX]\]', cur, re.M): sys.exit('docs/PROGRESS.md already has checked tasks - not overwriting')
open(os.path.join(ROOT, 'docs/PROGRESS.md'), 'w', encoding='utf-8').write(build()); print('wrote docs/PROGRESS.md:', len(ids()), 'tasks')
