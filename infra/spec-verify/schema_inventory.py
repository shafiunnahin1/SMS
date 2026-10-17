"""D98/D99: strict canonical design-only classification, never deployment authorization."""
import re
from pathlib import Path

MARKERS = {'leave_substitution_slots': 'D98', 'leave_substitution_events': 'D98',
           'leave_substitution_operations': 'D99'}
DESIGN_ONLY = frozenset(MARKERS)
SECTION = '## Design-only tables (D98/D99)'


def inventory(schema):
    clean = re.sub(r'--[^\n]*', '', schema)
    names = re.findall(r'^CREATE TABLE (\w+)\s*\(', clean, re.M)
    if len(names) != len(set(names)):
        raise ValueError('duplicate CREATE TABLE')
    pairs = re.findall(r'^-- @design-only (D\d+): (\w+)\r?$', schema, re.M)
    markers = [name for decision, name in pairs]
    if any(MARKERS.get(name) != decision for decision, name in pairs):
        raise ValueError('unknown design-only table or incorrect decision marker')
    raw = [line for line in schema.splitlines() if '@design-only' in line]
    if len(markers) != len(raw) or len(markers) != len(set(markers)):
        raise ValueError('malformed or duplicate design-only marker')
    design = set(markers)
    expected = set(names) & DESIGN_ONLY
    if design != expected or (expected and expected != DESIGN_ONLY):
        raise ValueError('exact D99 trio must exist and be marked; no other design-only names allowed')
    for name in design:
        if not re.search(r'^-- @design-only '+MARKERS[name]+r': '+name+r'\r?\nCREATE TABLE '+name+r'\s*\(', schema, re.M):
            raise ValueError('design-only marker must immediately precede its table')
    deployed = set(names) - design
    for name, body in re.findall(r'^CREATE TABLE (\w+)\s*\((.*?)\n\);', clean, re.M | re.S):
        if name in deployed and set(re.findall(r'REFERENCES\s+(\w+)\s*\(', body)) & design:
            raise ValueError('operational table references a design-only table')
    for name, statement in re.findall(r'^ALTER TABLE (\w+)\b([^;]*);', clean, re.M | re.S):
        if name in deployed and set(re.findall(r'REFERENCES\s+(\w+)\s*\(', statement)) & design:
            raise ValueError('operational ALTER references a design-only table')
    return set(names), deployed, design


def operational_schema(schema):
    _, _, design = inventory(schema)
    for name in design:
        schema = re.sub(r'^-- @design-only '+MARKERS[name]+r': '+name+r'\r?\nCREATE TABLE '+name+r'\s*\(.*?\n\);', '', schema, flags=re.M | re.S)
    return schema


def documentation_problems(schema, migrations, database):
    all_tables, deployed, design = inventory(schema)
    problems = []
    migrated = set(re.findall(r'create_(\w+?)_table', migrations))
    if migrated != deployed:
        problems.append(f'migration inventory missing={sorted(deployed-migrated)} extra={sorted(migrated-deployed)}')
    for label, text in [('migrations', migrations), ('DATABASE', database)]:
        match = re.search(re.escape(SECTION)+r'\n(.*?)(?=\n## |\Z)', text, re.S)
        listed = set(re.findall(r'`(\w+)`', match.group(1))) if match else set()
        if listed != design:
            problems.append(label+' design-only section must list exactly the marked tables')
    operational_docs = database[:match.start()] + database[match.end():] if match else database
    documented = set(re.findall(r'`(\w+)`', operational_docs))
    if not deployed <= documented or design & documented:
        problems.append('DATABASE operational grouping missing deployed tables or includes design-only tables')
    return problems


def read_inventory(root):
    return inventory((Path(root)/'docs/database/schema.sql').read_text(encoding='utf-8'))
