"""D90 approved target contract; no runtime permissions are installed by this tool."""
from pathlib import Path
import hashlib
import json
import re
import sys

SOURCE = 'owner/department-staff-permission-proposal.json'
OUTPUT = 'docs/department-permission-contract.json'
# Semantic JSON digest of the exact matrix the owner approved in d7d9a23.
APPROVED_DIGEST = 'a0f636c5dffe6d6de5cf36fa8e01c6e758d8dcbb18bf2b8375fdc0d058f28a0d'


def build(root):
    root = Path(root)
    source = json.loads((root / SOURCE).read_text(encoding='utf-8'))
    semantic = json.dumps(source, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    if hashlib.sha256(semantic).hexdigest() != APPROVED_DIGEST:
        raise ValueError('approved D90 source matrix changed; a new owner decision is required')
    decisions = (root / 'docs/LOCKED-DECISIONS.md').read_text(encoding='utf-8')
    if not re.search(r'^\| D90 \|[^\n]*d7d9a23', decisions, re.M):
        raise ValueError('D90 owner approval/source commit missing')
    plan = json.loads((root / 'docs/release/r3-plan.json').read_text(encoding='utf-8'))
    tasks = {t['id']: t for t in plan['tasks']}
    if tasks['R3.6a']['depends_on'] != ['R3.6'] or tasks['R3.6b']['depends_on'] != ['R3.6a'] or tasks['R3.7']['depends_on'] != ['R3.6b']:
        raise ValueError('approved task dependency order changed')
    if len(tasks['R3.6a']['tables']) != 6 or len(tasks['R3.6a']['routes']) != 20 or len(tasks['R3.6b']['routes']) != 2:
        raise ValueError('D90 requires six foundation tables and twenty/two planned routes')
    rows = []
    for original in source['routes']:
        row = dict(original)
        row['staff_mode'] = row.pop('proposed_staff_mode')
        row['permission_options'] = row.pop('proposed_permission_options')
        row['selector_variants'] = [dict(v) for v in original['selector_variants']]
        for variant in row['selector_variants']:
            variant['permission'] = variant.pop('proposed_permission')
        row['approval'] = 'D90'
        rows.append(row)
    planned = []
    for task_id in ('R3.6a', 'R3.6b'):
        for route in tasks[task_id]['routes']:
            path = route.split(' -> ', 1)[0].split(' ', 1)[1]
            mode = ('central_pending_registration' if path.startswith('/public/') else
                    'central_super_admin' if path.startswith('/super/') else
                    'bound_pending_staff_activation' if path == '/auth/activate' else
                    'active_identity_own_profile' if path == '/staff/profile' else
                    'own_active_department_context' if path.startswith('/staff/departments') else
                    'tenant_principal_only')
            planned.append({'task': task_id, 'route': route, 'required_boundary': mode, 'approval': 'D90', 'runtime_verified': False})
    contract = {
        'status': 'APPROVED_TARGET_CONTRACT_NOT_RUNTIME_PROOF', 'decision': 'D90',
        'approved_source_commit': 'd7d9a23c0b51b7f323b86190bfa0cc42510f12ef',
        'source': SOURCE, 'source_semantic_sha256': APPROVED_DIGEST,
        'current_route_entry_count': len(rows), 'mode_counts': source['mode_counts'],
        'runtime_permissions_installed': False, 'routes': rows, 'planned_foundation_routes': planned,
    }
    # One route per line keeps the complete review contract inspectable in Git.
    lines = ['{']
    for key, value in contract.items():
        if isinstance(value, list):
            lines.append('  ' + json.dumps(key) + ': [')
            lines.extend('    ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) + (',' if i < len(value) - 1 else '') for i, row in enumerate(value))
            lines.append('  ]' + (',' if key != 'planned_foundation_routes' else ''))
        else:
            lines.append('  ' + json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=False) + ',')
    return '\n'.join(lines + ['}', ''])


def main():
    root = Path(next((a for a in sys.argv[1:] if not a.startswith('--')), Path(__file__).resolve().parents[2]))
    try:
        expected = build(root)
    except (ValueError, KeyError) as error:
        print('FAIL D90 contract:', error)
        return 1
    path = root / OUTPUT
    if '--check' in sys.argv:
        if not path.exists() or path.read_text(encoding='utf-8') != expected:
            print('FAIL D90 contract is stale; run gen_department_contract.py .')
            return 1
        print('PASS D90 contract fresh: 297 approved current routes + 22 planned routes; no runtime proof')
    else:
        path.write_text(expected, encoding='utf-8', newline='\n')
        print('wrote', OUTPUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
