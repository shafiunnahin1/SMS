#!/usr/bin/env python3
"""Generate D83 planning artifacts only; never activate a release or execute source code."""
import argparse
import hashlib
import json
import re
from pathlib import Path

SCOPE = 'docs/release/r21-scope.json'
GAPS = 'docs/release/r21-gap-map.json'
OUTPUTS = ('docs/release/r21-plan.json', 'docs/AGENT-PLAN-R2.1.md')
ENTRY_POINTS = ('AGENTS.md', 'README.md', 'AGENT-CONTINUITY.md',
                'docs/BUILD-SEQUENCE.md', 'docs/ROADMAP.md')
TASK_IDS = [f'R2.1.{n}' for n in range(10)]
DEPENDENCIES = [['R3.A'], ['R2.1.0'], ['R2.1.1'], ['R2.1.2'], ['R2.1.2'],
                ['R2.1.2'], ['R2.1.5'], ['R2.1.0'], TASK_IDS[3:8], TASK_IDS[:9]]


def load(root):
    return [json.loads((Path(root) / p).read_text(encoding='utf-8')) for p in (SCOPE, GAPS)]


def requirements(root):
    text = (Path(root) / 'RELEASE-2.1.md').read_text(encoding='utf-8')
    section = text.split('## 7. Release Acceptance — All Required', 1)[1].split('## 8.', 1)[0]
    return {f'AC{n:02}': line[6:] for n, line in enumerate(
        [line for line in section.splitlines() if line.startswith('- [ ] ')], 1)}


def validate(root, scope, gaps):
    """Reject contradictory planning flags, unknown references and missing acceptance coverage."""
    root = Path(root)
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    require(scope.get('release') == 'R2.1' and scope.get('decision') == 'D83', 'identity/decision')
    require(scope.get('phase') == 'planning_only', 'planning-only phase')
    require(scope.get('implementation_authorized') is False, 'implementation authorization')
    require(scope.get('runtime_switch') == {
        'authorized': False, 'task_id': None, 'required_acceptance': ['R3.A', 'R2.1.9'],
        'requires_owner_refinement': True}, 'runtime switch requires separate owner refinement')
    require(scope.get('placement') == gaps.get('placement'), 'placement differs from D83 gap map')
    require(scope.get('placement') == {'after': 'R3.A', 'before': 'R4',
            'first_executable_task': 'R2.1.0', 'runtime_switch_authorized': False}, 'placement/prerequisites')
    require(scope.get('authorized_new_objects') == {'tables': [], 'routes': [], 'modules': [], 'packages': []},
            'planning must not authorize application objects')
    require(scope.get('source_policy') == 'read_only_files_no_db_no_execution', 'source access policy')
    for entry in ENTRY_POINTS:
        text = (root / entry).read_text(encoding='utf-8')
        require(all(token in text for token in ('D83', 'R2.1', 'R3.A', 'R4', 'AGENT-PLAN-R2.1.md')),
                f'instruction/placement alignment: {entry}')
    runtime = (root / 'api/config/release.php').read_text(encoding='utf-8')
    current = re.search(r"'id'\s*=>\s*'([^']+)'", runtime)
    modules = re.search(r"'modules'\s*=>\s*\[([^\]]*)\]", runtime)
    r3 = json.loads((root / 'docs/release/r3-scope.json').read_text(encoding='utf-8'))
    require(current is not None and current.group(1) == 'R3', 'runtime remains R3')
    require(modules is not None and re.findall(r"'(\w+)'", modules.group(1)) == r3['release_php']['modules'],
            'exact R3 module list remains unchanged')
    require(hashlib.sha256((root / 'RELEASE-2.1.md').read_bytes()).hexdigest()
            == gaps.get('imported_draft_sha256'), 'imported draft provenance')
    gate_ids = {g['id'] for g in gaps['gates']}
    caps = {c['id']: c for c in gaps['capabilities']}
    require(all(g['status'] == 'open' for g in gaps['gates']), 'unresolved gates must remain open')
    require(all(c['accepted'] is False for c in caps.values()), 'no feature acceptance in planning')
    tasks = scope.get('tasks', [])
    require([t.get('id') for t in tasks] == TASK_IDS, 'ten imported task IDs/order')
    acceptance = requirements(root)
    seen_caps, seen_acceptance = set(), set()
    allowed_roles = {'super_admin', 'content_writer', 'content_moderator', 'admin', 'teacher',
                     'accountant', 'student', 'parent'}
    for n, t in enumerate(tasks):
        tid = t.get('id', '?')
        require(n < len(DEPENDENCIES) and t.get('depends_on') == DEPENDENCIES[n], f'{tid}: dependencies')
        require(t.get('executable') is False and t.get('accepted') is False, f'{tid}: non-executable/unaccepted')
        linked = t.get('capabilities', [])
        require(bool(linked) and set(linked) <= caps.keys(), f'{tid}: capability mapping')
        seen_caps.update(linked)
        expected_gates = {g for c in linked if c in caps for g in caps[c]['blocked_by']}
        require(set(t.get('blocked_by', [])) == expected_gates <= gate_ids, f'{tid}: blockers')
        require(all(tid in caps[c]['tasks'] for c in linked if c in caps), f'{tid}: imported capability owner')
        aids = t.get('acceptance_ids', [])
        require(bool(aids) and set(aids) <= acceptance.keys(), f'{tid}: acceptance references')
        seen_acceptance.update(aids)
        require(bool(t.get('unresolved_contracts')), f'{tid}: unresolved contracts explicit')
        require(t.get('future_fixture_command') is None, f'{tid}: future fixture command not approved')
        require(bool(t.get('done_when')) and bool(t.get('roles')), f'{tid}: done-when/roles')
        require(set(t.get('roles', [])) <= allowed_roles, f'{tid}: canonical roles')
        for p in t.get('existing_entities', []):
            require(p.startswith('api/app/Models/') and (root / p).is_file(), f'{tid}: existing entity {p}')
        for route in t.get('existing_route_anchors', []):
            path, controller, action = route.split('::')
            text = (root / path).read_text(encoding='utf-8') if (root / path).is_file() else ''
            require(f'[{controller}::class, \'{action}\']' in text, f'{tid}: existing route {route}')
    require(seen_caps == caps.keys(), 'every gap capability mapped')
    require(seen_acceptance == acceptance.keys(), 'all imported release acceptance requirements mapped')
    require(scope.get('regression_commands') == [
        {'cwd': 'api', 'command': 'php artisan test', 'purpose': 'future canonical backend regression; not parity proof'},
        {'cwd': 'frontend', 'command': 'npm test -- --run', 'purpose': 'future frontend regression; not persistence proof'},
        {'cwd': 'frontend', 'command': 'npm run lint:theme', 'purpose': 'future theme/RTL regression; not E2E proof'}],
        'baseline commands must stay explicit and separate from future fixture acceptance')
    return errors


