"""D90 contract/freshness/mutation and SQLite schema checks; no app/test DB access."""
from pathlib import Path
import ast
import json
import shutil
import sqlite3
import tempfile
import unittest

import gen_department_contract as contract
import plan_check

ROOT = Path(__file__).resolve().parents[2]


class ApprovedContractTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='d90-contract-')
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        for name in (contract.SOURCE, 'docs/LOCKED-DECISIONS.md', 'docs/release/r3-plan.json'):
            dest = self.root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dest)

    def change_plan(self, edit):
        path = self.root / 'docs/release/r3-plan.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        edit({t['id']: t for t in data['tasks']})
        path.write_text(json.dumps(data), encoding='utf-8')

    def test_exact_approved_contract_is_deterministic_and_fresh(self):
        expected = contract.build(self.root)
        self.assertEqual(expected, contract.build(self.root))
        self.assertEqual(expected, (ROOT / contract.OUTPUT).read_text(encoding='utf-8'))
        data = json.loads(expected)
        self.assertFalse(data['runtime_permissions_installed'])
        self.assertEqual(297, len(data['routes']))
        self.assertEqual(22, len(data['planned_foundation_routes']))
        self.assertTrue(all(r['approval'] == 'D90' for r in data['routes']))
        self.assertTrue(all(not r['runtime_verified'] for r in data['planned_foundation_routes']))

    def test_wildcard_source_mutation_is_not_approved_by_regeneration(self):
        path = self.root / contract.SOURCE
        data = json.loads(path.read_text(encoding='utf-8'))
        data['routes'][0]['proposed_permission_options'] = ['staff.*']
        path.write_text(json.dumps(data), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'source matrix changed'):
            contract.build(self.root)

    def test_missing_owner_decision_cannot_install_a_contract(self):
        path = self.root / 'docs/LOCKED-DECISIONS.md'
        path.write_text('\n'.join(l for l in path.read_text(encoding='utf-8').splitlines() if not l.startswith('| D90 |')), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'owner approval'):
            contract.build(self.root)

    def test_dependency_bypass_is_rejected(self):
        self.change_plan(lambda ts: ts['R3.7'].update(depends_on=['R3.6']))
        with self.assertRaisesRegex(ValueError, 'dependency order'):
            contract.build(self.root)

    def test_missing_activation_table_is_rejected(self):
        self.change_plan(lambda ts: ts['R3.6a']['tables'].pop())
        with self.assertRaisesRegex(ValueError, 'six foundation tables'):
            contract.build(self.root)

    def test_missing_resend_route_is_rejected(self):
        self.change_plan(lambda ts: ts['R3.6a']['routes'].pop())
        with self.assertRaisesRegex(ValueError, 'twenty/two planned routes'):
            contract.build(self.root)

    def test_dynamic_actions_never_gain_an_unconditional_permission(self):
        data = json.loads(contract.build(self.root))
        rows = [r for r in data['routes'] if '{action}' in r['uri']]
        self.assertEqual(4, len(rows))
        for row in rows:
            self.assertEqual([], row['permission_options'])
            self.assertTrue(row['selector_variants'])
        advances = next(r for r in rows if r['action'].endswith('SalaryAdvanceController@transition'))
        self.assertEqual(['disburse'], [v['value'] for v in advances['selector_variants'] if not v['principal_only']])


class ActivationSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = plan_check.load(str(ROOT))
        self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute("INSERT INTO institutions(id,name,slug,status) VALUES (1,'One','d90-one','inactive'),(2,'Two','d90-two','inactive')")
        self.db.execute("INSERT INTO users(id,institution_id,name,password,role,is_active) VALUES (11,1,'One','fixture','admin',0),(22,2,'Two','fixture','admin',0),(33,NULL,'Central','fixture','super_admin',1)")

    def registration(self, institution, user):
        self.db.execute("INSERT INTO institution_registrations(institution_id,first_admin_id,source,review_status) VALUES (?,?,'public','pending')", (institution, user))

    def activation(self, institution=1, user=11, public='same-opaque-id', generation=1, purpose='principal_activation', token=None):
        self.db.execute("INSERT INTO account_activation_requests(institution_id,user_id,public_id,purpose,generation,channel,contact_hash,otp_token_id,status,expires_at) VALUES (?,?,?,?,?,'phone',?,?,'pending','2026-10-16 12:00:00')", (institution, user, public, purpose, generation, '0' * 64, token))

    def test_one_first_principal_per_institution_but_two_tenants_allowed(self):
        self.registration(1, 11)
        self.registration(2, 22)
        with self.assertRaises(sqlite3.IntegrityError):
            self.registration(1, 11)

    def test_first_principal_and_activation_user_are_tenant_bound(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.registration(1, 22)
        with self.assertRaises(sqlite3.IntegrityError):
            self.activation(user=22)
        with self.assertRaises(sqlite3.IntegrityError):
            self.activation(user=33)

    def test_public_ids_are_unique_per_tenant_not_globally(self):
        self.activation()
        self.activation(2, 22)
        with self.assertRaises(sqlite3.IntegrityError):
            self.activation(generation=2)

    def test_generations_cannot_repeat_for_same_tenant_user_purpose(self):
        self.activation()
        with self.assertRaises(sqlite3.IntegrityError):
            self.activation(public='different-id')
        self.activation(public='different-purpose', purpose='contact_change')
        self.activation(public='next-generation', generation=2)

    def test_orphan_token_fk_rejected_but_token_owner_is_a_service_obligation(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.activation(token=999)
        # The approved FK references token existence only; it is not evidence of user/purpose binding.
        self.db.execute("INSERT INTO otp_tokens(id,user_id,otp,expires_at) VALUES (44,22,'fixture','2026-10-16 12:00:00')")
        self.activation(token=44)
        self.assertEqual(1, self.db.execute('SELECT COUNT(*) FROM account_activation_requests').fetchone()[0])

    def test_d12_exact_registration_key_does_not_exempt_global_student_codes(self):
        # Exercise the actual checker without importing/running the entire verifier.
        source = ast.parse((ROOT / 'infra/spec-verify/verify.py').read_text(encoding='utf-8'))
        definitions = [node for node in source.body if
                       isinstance(node, ast.FunctionDef) and node.name in ('uniq', 'cols') or
                       isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'INTENDED_GLOBAL' for t in node.targets)]
        check = next(node for node in source.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'glob_unique' for t in node.targets))
        context = {'con': self.db, 'tabs': [r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")]}
        exec(compile(ast.Module(body=definitions, type_ignores=[]), '<D12 definitions>', 'exec'), context)
        expression = compile(ast.Module(body=[check], type_ignores=[]), '<D12 check>', 'exec')
        exec(expression, context)
        self.assertEqual([], context['glob_unique'])
        self.db.execute('CREATE UNIQUE INDEX deliberately_global_student_code ON students(student_id)')
        exec(expression, context)
        self.assertEqual([('students', ['student_id'])], context['glob_unique'])


if __name__ == '__main__':
    unittest.main()
