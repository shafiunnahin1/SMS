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
APPROVED_EXECUTION_SLICES = [{
    'id': 'R2.1.2-dataset-lifecycle', 'parent_task': 'R2.1.2',
    'decisions': ['D114', 'D115', 'D116', 'D117'], 'depends_on': ['R2.1.1'],
    'executable': True, 'accepted': False,
    'scope': 'QbGraphDataset lifecycle only: central writer API; a writer manages only their own datasets, moderators are read-only, and Super Admin may manage all; enforce D115 size limits, stale-version conflicts and published-question in-use deletion guard.',
    'tables': ['qb_graph_datasets'],
    'routes': [
        {'method': 'GET|HEAD', 'uri': '/writer/graph-datasets', 'roles': ['content_writer', 'content_moderator', 'super_admin']},
        {'method': 'POST', 'uri': '/writer/graph-datasets', 'roles': ['content_writer', 'super_admin']},
        {'method': 'GET|HEAD', 'uri': '/writer/graph-datasets/{id}', 'roles': ['content_writer', 'content_moderator', 'super_admin']},
        {'method': 'PUT', 'uri': '/writer/graph-datasets/{id}', 'roles': ['content_writer', 'super_admin']},
        {'method': 'DELETE', 'uri': '/writer/graph-datasets/{id}', 'roles': ['content_writer', 'super_admin']},
    ],
    'roles': ['content_writer', 'content_moderator', 'super_admin'],
    'done_when': 'Dataset CRUD is central-host-only. Writers manage only their own datasets; moderators can read but never write; Super Admin can manage all. Enforce 50,000 rows, 80 columns, 1,000,000 cells, 2,048 characters per cell, server checksum/version, stale-version conflicts and refusal to delete a dataset referenced by a published question. Parent R2.1.2 remains unchecked; visuals, full format parity and finder are deferred.',
    'deferred': ['full authoring-format and visual-mode parity matrix',
                 'graph/diagram editor and paper-renderer integration',
                 'question finder and calibrated ranking fixtures'],
}, {
    'id': 'R2.1.2-language-curriculum', 'parent_task': 'R2.1.2',
    'decisions': ['D138', 'D139', 'D144', 'D145', 'D149'], 'depends_on': ['R2.1.2'],
    'executable': True, 'accepted': False,
    'scope': 'Versioned arbitrary-depth curriculum for Bangla 1st/2nd and English 1st/2nd papers; separate syllabus locations from question type/exam part; preserve legacy chapter/topic APIs; allow zero or multiple node links; add optional source question number, set and page/reference; Super Admin tree management and searchable writer breadcrumbs across authoring, preview, list and finder. D144/D145 add Super Admin mapping of existing versions to existing class levels, class-specific writer version lookup, legacy unmapped-version fallback, and no automatic changes to existing question/source links. D149 links the existing English 1st Paper subject to Play, Nursery, KG and Classes 1–12 so its version mapping checkboxes cover Play–12; it does not expand existing version mappings or remap questions.',
    'tables': ['qb_curriculum_versions', 'qb_curriculum_nodes', 'qb_question_curriculum_nodes', 'qb_curriculum_version_class_level'],
    'routes': [
        {'method': 'GET', 'uri': '/super/qb/curriculum', 'roles': ['super_admin']},
        {'method': 'POST', 'uri': '/super/qb/{kind}', 'roles': ['super_admin']},
        {'method': 'PUT|DELETE', 'uri': '/super/qb/{kind}/{id}', 'roles': ['super_admin']},
        {'method': 'GET', 'uri': '/writer/curriculum', 'roles': ['content_writer', 'content_moderator', 'super_admin']},
        {'method': 'POST|PUT', 'uri': '/writer/questions[/{id}]', 'roles': ['content_writer', 'super_admin']},
        {'method': 'GET', 'uri': '/writer/questions[/{id}]', 'roles': ['content_writer', 'content_moderator', 'super_admin']},
    ],
    'roles': ['content_writer', 'content_moderator', 'super_admin'],
    'done_when': 'Additive migrations and canonical schema parity; authorized version/node management with same-subject parent validation, arbitrary depth, cycle prevention, bilingual labels and stable ordering; searchable localized writer breadcrumbs; question create/edit/reopen/preview/list/finder round trips for zero, one and multiple curriculum links; optional source occurrence metadata round trip; version-to-class mapping validates subject/class links and rejects overlaps; writer lookup is class-specific with the approved legacy fallback; English 1st Paper is linked to Play, Nursery, KG and Classes 1–12, with selectable version mappings for Play–12 and distinct mappings for classes 6–8, 9–10 and 11–12; existing version mappings and question/source links remain unchanged unless explicitly edited; old chapter/topic endpoints and records remain compatible; bn/en, role/module/tenant, no-answer-leak, data migration rollback and focused regression checks pass. Do not seed unverified textbook content. Record exact evidence in docs/PROGRESS.md.',
    'deferred': ['textbook content seeding', 'R2.1 runtime switch', 'all unrelated R2.1 tasks'],
}, {
    'id': 'R2.1.2-gap-fill-authoring', 'parent_task': 'R2.1.2',
    'decisions': ['D142'], 'depends_on': ['R2.1.2'],
    'executable': True, 'accepted': False,
    'scope': 'Inline structured gap authoring: one continuous question passage, cursor insertion of labeled blanks, and stable per-gap answer, hint and marks mapping through save, reopen and writer preview. Reuse question_text, qb_question_items and existing answer JSON; preserve existing question permissions, student answer isolation and all non-gap behavior.',
    'tables': [], 'routes': [],
    'roles': ['content_writer', 'super_admin'],
    'done_when': 'Supported structured gap questions create, save, reopen, edit and preview inline blanks in stable passage order; existing gap questions remain readable and editable; answer-leak, bilingual/RTL, persistence and focused editor regression checks pass. Record exact evidence in docs/PROGRESS.md.',
    'deferred': ['R2.1 runtime switch', 'all unrelated R2.1 tasks'],
}, {
    'id': 'R2.1.2-graph-tool-viewport', 'parent_task': 'R2.1.2',
    'decisions': ['D146'], 'depends_on': ['R2.1.2'],
    'executable': True, 'accepted': False,
    'scope': 'CSS-only graph-builder viewport layout: keep the builder shell visible, scroll long controls independently, bound the preview height, and tune those bounds for narrow viewports. Preserve graph logic, controls, data, APIs, rendering and qbank assets.',
    'tables': [], 'routes': [],
    'roles': ['content_writer', 'super_admin'],
    'done_when': 'The generated plan is fresh; the pinned vendor manifest exactly matches the graph tool; desktop and narrow viewports show the preview while long controls scroll independently. Record exact evidence in docs/PROGRESS.md.',
    'deferred': ['graph behavior or API changes', 'R2.1 runtime switch', 'all unrelated R2.1 tasks'],
}]


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
    language_slice = next((s for s in APPROVED_EXECUTION_SLICES
                           if s['id'] == 'R2.1.2-language-curriculum'), None)
    gap_slice = next((s for s in APPROVED_EXECUTION_SLICES
                      if s['id'] == 'R2.1.2-gap-fill-authoring'), None)
    expected_objects = {
        'tables': (language_slice['tables'] if language_slice else []) + (gap_slice['tables'] if gap_slice else []),
        'routes': [],
        'modules': [], 'packages': [],
    }
    require(scope.get('authorized_new_objects') == expected_objects,
            'only D139/D145 curriculum tables may be authorized; D142/D146/D149 add no new objects')
    require(scope.get('source_policy') == 'read_only_files_no_db_no_execution', 'source access policy')
    require(scope.get('approved_execution_slices') == APPROVED_EXECUTION_SLICES,
            'approved execution slices must match their owner-approved contracts')
    decisions = (root / 'docs/LOCKED-DECISIONS.md').read_text(encoding='utf-8')
    require(all(f'| {decision} |' in decisions for active in APPROVED_EXECUTION_SLICES
                for decision in active['decisions']),
            'approved slice decisions must precede execution')
    progress = (root / 'docs/PROGRESS.md').read_text(encoding='utf-8')
    require(re.search(r'^- \[x\] R2\.1\.1\b', progress, re.M) is not None,
            'D114-D117 slice prerequisite R2.1.1 must be accepted')
    require(re.search(r'^- \[x\] R2\.1\.2\b', progress, re.M) is not None,
            'D139 language-curriculum prerequisite R2.1.2 must be accepted')
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
            'evidence_note': 'Only the explicit D114-D117 dataset-lifecycle, D138-D149 language-curriculum, D142 gap-authoring, and D146 graph-tool viewport slices are executable; the full imported task scope and runtime switch remain governed by their existing acceptance gates.'}
    lines = ['# R2.1 — generated planning plan (D83)', '',
             '> PLANNING ONLY except for the explicit R2.1.2 D114-D117 dataset-lifecycle, D138-D149 language-curriculum, D142 gap-authoring, and D146 graph-tool viewport slices below. Runtime remains R3; no runtime switch is authorized.',
             '> Generate: `py -3.14 infra/spec-verify/gen_r21_plan.py .`; check: append `--check`.',
             '> Do not edit generated files. Source: `docs/release/r21-scope.json` and `docs/release/r21-gap-map.json`.',
             '', 'Placement: after R3.A, before R4/later; retain existing R1.1/R2 prerequisites.',
             'R2.1.0 requires R3.A. Executable task/schema/API scope and the runtime-switch task require owner refinement.',
             'R2.1.9 is proposed acceptance, not an authorized release switch. R3.A and R2.1.9 alone do not authorize switching.',
             'The upstream qbank repository remains read-only under D109. Target-repository commands/tests are limited to an executable slice and its acceptance checks.', '',
             'Existing route anchors name source declarations in the destination route file, not proposed new URLs.',
             'The imported root proposal, including its complete feature inventory, remains the requirements catalogue.', '']
    for active in scope.get('approved_execution_slices', []):
        routes = '; '.join(f"{r['method']} {r['uri']} ({', '.join(r['roles'])})" for r in active['routes'])
        lines.extend([f"## Approved scoped implementation slice — {active['id']}", '',
                      f"Task: {active['id']} (parent {active['parent_task']}); decisions: {', '.join(active['decisions'])}.",
                      f"Depends on: {', '.join(active['depends_on'])}; status: executable slice, not accepted.",
                      f"Scope: {active['scope']}",
                      f"Authorized table: {', '.join(active['tables'])}.",
                      f"Routes: {routes}.",
                      f"Roles: {', '.join(active['roles'])}.",
                      f"Done when: {active['done_when']}",
                      f"Deferred from the parent task: {'; '.join(active['deferred'])}.",
                      'The parent R2.1.2 task remains unchecked until its complete D114 acceptance scope is passed.', ''])
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
                  'No R2.1 runtime/module switch, source-repository writes or feature acceptance are authorized.', ''])
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
        print(f"PASS R2.1 planning: 10 blocked parent tasks plus {len(load(args.root)[0]['approved_execution_slices'])} owner-approved scoped slices, all capability/acceptance mappings; " +
              ('generated artifacts fresh' if args.check else 'generated artifacts written'))
        return 0
    except (ValueError, KeyError, TypeError, OSError, IndexError) as exc:
        print(f'FAIL R2.1 planning: {exc}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
