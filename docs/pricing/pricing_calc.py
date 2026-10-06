# -*- coding: utf-8 -*-
"""docs/pricing/pricing_calc.py - the ONE place prices are computed (the client PDFs and the checks both use it), plus an INDEPENDENT recomputation (exact fractions) used as a self-test.
Decision D47: NO size tiers, NO base fee, NO multiplier. Every module has ONE price for everyone.
   monthly price of a module  = round_half_up( override_monthly or class_price , round_to )          (modules of the foundation, base_included = yes: 0)
   required companions        = the modules a module cannot work without (modules.csv `requires`, transitively); they are added to a quote and priced like any other module
   monthly total              = sum of the prices of the chosen modules + their required companions
   annual total               = monthly total x 12 x (1 - annual_discount_percent/100), rounded half-up to a whole taka"""
import os, csv, json
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
HERE = os.path.dirname(os.path.abspath(__file__))

def load():
    S = json.load(open(os.path.join(HERE, 'settings.json'), encoding='utf-8'))
    rows = list(csv.DictReader(open(os.path.join(HERE, 'modules.csv'), encoding='utf-8-sig')))
    return S, {r['key']: r for r in rows}

def requires_of(row): return [x.strip() for x in (row.get('requires') or '').split(',') if x.strip()]

def closure(mods, keys):
    """(ordered list of all modules, set of the ones that were ADDED as required companions) - the requested ones first, companions after."""
    out = list(dict.fromkeys(keys)); added = set(); i = 0
    while i < len(out):
        for d in requires_of(mods[out[i]]):
            if d not in out: out.append(d); added.add(d)
        i += 1
    return out, added

def _round(x, step): return int((Decimal(x) / Decimal(step)).quantize(Decimal(1), rounding=ROUND_HALF_UP)) * int(step)

def base_price(S, row):
    ov = (row.get('price_override_monthly') or '').strip()
    return Decimal(ov) if ov else Decimal(S['class_prices'][row['class']])

def module_price(S, row, tier=None):
    """`tier` is accepted and IGNORED (kept so old call sites cannot silently bring size-based prices back)."""
    return 0 if row['base_included'] == 'yes' else _round(base_price(S, row), S['round_to'])

def quote(S, mods, keys, students=None):
    allk, added = closure(mods, keys); lines = [(k, mods[k]['name_bn'], module_price(S, mods[k]), mods[k]['base_included'] == 'yes', k in added) for k in allk]
    monthly = sum(p for _, _, p, _, _ in lines)
    annual = int((Decimal(monthly) * 12 * (Decimal(100) - Decimal(str(S['annual_discount_percent']))) / 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    return dict(lines=lines, monthly=monthly, annual=annual, annual_if_monthly=monthly * 12, companions=sorted(added))

# ---- independent recomputation (exact fractions, its own closure) ------------------------------------------------------------------------------------------------------
def _fr(s): return Fraction(str(s))
def _rhu(fr, step): return int((fr / step + Fraction(1, 2)).__floor__()) * step
def indep_module_price(S, row, tier=None):
    if row['base_included'] == 'yes': return 0
    ov = (row.get('price_override_monthly') or '').strip(); b = _fr(ov) if ov else _fr(S['class_prices'][row['class']])
    return _rhu(b, int(S['round_to']))
def indep_closure(mods, keys):
    seen = set(keys); todo = list(keys)
    while todo:
        k = todo.pop()
        for d in [x.strip() for x in (mods[k].get('requires') or '').split(',') if x.strip()]:
            if d not in seen: seen.add(d); todo.append(d)
    return seen
def indep_quote(S, mods, keys, students=None):
    ks = indep_closure(mods, keys); monthly = sum(indep_module_price(S, mods[k]) for k in ks)
    annual = int((Fraction(monthly * 12) * (Fraction(100) - _fr(S['annual_discount_percent'])) / 100 + Fraction(1, 2)).__floor__())
    return monthly, annual

def structure_problems(S, mods, it=None):
    """D47 invariants + the companion graph."""
    bad = []
    t = S['tiers']
    if not (len(t) == 1 and t[0]['upto'] is None and float(t[0]['base']) == 0 and float(t[0]['mult']) == 1): bad.append('D47: no size tiers - settings.json must have exactly one tier {upto: null, base: 0, mult: 1}')
    for k, r in mods.items():
        for d in requires_of(r):
            if d not in mods: bad.append(f'{k}: requires an unknown module {d}')
            elif it is not None:
                miss = [ty for ty in ('school', 'college', 'coaching', 'private_batch') if k in it[ty]['modules'] and d not in it[ty]['modules']]
                if miss: bad.append(f'{k}: requires {d}, which does not exist for institution type(s) {miss}')
    # cycles
    for k in mods:
        seen = set(); todo = list(requires_of(mods[k]))
        while todo:
            x = todo.pop()
            if x == k: bad.append(f'{k}: required-companion cycle'); break
            if x in seen or x not in mods: continue
            seen.add(x); todo += requires_of(mods[x])
    note = S.get('unlimited_note', '')
    for must in ('কোনো সংখ্যার সীমা নেই', 'ব্যবহার-ভিত্তিক'):
        if must not in note: bad.append(f'D47: settings.json unlimited_note must keep the statement "{must}" (no limits on students, users, storage; third-party usage is separate)')
    for b in S['bundles']:
        if 'students' in b: bad.append(f'bundle {b["name"]}: a student count has no meaning any more (D47)')
    return bad

def selftest():
    S, mods = load(); bad = []
    for k, r in mods.items():
        if module_price(S, r) != indep_module_price(S, r): bad.append(f'{k}: module price differs')
    for b in S['bundles']:
        q = quote(S, mods, b['modules']); m, a = indep_quote(S, mods, b['modules'])
        if (q['monthly'], q['annual']) != (m, a): bad.append(f"bundle {b['name']}: {(q['monthly'], q['annual'])} != {(m, a)}")
        if set(k for k, *_ in q['lines']) != indep_closure(mods, b['modules']): bad.append(f"bundle {b['name']}: required companions differ")
    return bad

if __name__ == '__main__':
    b = selftest(); print('pricing self-test:', 'OK' if not b else b); raise SystemExit(1 if b else 0)
