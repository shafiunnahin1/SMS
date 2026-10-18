"""
Reference implementations for the Revision 12 specs (accounting, donations, madrasa, communication, quick-wins, admission). They are NOT product code:
they are an independent calculation that the numbers quoted in the module docs are checked against. Decimal money, ROUND_HALF_UP to 2 places.
"""
from decimal import Decimal as D, ROUND_HALF_UP
import hashlib, hmac, random, collections, datetime as dt, math
q2=lambda x: D(x).quantize(D('0.01'),rounding=ROUND_HALF_UP)

# ---------------- accounting: the cash account of the ledger must equal the cash book (finance-advanced) ----------------
def ledger_cash_vs_cashbook():
    opening=D(5000)
    day=[ # (what, cash_in, cash_out, voucher lines [(Dr|Cr, account, amount)])
     ('fee receipt (cash)',      D(12000),D(0), [('Dr','1100',12000),('Cr','4110',12000)]),
     ('fee receipt (cash) #2',   D(1500), D(0), [('Dr','1100',1500),('Cr','4110',1500)]),
     ('fee refund (cash)',       D(0),    D(500),[('Dr','4110',500),('Cr','1100',500)]),
     ('expense: utilities',      D(0),    D(3000),[('Dr','5200',3000),('Cr','1100',3000)]),
     ('payroll paid in cash',    D(0),    D(8000),[('Dr','5100',9500),('Cr','2100',1000),('Cr','1400',500),('Cr','1100',8000)]),
     ('store sale (cash)',       D(2400), D(0), [('Dr','1100',2400),('Cr','4400',2400)]),
     ('store COGS',              D(0),    D(0), [('Dr','5700',1560),('Cr','1500',1560)]),
     ('donation (cash)',         D(10000),D(0), [('Dr','1100',10000),('Cr','4301',10000)]),
     ('fee receipt via bKash',   D(0),    D(0), [('Dr','1300',4000),('Cr','4110',4000)]),                 # not cash: must NOT touch the cash book
    ]
    cash_in=sum(i for _,i,_,_ in day); cash_out=sum(o for _,_,o,_ in day)
    expected=q2(opening+cash_in-cash_out)
    bal=collections.defaultdict(D)
    for name,_,_,lines in day:
        dr=sum(D(a) for k,_,a in lines if k=='Dr'); cr=sum(D(a) for k,_,a in lines if k=='Cr')
        assert dr==cr,f'{name} unbalanced {dr} {cr}'
        for k,acct,a in lines: bal[acct]+= D(a) if k=='Dr' else -D(a)
    ledger_cash=q2(opening+bal['1100'])
    return dict(expected=expected,ledger=ledger_cash,tb_zero=q2(sum(bal.values())),mobile=q2(bal['1300']))

# ---------------- budget vs actual ----------------
def budget_vs_actual(budget,actual):
    out={}
    for acct,b in budget.items():
        a=D(actual.get(acct,0)); b=D(b)
        out[acct]=dict(budget=q2(b),actual=q2(a),variance=q2(b-a),used_pct=(q2(a*100/b) if b else None))
    return out

# ---------------- hifz progress (page-based; pages_per_para is a setting, NOT a claim about any particular mushaf) ----------------
def hifz_progress(sabaq_pages,pages_per_para=20):
    total=D(pages_per_para)*30
    return dict(paras_completed=int(D(sum(map(D,sabaq_pages)))//D(pages_per_para)),percent=q2(D(sum(map(D,sabaq_pages)))*100/total))

# ---------------- WCAG contrast + the high-contrast palette ----------------
def _lin(c): c/=255; return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def lum(h): h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]; return 0.2126*_lin(r)+0.7152*_lin(g)+0.0722*_lin(b)
def ratio(a,b): la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return round((hi+0.05)/(lo+0.05),2)
def toward_black(h,t): h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]; return '#%02X%02X%02X'%tuple(round(c*(1-t)) for c in (r,g,b))
def hc_primary(h,min_ratio=7.0):
    for step in range(0,101,2):
        c=toward_black(h,step/100)
        if ratio(c,'#FFFFFF')>=min_ratio: return c,ratio(c,'#FFFFFF'),step
