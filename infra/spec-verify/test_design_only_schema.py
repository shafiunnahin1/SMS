"""D98 mutations: design classification must not hide ordinary inventory defects."""
import re
import sys
import unittest
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

    def test_exact_pair_is_validated_but_not_operational(self):
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


if __name__ == '__main__':
    unittest.main()
