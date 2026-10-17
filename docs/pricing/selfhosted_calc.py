# -*- coding: utf-8 -*-
"""docs/pricing/selfhosted_calc.py - prices of the SELF-HOSTED (own server) edition, computed once here and re-computed independently with exact fractions as a self-test.
Decision D47: no size tiers, no base licence - every module has ONE licence price.
   module licence   = round_half_up( monthly module price x license_months , license_round_to )           (foundation modules: 0)
   licence total    = sum over the chosen modules AND their required companions
   AMC per year     = round_half_up( licence total x amc_percent / 100 , license_round_to )   (+ priority_extra_percent for the priority plan)
   3-year cost      = licence + required installation + 3 x AMC          (the client's own server and staff costs are NOT included)"""
import os, json
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
import pricing_calc as P
HERE = os.path.dirname(os.path.abspath(__file__))
def load_sh(): return json.load(open(os.path.join(HERE, 'selfhosted', 'settings.json'), encoding='utf-8'))
def _r(x, step): return int((Decimal(x) / Decimal(step)).quantize(Decimal(1), rounding=ROUND_HALF_UP)) * int(step)
def lic_module(S, SH, row, tier=None): return 0 if row['base_included'] == 'yes' else _r(Decimal(P.module_price(S, row)) * SH['license_months'], SH['license_round_to'])
def quote(S, SH, mods, keys, students=None, priority=False):
    allk, added = P.closure(mods, keys); lines = [(k, mods[k]['name_bn'], lic_module(S, SH, mods[k]), k in added) for k in allk]
    lic = sum(p for _, _, p, _ in lines); pct = Decimal(SH['amc']['percent']) + (Decimal(SH['amc']['priority_extra_percent']) if priority else 0)
    amc = _r(Decimal(lic) * pct / 100, SH['license_round_to']); install = sum(i['price'] for i in SH['install'] if i['required'])
    src = _r(Decimal(lic) * Decimal(str(SH['source_ownership_multiple'])), SH['license_round_to']) if SH.get('source_ownership_multiple') else None
    saas = P.quote(S, mods, keys)
    return dict(lines=lines, license=lic, install=install, amc=amc, source=src, three_year=lic + install + 3 * amc, five_year=lic + install + 5 * amc,
                saas_monthly=saas['monthly'], saas_annual=saas['annual'], saas_three_year=saas['annual'] * 3, saas_five_year=saas['annual'] * 5, companions=saas['companions'])
# ---- independent recomputation (Fractions, own closure) ----------------------------------------------------------------------------------------------------------------
def _fr(s): return Fraction(str(s))
def _rhu(fr, step): return int((fr / step + Fraction(1, 2)).__floor__()) * step
def indep_quote(S, SH, mods, keys, students=None):
    m, rt = SH['license_months'], int(SH['license_round_to']); ks = P.indep_closure(mods, keys)
    lic = sum(0 if mods[k]['base_included'] == 'yes' else _rhu(_fr(P.indep_module_price(S, mods[k])) * m, rt) for k in ks)
    amc = _rhu(Fraction(lic) * _fr(SH['amc']['percent']) / 100, rt); install = sum(i['price'] for i in SH['install'] if i['required'])
    return lic, amc, lic + install + 3 * amc
def selftest():
    S, mods = P.load(); SH = load_sh(); bad = []
    for b in S['bundles']:
        q = quote(S, SH, mods, b['modules']); lic, amc, tot = indep_quote(S, SH, mods, b['modules'])
        if (q['license'], q['amc'], q['three_year']) != (lic, amc, tot): bad.append(f"bundle {b['name']}: {(q['license'], q['amc'], q['three_year'])} != {(lic, amc, tot)}")
    for k, r in mods.items():
        if lic_module(S, SH, r) != (0 if r['base_included'] == 'yes' else _rhu(_fr(P.indep_module_price(S, r)) * SH['license_months'], int(SH['license_round_to']))): bad.append(f'{k}: licence price differs')
    if sum(x['percent'] for x in SH['payment_schedule']) != 100: bad.append('payment schedule must add up to 100%')
    return bad
if __name__ == '__main__':
    b = selftest(); print('self-hosted pricing self-test:', 'OK' if not b else b); raise SystemExit(1 if b else 0)
