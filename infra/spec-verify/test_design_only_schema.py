"""D98/D99 mutations: design classification must not hide ordinary inventory defects."""
import re
import sys
import unittest
import sqlite3
import hashlib
import json
from pathlib import Path

from schema_inventory import DESIGN_ONLY, inventory, documentation_problems, operational_schema
import tenant_export_ref

ROOT = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]


class DesignOnlyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = (ROOT/'docs/database/schema.sql').read_text(encoding='utf-8')
        cls.migrations = (ROOT/'docs/database/migrations.md').read_text(encoding='utf-8')
        cls.database = (ROOT/'docs/DATABASE.md').read_text(encoding='utf-8')

    def test_exact_trio_is_validated_but_not_operational(self):
        all_tables, deployed, design = inventory(self.schema)
        self.assertEqual(set(DESIGN_ONLY), design)
        self.assertEqual(all_tables, deployed | design)
        self.assertFalse(deployed & design)
        self.assertEqual([], documentation_problems(self.schema, self.migrations, self.database))
        self.assertEqual((deployed, deployed, set()), inventory(operational_schema(self.schema)))

    def test_missing_unknown_duplicate_or_malformed_markers_fail(self):
        marker = '-- @design-only D98: leave_substitution_slots'
        for changed in [self.schema.replace(marker, ''), self.schema.replace(marker, marker+'\n'+marker),
                        self.schema.replace(marker, marker.replace('D98', 'D99')),
                        self.schema+'\n-- @design-only D98: users\n']:
            with self.subTest(changed=changed[-80:]), self.assertRaises(ValueError):
                inventory(changed)

    def test_missing_or_duplicate_design_definition_fails(self):
        removed = re.sub(r'CREATE TABLE leave_substitution_events \(.*?\n\);', '', self.schema, flags=re.S)
        for changed in [removed, self.schema+'\nCREATE TABLE users (\n id INT\n);']:
            with self.assertRaises(ValueError): inventory(changed)

    def test_ordinary_missing_and_extra_migrations_still_fail(self):
        for changed in [self.migrations.replace('create_students_table', 'students_missing'),
                        self.migrations+'\ncreate_unapproved_table',
                        self.migrations+'\ncreate_leave_substitution_slots_table']:
            self.assertTrue(documentation_problems(self.schema, changed, self.database))

    def test_ordinary_or_design_documentation_cannot_disappear(self):
        self.assertTrue(documentation_problems(self.schema, self.migrations, self.database.replace('`students`', 'students')))
        self.assertTrue(documentation_problems(self.schema, self.migrations, self.database.replace('`leave_substitution_slots`', 'leave_substitution_slots')))
        self.assertTrue(documentation_problems(self.schema, self.migrations.replace('`leave_substitution_events`', 'leave_substitution_events'), self.database))

    def test_operational_reference_to_design_table_fails(self):
        changed = self.schema.replace('CREATE TABLE users (', 'CREATE TABLE users (\n FOREIGN KEY (id) REFERENCES leave_substitution_slots(id),')
        with self.assertRaises(ValueError): inventory(changed)
        changed = self.schema+'\nALTER TABLE users ADD FOREIGN KEY (id) REFERENCES leave_substitution_slots(id);'
        with self.assertRaises(ValueError): inventory(changed)

    def test_ordinary_schema_without_design_definitions_remains_supported(self):
        self.assertEqual(({'users'}, {'users'}, set()), inventory('CREATE TABLE users (\n id INT\n);'))

    def test_export_lists_design_separately_without_export_or_import_rows(self):
        con, data, tables, *rest = tenant_export_ref.build_export_map(str(ROOT))
        try:
            self.assertEqual(sorted(DESIGN_ONLY), data['design_only_tables'])
            self.assertFalse(DESIGN_ONLY & set(data['order']))
            self.assertFalse(DESIGN_ONLY & set(data['tables']))
            self.assertFalse(DESIGN_ONLY & set(tables))
            self.assertIn('students', data['order'])
            self.assertIn('institution_registrations', data['excluded'])
        finally:
            con.close()

    def test_receipt_marker_and_definition_cannot_disappear(self):
        for changed in [self.schema.replace('-- @design-only D99: leave_substitution_operations', ''),
                        re.sub(r'-- @design-only D99: leave_substitution_operations\nCREATE TABLE leave_substitution_operations \(.*?\n\);', '', self.schema, flags=re.S),
                        self.schema.replace('-- @design-only D99: leave_substitution_operations', '-- @design-only D98: leave_substitution_operations')]:
            with self.assertRaises(ValueError):
                inventory(changed)