def build(root):
    root = Path(root)
    scope, gaps = load(root)
    errors = validate(root, scope, gaps)
    if errors:
        raise ValueError('; '.join(errors))
    acceptance = requirements(root)
    plan = {**scope, 'generated_from': [SCOPE, GAPS, 'RELEASE-2.1.md'],
            'acceptance_catalogue': acceptance,
            'evidence_note': 'Existing entities/routes are reuse anchors, not accepted parity. No new schema/API is approved.'}
    lines = ['# R2.1 — generated planning plan (D83)', '',
             '> PLANNING ONLY. Every task is blocked and non-executable. Runtime remains R3.',
             '> Generate: `py -3.14 infra/spec-verify/gen_r21_plan.py .`; check: append `--check`.',
             '> Do not edit generated files. Source: `docs/release/r21-scope.json` and `docs/release/r21-gap-map.json`.',
             '', 'Placement: after R3.A, before R4/later; retain existing R1.1/R2 prerequisites.',
             'R2.1.0 requires R3.A. Executable task/schema/API scope and the runtime-switch task require owner refinement.',
             'R2.1.9 is proposed acceptance, not an authorized release switch. R3.A and R2.1.9 alone do not authorize switching.',
             'Source access is read-only files: no DB, application commands, tests or benchmarks.', '',
             'Existing route anchors name source declarations in the destination route file, not proposed new URLs.',
             'The imported root proposal, including its complete feature inventory, remains the requirements catalogue.', '']
    for t in scope['tasks']:
        lines.extend([f"## {t['id']} — {t['title']}", '',
                      f"Depends on: {', '.join(t['depends_on'])}. Status: BLOCKED / unaccepted / non-executable.",
                      f"Capabilities: {', '.join(t['capabilities'])}. Gates: {', '.join(t['blocked_by'])}.",
                      f"Canonical roles: {', '.join(t['roles'])}; exact new action permissions remain unresolved.",
                      f"Existing entity reuse: {', '.join(t['existing_entities']) or 'none required for file-only baseline'}.",
                      f"Existing route declarations: {'; '.join(t['existing_route_anchors']) or 'none; no new endpoint authorized'}.",
                      f"Unresolved contracts: {'; '.join(t['unresolved_contracts'])}.",
                      f"Acceptance requirements: {', '.join(t['acceptance_ids'])}.",
                      f"Done when (future, not run): {t['done_when']}",
                      'Feature-specific fixture/E2E/scale command: BLOCKED pending approved refined contract and fixture registry.', ''])
    lines.extend(['## Future baseline regression commands', '',
                  'These commands supplement future feature fixtures; none establish source parity by themselves.', ''])
    for c in scope['regression_commands']:
        lines.append(f"- `{c['cwd']}`: `{c['command']}` — {c['purpose']}.")
    lines.extend(['', '## Imported release acceptance catalogue', ''])
    lines.extend(f'- **{key}**: {text}' for key, text in acceptance.items())
    lines.extend(['', '## Planning verification', '',
                  '`py -3.14 infra/spec-verify/test_r21_plan.py` tests missing gates, dependency/order, approval flags, provenance and coverage.',
                  '`py -3.14 infra/spec-verify/gen_r21_plan.py . --check` rejects stale/invalid generated planning artifacts.',
                  'Full `verify.py . --deep` and staged guard are required before the protected checkpoint.',
                  'No feature checkoffs, runtime/module changes, migrations or source execution are authorized.', ''])
    return (json.dumps(plan, ensure_ascii=False, indent=2) + '\n', '\n'.join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        outputs = build(args.root)
        stale = []
        for path, text in zip(OUTPUTS, outputs):
            p = Path(args.root) / path
            if args.check:
                if not p.is_file() or p.read_text(encoding='utf-8') != text:
                    stale.append(path)
            else:
                p.write_text(text, encoding='utf-8', newline='\n')
        if stale:
            print('FAIL stale R2.1 planning artifacts: ' + ', '.join(stale))
            return 1
        print('PASS R2.1 planning: 10 blocked tasks, all capability/acceptance mappings; ' +
              ('generated artifacts fresh' if args.check else 'generated artifacts written'))
        return 0
    except (ValueError, KeyError, TypeError, OSError, IndexError) as exc:
        print(f'FAIL R2.1 planning: {exc}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
