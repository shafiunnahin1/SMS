# Reference implementation of the payroll rules that docs/modules/staff-payroll.md will state. Money uses Decimal, ROUND_HALF_UP to 2 places.
from decimal import Decimal as D, ROUND_HALF_UP
from datetime import date, timedelta
import calendar
q2=lambda x: D(x).quantize(D('0.01'),rounding=ROUND_HALF_UP)

def month_days(y,m): return calendar.monthrange(y,m)[1]

def structure_gross(basic, lines):
    """lines: list of (code, mode, value, type). mode 'fixed' | 'percent_basic'. returns (gross, earnings_dict, deductions_dict)"""
    earn={'basic':q2(basic)}; ded={}
    for code,mode,value,typ in lines:
        amt=q2(D(value)) if mode=='fixed' else q2(D(basic)*D(value)/D(100))
        (earn if typ=='earning' else ded)[code]=amt
    return q2(sum(earn.values())), earn, ded

def prorate_segments(y,m,structures,join=None,leave=None):
    """structures: list of dict(effective_from, effective_to|None, basic, lines). returns list of (struct, days) covering active days of the month (calendar basis)."""
    D_=month_days(y,m); start=date(y,m,1); end=date(y,m,D_)
    a=max(start,join) if join else start; b=min(end,leave) if leave else end
    out=[]
    for s in structures:
        s_from=max(a,s['effective_from']); s_to=min(b,s['effective_to'] or b)
        if s_from<=s_to: out.append((s,(s_to-s_from).days+1))
    return out,D_

def compute_item(y,m,structures,absent_days=0,lwp_days=0,late_count=0,lates_per_day=0,deduction_base='gross',basis='calendar',working_days=None,
                 adjustments=(),advance_installment=D(0),min_net=D(0),pf_percent=D(0),join=None,leave=None):
    segs,Dm=prorate_segments(y,m,structures,join,leave)
    earn_tot={}; ded_tot={}; basic_tot=D(0); gross_tot=D(0)
    for s,days in segs:
        g,e,d=structure_gross(s['basic'],s['lines']); f=D(days)/D(Dm)
        for k,v in e.items(): earn_tot[k]=earn_tot.get(k,D(0))+v*f
        for k,v in d.items(): ded_tot[k]=ded_tot.get(k,D(0))+v*f
        basic_tot+=e['basic']*f; gross_tot+=g*f
    earn_tot={k:q2(v) for k,v in earn_tot.items()}; ded_tot={k:q2(v) for k,v in ded_tot.items()}
    basic_tot=q2(basic_tot); gross_tot=q2(gross_tot)
    # unpaid-day deduction: per-day rate from the chosen base over the basis days
    basis_days={'calendar':Dm,'fixed_30':30,'working':working_days or Dm}[basis]
    base_amt=gross_tot if deduction_base=='gross' else basic_tot
    per_day=base_amt/D(basis_days)
    late_days=(late_count//lates_per_day) if lates_per_day else 0
    unpaid_days=D(absent_days)+D(lwp_days)+D(late_days)
    absence_ded=q2(per_day*unpaid_days)
    lines=dict(earn_tot)
    deds=dict(ded_tot)
    if absence_ded: deds['absence']=absence_ded
    for kind,direction,amt in adjustments:
        (lines if direction=='earning' else deds)[kind]=q2(lines.get(kind,0) if direction=='earning' else deds.get(kind,0))+q2(amt)
    if pf_percent: deds['pf_employee']=q2(basic_tot*pf_percent/D(100))
    total_e=q2(sum(lines.values())); total_d=q2(sum(deds.values()))
    net_before=total_e-total_d
    # advance recovery: never push net below min_net
    cap=max(D(0),net_before-min_net); recover=min(D(advance_installment),cap)
    if recover: deds['advance_recovery']=q2(recover)
    total_d=q2(sum(deds.values())); net=q2(total_e-total_d)
    return dict(basic=basic_tot,gross=gross_tot,earnings=lines,deductions=deds,total_earnings=total_e,total_deductions=total_d,net=net,unpaid_days=unpaid_days,per_day=q2(per_day),recovered=q2(recover))

def arrears(old_gross,new_gross,eff_from,months_already_paid):
    """months_already_paid: list of (y,m) payroll months already PAID at the old structure. arrear per month = (new-old) * days_at_new/month_days."""
    total=D(0); detail=[]
    for (y,m) in months_already_paid:
        Dm=month_days(y,m); start=date(y,m,1); end=date(y,m,Dm)
        if eff_from>end: continue
        d_from=max(eff_from,start); days=(end-d_from).days+1
        amt=q2((D(new_gross)-D(old_gross))*D(days)/D(Dm)); total+=amt; detail.append(((y,m),days,amt))
    return q2(total),detail

def bonus(basis_amount,value_pct,service_months,prorate_below=12,min_service=0,cap=None):
    if service_months<min_service: return D(0)
    amt=D(basis_amount)*D(value_pct)/D(100)
    if prorate_below and service_months<prorate_below: amt=amt*D(service_months)/D(prorate_below)
    if cap is not None: amt=min(amt,D(cap))
    return q2(amt)