class ReceiptDesignTests(unittest.TestCase):
    """Executable design model over the three real definitions; not HTTP/MySQL proof."""

    def setUp(self):
        self.con = sqlite3.connect(':memory:')
        self.addCleanup(self.con.close)
        self.con.execute('PRAGMA foreign_keys=ON')
        self.con.execute('CREATE TABLE institutions(id INTEGER PRIMARY KEY)')
        for name in ['users', 'institution_departments', 'teachers', 'leave_applications', 'routines']:
            self.con.execute(f'CREATE TABLE {name}(id INTEGER PRIMARY KEY, institution_id INTEGER NOT NULL, UNIQUE(id,institution_id))')
        schema = (ROOT/'docs/database/schema.sql').read_text(encoding='utf-8')
        for name in ['leave_substitution_slots', 'leave_substitution_operations', 'leave_substitution_events']:
            ddl = re.search(r'CREATE TABLE '+name+r' \(.*?\n\);', schema, re.S).group()
            ddl = re.sub(r'ENUM\([^)]*\)', 'TEXT', ddl)
            ddl = ddl.replace('BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
            ddl = re.sub(r'\b(BIGINT|INT|SMALLINT) UNSIGNED\b', r'\1', ddl)
            ddl = re.sub(r'UNIQUE KEY\s+\w+\s*\(', 'UNIQUE (', ddl)
            ddl = re.sub(r',?\s*\n\s*INDEX\s+\w+\s*\([^)]*\)', '', ddl)
            self.con.execute(ddl)
        for tenant in [1, 2]:
            self.con.execute('INSERT INTO institutions VALUES(?)', (tenant,))
            for table in ['users', 'institution_departments', 'teachers', 'leave_applications', 'routines']:
                for offset in [0, 10]:
                    self.con.execute(f'INSERT INTO {table} VALUES(?,?)', (tenant+offset, tenant))
        for slot, leave, routine in [(1, 1, 1), (2, 11, 11)]:
            self.con.execute("INSERT INTO leave_substitution_slots(id,institution_id,leave_application_id,routine_id,original_teacher_id,occurrence_date,source_start_time,source_end_time) VALUES(?,1,?,?,1,'2030-01-01','09:00','10:00')", (slot, leave, routine))
        self.con.commit()

    @staticmethod
    def envelope(**changes):
        value = dict(format='leave-substitution-v1', action='review', resource=dict(type='leave', id='1'),
                     context=dict(institution_id='1', user_id='1', department_id=None),
                     payload=dict(targets=['1', '2']), expected_versions=dict(slots=[['1', '1'], ['2', '1']]))
        value.update(changes)
        return value

    @staticmethod
    def digest(value):
        return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

    def operation(self, key, envelope, slots, fail=False, stale=False, tenant=1, actor=1):
        """Minimal proposed ordering, deliberately independent of future runtime services."""
        digest = self.digest(envelope)
        with self.con:
            prior = self.con.execute('SELECT id,payload_sha256 FROM leave_substitution_operations WHERE institution_id=? AND user_id=? AND idempotency_key_sha256=?', (tenant, actor, self.digest(['leave-substitution-key-v1', key]))).fetchone()
            if prior:
                if prior[1] != digest:
                    raise ValueError('key_payload_conflict')
                return prior[0]
            if stale:
                raise ValueError('stale_version')
            op = self.con.execute("INSERT INTO leave_substitution_operations(institution_id,user_id,action,idempotency_key_sha256,payload_sha256,result_code,result_http_status,result_slot_count) VALUES(?,?,'review',?,?,'applied',200,?)", (tenant, actor, self.digest(['leave-substitution-key-v1', key]), digest, len(slots))).lastrowid
            for slot in slots:
                version = self.con.execute('SELECT version FROM leave_substitution_slots WHERE id=?', (slot,)).fetchone()[0]+1
                self.con.execute('UPDATE leave_substitution_slots SET version=? WHERE id=?', (version, slot))
                self.event(op, slot, version, actor, tenant, digest)
                if fail:
                    raise ValueError('forced_failure')
            return op

    def event(self, op, slot, version, actor=1, tenant=1, digest='a'*64):
        self.con.execute("INSERT INTO leave_substitution_events(leave_substitution_operation_id,institution_id,leave_substitution_slot_id,leave_application_id,version,event_type,user_id,original_teacher_id,occurrence_date,source_start_time,source_end_time,idempotency_key,payload_sha256) VALUES(?,?,?,?,?,'offer_created',?,1,'2030-01-01','09:00','10:00',?,?)", (op, tenant, slot, 1 if slot == 1 else 11, version, actor, self.digest(['leave-substitution-event-v1', str(tenant), str(actor), str(op), str(slot)]), digest))

    def test_multi_leave_fanout_replays_before_stale_check(self):
        op = self.operation('request', self.envelope(), [1, 2])
        self.assertEqual(op, self.operation('request', self.envelope(), [1, 2], stale=True))
        self.assertEqual(2, self.con.execute('SELECT COUNT(*) FROM leave_substitution_events').fetchone()[0])
        self.assertEqual([(2,), (2,)], self.con.execute('SELECT version FROM leave_substitution_slots ORDER BY id').fetchall())
        self.assertEqual(2, self.con.execute('SELECT result_slot_count FROM leave_substitution_operations WHERE id=?', (op,)).fetchone()[0])

    def test_same_key_changed_action_resource_context_payload_or_version_fails(self):
        self.operation('request', self.envelope(), [1])
        changes = [dict(action='accept'), dict(resource=dict(type='leave', id='11')),
                   dict(context=dict(institution_id='1', user_id='1', department_id='1')),
                   dict(payload=dict(targets=['2'])), dict(expected_versions=dict(slots=[['2', '2']]))]
        for change in changes:
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'key_payload_conflict'):
                self.operation('request', self.envelope(**change), [2])
        self.assertEqual(1, self.con.execute('SELECT COUNT(*) FROM leave_substitution_events').fetchone()[0])

    def test_zero_slot_success_has_receipt_and_no_event(self):
        op = self.operation('empty', self.envelope(), [])
        self.assertEqual(op, self.operation('empty', self.envelope(), [], stale=True))
        self.assertEqual(0, self.con.execute('SELECT COUNT(*) FROM leave_substitution_events').fetchone()[0])

    def test_partial_fanout_failure_rolls_back_receipt_events_and_projection(self):
        with self.assertRaisesRegex(ValueError, 'forced_failure'):
            self.operation('request', self.envelope(), [1, 2], fail=True)
        for table in ['leave_substitution_operations', 'leave_substitution_events']:
            self.assertEqual(0, self.con.execute('SELECT COUNT(*) FROM '+table).fetchone()[0])
        self.assertEqual([(1,), (1,)], self.con.execute('SELECT version FROM leave_substitution_slots ORDER BY id').fetchall())
        self.operation('request', self.envelope(), [1, 2])

    def test_receipt_uniqueness_and_tenant_actor_event_binding(self):
        op = self.operation('request', self.envelope(), [])
        self.assertNotEqual(op, self.operation('request', self.envelope(), [], tenant=2, actor=2))
        self.assertNotEqual(op, self.operation('request', self.envelope(), [], actor=11))
        for actor, tenant in [(2, 2), (11, 1)]:
            with self.assertRaises(sqlite3.IntegrityError), self.con:
                self.event(op, 1, 2, actor, tenant)
        with self.assertRaises(sqlite3.IntegrityError), self.con:
            self.con.execute("INSERT INTO leave_substitution_operations(institution_id,user_id,action,idempotency_key_sha256,payload_sha256,result_code,result_http_status,result_slot_count) VALUES(1,1,'review',?,'x','applied',200,0)", (self.digest(['leave-substitution-key-v1', 'request']),))

    def test_one_event_per_operation_slot_and_per_slot_version(self):
        op = self.operation('request', self.envelope(), [1])
        with self.assertRaises(sqlite3.IntegrityError), self.con:
            self.event(op, 1, 3)
        other = self.operation('another', self.envelope(), [])
        with self.assertRaises(sqlite3.IntegrityError), self.con:
            self.event(other, 1, 2)


if __name__ == '__main__':
    unittest.main()