HC=dict(text='#000000',text_muted='#374151',line='#4B5563')

# ---------------- admission: verifiable selection with unguessable application numbers ----------------
def commitment(seed): return hashlib.sha256(seed.encode()).hexdigest()
def draw_order(seed,keys): return sorted(keys,key=lambda k: hmac.new(seed.encode(),str(k).encode(),hashlib.sha256).hexdigest())
def select(order,seats,waiting): return order[:seats],order[seats:seats+waiting],order[seats+waiting:]
def merit_order(rows):          # rows: (application_no, test_marks, applied_at_rank). highest marks first; ties -> earlier application
    return [r[0] for r in sorted(rows,key=lambda r:(-D(r[1]),r[2]))]
def promote_waiting(selected,waiting,declined):
    sel=[x for x in selected if x not in declined]; wl=list(waiting)
    while len(sel)<len(selected) and wl: sel.append(wl.pop(0))
    return sel,wl

# ---------------- SMS: segments, de-duplication, estimate, quiet hours ----------------
_GSM=("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€\f")
def segments(t):
    if not t: return 0
    if all(c in _GSM for c in t): u=len(t); return 1 if u<=160 else -(-u//153)
    u=len(t.encode('utf-16-le'))//2; return 1 if u<=70 else -(-u//67)
def estimate(recipients,body):
    phones=list(dict.fromkeys(p for p in recipients if p))       # siblings share one guardian phone -> one SMS
    s=segments(body); return dict(unique=len(phones),segments_each=s,credits=len(phones)*s)
def is_quiet(hhmm,start='22:00',end='07:00'):
    t=dt.datetime.strptime(hhmm,'%H:%M').time(); a=dt.datetime.strptime(start,'%H:%M').time(); b=dt.datetime.strptime(end,'%H:%M').time()
    return (t>=a or t<b) if a>b else (a<=t<b)               # [start, end): crosses midnight when start > end

def run_all():
    R=[]
    def chk(name,got,exp): R.append((name,got==exp,f'got {got} expected {exp}'))
    r=ledger_cash_vs_cashbook()
    chk('cash book expected closing (5000 + 25900 in - 11500 out)',r['expected'],D('19400.00')); chk('ledger cash account equals the cash book',r['ledger'],r['expected'])
    chk('trial balance of the day is zero',r['tb_zero'],D('0.00')); chk('a bKash receipt never touches the cash account',r['mobile'],D('4000.00'))
    b=budget_vs_actual({'5100':600000,'5200':60000,'5500':24000},{'5100':'288000.00','5200':'71000.00','5500':'0'})
    chk('salaries: 48.00% of annual budget used',b['5100']['used_pct'],D('48.00')); chk('utilities over budget -> negative variance',b['5200']['variance'],D('-11000.00'))
    chk('unused line: 0.00% used',b['5500']['used_pct'],D('0.00'))
    h=hifz_progress([5,6.5,4,8,10,12,15,24.5]); chk('85 pages at 20 pages/para -> 4 paras',h['paras_completed'],4); chk('85 of 600 pages = 14.17%',h['percent'],D('14.17'))
    chk('15 pages/para setting changes the answer (honest: it is a setting)',hifz_progress([85],15)['paras_completed'],5)
    for name,hexc in [('Classic Blue','#185FA5'),('Modern Mint','#0F766E'),('Tutor Lite','#7C3AED')]:
        c,rt,step=hc_primary(hexc); R.append((f'high-contrast primary for {name} >= 7:1 on white',rt>=7.0,f'{hexc} -> {c} = {rt}:1 (darkened {step}%)'))
    chk('high-contrast text on white',ratio(HC['text'],'#FFFFFF'),21.0); R.append(('high-contrast muted text >= 7:1',ratio(HC['text_muted'],'#FFFFFF')>=7.0,str(ratio(HC['text_muted'],'#FFFFFF'))))
    R.append(('high-contrast border >= 3:1 (UI component minimum)',ratio(HC['line'],'#FFFFFF')>=3.0,str(ratio(HC['line'],'#FFFFFF'))))
    # admission
    seed='bd-admit-2027-seed-4f9c'; keys=['A27-7K3QF','A27-2M9XD','A27-Q4W8T','A27-H6B2C','A27-9RZ5N','A27-X3D7L','A27-K8V4P','A27-T2J6S','A27-M5Y9G','A27-B7N3W']
    o=draw_order(seed,keys); chk('commitment verifies against the revealed seed',commitment(seed)==hashlib.sha256(seed.encode()).hexdigest(),True)
    chk('order is independent of insertion order',draw_order(seed,list(reversed(keys))),o)
    chk('a late applicant does not reshuffle the others',[k for k in draw_order(seed,keys+['A27-ZZZZZ']) if k!='A27-ZZZZZ'],o)
    sel,wl,rej=select(o,4,3); chk('4 selected + 3 waiting + 3 rejected cover everyone once',sorted(sel+wl+rej),sorted(keys))
    chk('a different seed gives a different order',draw_order('other-seed',keys)!=o,True)
    n=20; ks=[f'K{i:03d}' for i in range(n)]; picks=collections.Counter(); possum=collections.defaultdict(int); T=4000
    for t in range(T):
        od=draw_order(f'seed-{t}',ks)
        for pos,k in enumerate(od):
            possum[k]+=pos
            if pos<5: picks[k]+=1
    sigma=math.sqrt(T*0.25*0.75); lo,hi=T*0.25-4*sigma,T*0.25+4*sigma
    R.append(('lottery is unbiased: every applicant is picked ~25% of the time (4 sigma)',all(lo<=picks[k]<=hi for k in ks),f'range {min(picks.values())}..{max(picks.values())} allowed {lo:.0f}..{hi:.0f}'))
    R.append(('lottery is unbiased: mean position ~9.5 for everyone',all(abs(possum[k]/T-9.5)<0.6 for k in ks),f'{min(possum[k]/T for k in ks):.2f}..{max(possum[k]/T for k in ks):.2f}'))
    chk('merit order: marks desc, earlier application breaks ties',merit_order([('A',78,3),('B',82,5),('C',78,1),('D',65,2)]),['B','C','A','D'])
    s,w=promote_waiting(['a','b','c'],['w1','w2'],{'b'}); chk('a declined seat is offered to the first waiting applicant',(s,w),(['a','c','w1'],['w2']))
    # sms
    bn='প্রিয় অভিভাবক, আপনার সন্তান রাফি ০৪/১০/২০২৬ তারিখে অনুপস্থিত ছিল।'
    chk('Bangla one-line alert = 1 segment',segments(bn),1); chk('with a platform-name suffix = 2 segments',segments(bn+' -ধানমন্ডি মডেল স্কুল'),2)
    e=estimate(['01711000001','01711000001','01711000001','01822000002','01933000003',''],bn)
    chk('3 siblings sharing a phone + 2 others = 3 unique SMS',e['unique'],3); chk('credits = unique x segments',e['credits'],3)
    chk('quiet hours 22:00-07:00 contain 23:30',is_quiet('23:30'),True); chk('... contain 06:59',is_quiet('06:59'),True); chk('... exclude 07:00 (end is exclusive)',is_quiet('07:00'),False)
    chk('... exclude 21:59',is_quiet('21:59'),False); chk('... include 22:00 (start is inclusive)',is_quiet('22:00'),True)
    chk('a same-day window 13:00-15:00 works too',(is_quiet('14:00','13:00','15:00'),is_quiet('15:00','13:00','15:00')),(True,False))
    return R

if __name__=='__main__':
    res=run_all(); bad=[r for r in res if not r[1]]
    for n,ok,d in res: print(('PASS ' if ok else 'FAIL ')+n+('' if ok else '  -> '+d)+('  ['+d+']' if ok and ('high-contrast' in n or 'unbiased' in n) else ''))
    print(f'\n{len(res)-len(bad)}/{len(res)} passed'); raise SystemExit(1 if bad else 0)
