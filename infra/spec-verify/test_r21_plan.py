#!/usr/bin/env python3
"""D83 planning mutation/freshness tests; no source execution or database access."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import gen_r21_plan as G

ROOT = Path(__file__).resolve().parents[2]


class R21PlanningTests(unittest.TestCase):
    def setUp(self):
        self.scope, self.gaps = G.load(ROOT)

    def reject(self, edit, expected):
        edit(self.scope, self.gaps)
        errors = G.validate(ROOT, self.scope, self.gaps)
        self.assertTrue(any(expected in e for e in errors), errors)

    def test_current_plan_is_deterministic_and_fresh(self):
        self.assertEqual([], G.validate(ROOT, self.scope, self.gaps))
        outputs = G.build(ROOT)
        self.assertEqual(outputs, G.build(ROOT))
        for path, text in zip(G.OUTPUTS, outputs):
            self.assertEqual(text, (ROOT / path).read_text(encoding='utf-8'))

    def test_implementation_flag_cannot_activate_work(self):
        self.reject(lambda s, g: s.update(implementation_authorized=True), 'implementation authorization')

    def test_d114_d117_dataset_slice_contract_is_preserved(self):
        slice_ = self.scope['approved_execution_slices'][0]
        self.assertEqual('R2.1.2', slice_['parent_task'])
        self.assertEqual(['R2.1.1'], slice_['depends_on'])
        self.assertEqual(['qb_graph_datasets'], slice_['tables'])
        self.assertFalse(slice_['accepted'])
        self.assertFalse(self.scope['runtime_switch']['authorized'])
        self.assertTrue(all(not task['executable'] for task in self.scope['tasks']))

    def test_d139_language_curriculum_is_a_separate_approved_slice(self):
        slice_ = self.scope['approved_execution_slices'][1]
        self.assertEqual('R2.1.2-language-curriculum', slice_['id'])
        self.assertEqual(['D138', 'D139', 'D144', 'D145'], slice_['decisions'])
        self.assertEqual(['R2.1.2'], slice_['depends_on'])
        self.assertEqual(['qb_curriculum_versions', 'qb_curriculum_nodes',
                          'qb_question_curriculum_nodes',
                          'qb_curriculum_version_class_level'], slice_['tables'])
        self.assertFalse(slice_['accepted'])
        self.assertEqual(['qb_curriculum_versions', 'qb_curriculum_nodes',
                          'qb_question_curriculum_nodes',
                          'qb_curriculum_version_class_level'],
                         self.scope['authorized_new_objects']['tables'])
        self.assertFalse(self.scope['runtime_switch']['authorized'])

    def test_d146_graph_tool_viewport_is_css_only_and_separate(self):
        slice_ = next(s for s in self.scope['approved_execution_slices']
                      if s['id'] == 'R2.1.2-graph-tool-viewport')
        self.assertEqual(['D146'], slice_['decisions'])
        self.assertEqual(['R2.1.2'], slice_['depends_on'])
        self.assertEqual([], slice_['tables'])
        self.assertEqual([], slice_['routes'])
        self.assertIn('CSS-only graph-builder viewport layout', slice_['scope'])
        self.assertFalse(slice_['accepted'])
        self.assertFalse(self.scope['runtime_switch']['authorized'])

    def test_approved_slice_cannot_gain_objects_or_scope(self):
        self.scope['approved_execution_slices'][0]['tables'].append('invented')
        errors = G.validate(ROOT, self.scope, self.gaps)
        self.assertTrue(any('approved execution slice' in e for e in errors), errors)

    def test_runtime_switch_remains_unapproved_even_after_acceptance(self):
        self.reject(lambda s, g: s['runtime_switch'].update(authorized=True), 'runtime switch')

    def test_switch_task_cannot_be_invented(self):
        self.reject(lambda s, g: s['runtime_switch'].update(task_id='R2.1.0'), 'runtime switch')

    def test_r3_acceptance_is_a_hard_dependency(self):
        self.reject(lambda s, g: s['tasks'][0].update(depends_on=[]), 'dependencies')

    def test_intermediate_dependency_cannot_be_bypassed(self):
        self.reject(lambda s, g: s['tasks'][6].update(depends_on=['R2.1.2']), 'dependencies')

    def test_imported_task_order_cannot_change(self):
        self.reject(lambda s, g: s['tasks'].reverse(), 'IDs/order')

    def test_no_task_can_be_checked_off_or_made_executable(self):
        for field in ('accepted', 'executable'):
            with self.subTest(field=field):
                scope = copy.deepcopy(self.scope)
                scope['tasks'][2][field] = True
                self.assertTrue(any('non-executable' in e for e in G.validate(ROOT, scope, self.gaps)))

    def test_every_blocker_must_be_retained(self):
        self.reject(lambda s, g: s['tasks'][3].update(blocked_by=[]), 'blockers')

    def test_unknown_capability_and_role_are_rejected(self):
        self.reject(lambda s, g: s['tasks'][3].update(capabilities=['invented']), 'capability mapping')
        self.scope, self.gaps = G.load(ROOT)
        self.reject(lambda s, g: s['tasks'][3].update(roles=['invented']), 'canonical roles')

    def test_omitted_release_acceptance_is_rejected(self):
        self.reject(lambda s, g: s['tasks'][9]['acceptance_ids'].remove('AC26'), 'all imported release acceptance')

    def test_planning_cannot_close_a_gate(self):
        self.reject(lambda s, g: g['gates'][0].update(status='closed'), 'gates must remain open')

    def test_provenance_and_source_policy_are_preserved(self):
        self.reject(lambda s, g: g.update(imported_draft_sha256='0' * 64), 'provenance')
        self.scope, self.gaps = G.load(ROOT)
        self.reject(lambda s, g: s.update(source_policy='execute_tests'), 'source access policy')

    def test_new_objects_and_fake_existing_route_are_rejected(self):
        self.reject(lambda s, g: s['authorized_new_objects']['tables'].append('new_table'), 'only D139/D145')
        self.scope, self.gaps = G.load(ROOT)
        self.reject(lambda s, g: s['tasks'][1]['existing_route_anchors'].append(
            'api/routes/api.php::InventedController::publish'), 'existing route')

    def test_future_fixture_command_cannot_appear_as_approved(self):
        self.reject(lambda s, g: s['tasks'][3].update(future_fixture_command='invented'), 'not approved')

    def test_runtime_and_instruction_drift_are_rejected_without_file_writes(self):
        read = Path.read_text
        probes = [
            ('api/config/release.php', "'R3'", "'R2.1'", 'runtime remains R3'),
            ('api/config/release.php', "'students'", "'invented'", 'exact R3 module'),
            ('AGENTS.md', 'AGENT-PLAN-R2.1.md', 'removed-plan-pointer', 'instruction/placement alignment')]
        for path, before, after, expected in probes:
            with self.subTest(path=path, expected=expected):
                def altered(p, *args, **kwargs):
                    text = read(p, *args, **kwargs)
                    return text.replace(before, after) if p == ROOT / path else text
                with patch.object(Path, 'read_text', altered):
                    errors = G.validate(ROOT, self.scope, self.gaps)
                self.assertTrue(any(expected in e for e in errors), errors)

    def test_check_mode_rejects_stale_output_without_writing(self):
        with tempfile.TemporaryDirectory(prefix='r21plan_') as tmp:
            root = Path(tmp)
            paths = {G.SCOPE, G.GAPS, 'RELEASE-2.1.md', 'docs/LOCKED-DECISIONS.md', 'docs/PROGRESS.md', *G.OUTPUTS, *G.ENTRY_POINTS,
                     'api/config/release.php', 'docs/release/r3-scope.json'}
            paths.update(p for t in self.scope['tasks'] for p in t['existing_entities'])
            paths.update(a.split('::')[0] for t in self.scope['tasks'] for a in t['existing_route_anchors'])
            for path in paths:
                dest = root / path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((ROOT / path).read_bytes())
            output = root / G.OUTPUTS[0]
            output.write_text('stale\n', encoding='utf-8')
            run = subprocess.run([sys.executable, str(Path(G.__file__)), str(root), '--check'],
                                 capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(1, run.returncode, run.stdout + run.stderr)
            self.assertIn('stale R2.1', run.stdout)
            self.assertEqual('stale\n', output.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
