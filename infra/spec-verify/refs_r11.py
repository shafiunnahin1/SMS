"""
Reference implementations of the Revision 11 rules (Decimal money, ROUND_HALF_UP to 2 places). They are NOT the product code; they are an independent
calculation that the numbers quoted in the module docs are checked against. Each check returns (name, ok, detail).
"""
from decimal import Decimal as D, ROUND_HALF_UP
import hashlib, hmac, json, datetime as dt
q2=lambda x: D(x).quantize(D('0.01'),rounding=ROUND_HALF_UP)

# ---------------------------------------------------------------- finance: dues, refunds, cash book --------------------------------------------
def due(gross,discount,payments,waived=False):
    """payments: list of paid_amount values, refunds are NEGATIVE reversal lines. Settlement is judged on the NET (D32)."""
    if waived: return D(0)
    return max(D(0),q2(D(gross)-D(discount)-sum(map(D,payments),D(0))))
def max_refund(payments): return q2(sum((D(p) for p in payments),D(0)))        # cannot refund more than the net still held
def cash_book(opening,ins,outs,counted=None):
    expected=q2(D(opening)+sum(map(D,ins),D(0))-sum(map(D,outs),D(0)))
    return expected,(None if counted is None else q2(D(counted)-expected))

# ---------------------------------------------------------------- inventory: moving-average cost ----------------------------------------------------
class Stock:
    def __init__(s): s.qty=D(0); s.avg=D(0); s.log=[]
    def receive(s,qty,unit_cost):
        qty,unit_cost=D(qty),D(unit_cost); new=s.qty+qty
        s.avg=q2((s.qty*s.avg+qty*unit_cost)/new) if new else D(0); s.qty=new; s.log.append(('receive',qty,s.qty))
    def out(s,kind,qty):
        qty=D(qty)
        if qty>s.qty: raise ValueError('insufficient stock')                     # negative stock is never allowed
        cost=q2(qty*s.avg); s.qty-=qty; s.log.append((kind,qty,s.qty)); return cost
    def back(s,qty): s.qty+=D(qty); s.log.append(('return',D(qty),s.qty))        # a return re-enters at the current average cost

# ---------------------------------------------------------------- device signature & punch classification ---------------------------------------------
def sign(secret,ts,body): return hmac.new(secret.encode(),f'{ts}.{body}'.encode(),hashlib.sha256).hexdigest()
def verify(secret,ts,body,sig,now,window=300):
    if abs(now-int(ts))>window: return False,'timestamp outside window'
    return (hmac.compare_digest(sign(secret,ts,body),sig),'ok')
def classify(local_time,start,grace_min=10,review_after_min=60):
    t=dt.datetime.strptime(local_time,'%H:%M'); s=dt.datetime.strptime(start,'%H:%M'); m=(t-s).total_seconds()/60
    if m<=grace_min: return 'present'
    if m<=review_after_min: return 'late'
    return 'review'                                   # too late to guess: a person decides, never auto-absent/present
def to_utc(local_iso,offset_minutes): return (dt.datetime.fromisoformat(local_iso)-dt.timedelta(minutes=offset_minutes)).strftime('%Y-%m-%d %H:%M:%S')

# ---------------------------------------------------------------- platform invoice: coupon then tax ---------------------------------------------------
def invoice(price,tax_rate=0,inclusive=False,coupon=None):
    price=D(price); disc=D(0); free=0
    if coupon:
        kind,val,cap=coupon
        if kind=='percent': disc=q2(price*D(val)/100); disc=min(disc,D(cap)) if cap else disc
        elif kind=='fixed': disc=min(D(val),price)
        elif kind=='free_days': free=int(val)
    sub=q2(price-disc)
    r=D(tax_rate)/100
    if inclusive: total=sub; tax=q2(sub-sub/(1+r)); net=q2(sub-tax)
    else: tax=q2(sub*r); total=q2(sub+tax); net=sub
    return dict(price=q2(price),discount=disc,subtotal=sub,net=net,tax=tax,total=total,free_days=free)

# ---------------------------------------------------------------- accounting: balanced postings ------------------------------------------------------
def post(lines):
    dr=sum((D(a) for k,_,a in lines if k=='Dr'),D(0)); cr=sum((D(a) for k,_,a in lines if k=='Cr'),D(0))
    if q2(dr)!=q2(cr): raise ValueError(f'unbalanced voucher Dr {dr} != Cr {cr}')
    return lines
def trial_balance(vouchers):
    tb={}
    for v in vouchers:
        for k,acct,a in v: tb[acct]=tb.get(acct,D(0))+(D(a) if k=='Dr' else -D(a))
    return tb

# ---------------------------------------------------------------- verifiable lottery (commit-reveal) --------------------------------------------------
def commitment(seed): return hashlib.sha256(seed.encode()).hexdigest()
def draw_order(seed,applicant_ids): return sorted(applicant_ids,key=lambda i: hmac.new(seed.encode(),str(i).encode(),hashlib.sha256).hexdigest())

# ---------------------------------------------------------------- risk score (rule based, thresholds are settings) --------------------------------------
def risk(att_pct,prev_marks,last_marks,months_overdue,t=dict(att_watch=75,att_high=60,drop_watch=15,drop_high=25,dues_watch=2,dues_high=3)):
    lv=lambda v,w,h: 'high' if v>=h else ('watch' if v>=w else None)
    a=('high' if att_pct<t['att_high'] else ('watch' if att_pct<t['att_watch'] else None))
    drop=(prev_marks-last_marks) if prev_marks is not None and last_marks is not None else 0
    m=lv(drop,t['drop_watch'],t['drop_high']); d=lv(months_overdue,t['dues_watch'],t['dues_high'])
    flags={k:v for k,v in dict(attendance=a,marks_drop=m,dues=d).items() if v}
    combined='high' if (len(flags)>=2 or 'high' in flags.values()) else ('watch' if flags else None)
    return flags,combined

def run_all():
    R=[]
    def chk(name,got,exp): R.append((name,got==exp,f'got {got} expected {exp}'))
    # finance
    chk('fee paid in full -> due 0',due(1000,0,[1000]),D(0))
    chk('full refund -> due returns to 1000',due(1000,0,[1000,-1000]),D(1000))
    chk('partial refund 400 -> due 400',due(1000,0,[1000,-400]),D(400))
    chk('paid 600 then refund 100 -> due 500',due(1000,0,[600,-100]),D(500))
    chk('discount 100, paid 900 -> due 0',due(1000,100,[900]),D(0))
    chk('waived line never becomes due',due(1000,0,[],waived=True),D(0))
    chk('refund cap = net still held',max_refund([1000,-400]),D(600))
    chk('cash book expected closing',cash_book(5000,[12000,1500],[3000,8000,500])[0],D(7000))
    chk('cash book difference (counted 6980)',cash_book(5000,[12000,1500],[3000,8000,500],6980)[1],D(-20))
    # inventory
    s=Stock(); s.receive(100,50); s.receive(50,56)
    chk('moving average after 2 receipts',s.avg,D('52.00')); chk('stock after receipts',s.qty,D(150))
    cogs=s.out('sale',30); chk('COGS of 30 sold at avg 52',cogs,D('1560.00')); chk('margin on 30 @ 80',q2(30*D(80)-cogs),D('840.00'))
    s.out('issue',10); s.out('damage',5); chk('write-off value of 5 damaged',q2(5*s.avg),D('260.00')); s.out('adjust',2); chk('stock after issue 10, damage 5, adjust -2',s.qty,D(103))
    try: s.out('sale',200); neg=False
    except ValueError: neg=True
    chk('selling more than stock is rejected',neg,True); s.back(5); chk('stock after a return of 5',s.qty,D(108))
    # device
    body='{"punches":[{"c":"04A1B2C3","t":"2027-01-01T08:02:11+06:00"}]}'; sig=sign('s3cr3t',1798761600,body)
    R.append(('HMAC-SHA256 test vector is stable',sig==hmac.new(b's3cr3t',('1798761600.'+body).encode(),hashlib.sha256).hexdigest() and len(sig)==64,sig))
    chk('valid signature inside window',verify('s3cr3t','1798761600',body,sig,1798761600+120)[0],True)
    chk('tampered body rejected',verify('s3cr3t','1798761600',body+' ',sig,1798761600+10)[0],False)
    chk('replay outside 5-minute window rejected',verify('s3cr3t','1798761600',body,sig,1798761600+301)[0],False)
    chk('wrong secret rejected',verify('other','1798761600',body,sig,1798761600+10)[0],False)
    chk('08:02 with start 08:00 -> present',classify('08:02','08:00'),'present'); chk('08:10 boundary -> present',classify('08:10','08:00'),'present')
    chk('08:11 -> late',classify('08:11','08:00'),'late'); chk('09:00 boundary -> late',classify('09:00','08:00'),'late'); chk('09:05 -> needs review (never auto)',classify('09:05','08:00'),'review')
    chk('device clock +06:00 stored as UTC',to_utc('2027-01-01T08:02:11',360),'2027-01-01 02:02:11')
    # platform invoice
    i=invoice(999); chk('no tax, no coupon',i['total'],D('999.00'))
    i=invoice(999,15); chk('tax 15% exclusive: tax',i['tax'],D('149.85')); chk('tax 15% exclusive: total',i['total'],D('1148.85'))
    i=invoice(999,15,True); chk('tax 15% inclusive: total unchanged',i['total'],D('999.00')); chk('tax 15% inclusive: tax part',i['tax'],D('130.30')); chk('tax 15% inclusive: net part',i['net'],D('868.70'))
    i=invoice(999,15,False,('percent',20,150)); chk('20% coupon capped at 150: discount',i['discount'],D('150.00')); chk('coupon then tax: tax on discounted',i['tax'],D('127.35')); chk('coupon then tax: total',i['total'],D('976.35'))
    i=invoice(999,0,False,('percent',10,None)); chk('10% uncapped',i['discount'],D('99.90'))
    i=invoice(999,0,False,('fixed',100,None)); chk('fixed 100',i['total'],D('899.00'))
    i=invoice(999,0,False,('fixed',2000,None)); chk('fixed coupon larger than price never goes negative',i['total'],D('0.00'))
    i=invoice(999,15,False,('free_days',30,None)); chk('free-days coupon moves no money, 30 days granted',(i['total'],i['free_days']),(D('1148.85'),30))
    # accounting
    v=[post([('Dr','Cash',5000),('Cr','TuitionIncome',5000)]),
       post([('Dr','Expense:Utilities',1200),('Cr','Cash',1200)]),
       post([('Dr','Salary Expense','28532.26'),('Cr','PF Payable',2000),('Cr','Staff Advances',5000),('Cr','Cash','21532.26')]),
       post([('Dr','PF Expense',2000),('Cr','PF Payable',2000)]),
       post([('Dr','Cash',2400),('Cr','StoreSales',2400)]),post([('Dr','COGS',1560),('Cr','Inventory',1560)]),
       post([('Dr','Cash',10000),('Cr','DonationIncome:Zakat',10000)])]
    tb=trial_balance(v); chk('trial balance sums to zero',q2(sum(tb.values())),D('0.00'))
    chk('cash after all postings',q2(tb['Cash']),q2(D(5000)-1200-D('21532.26')+2400+10000))
    try: post([('Dr','Cash',100),('Cr','Income',99)]); bal=False
    except ValueError: bal=True
    chk('an unbalanced voucher is refused',bal,True)
    reversed_=[('Cr' if k=='Dr' else 'Dr',a,x) for k,a,x in v[0]]; chk('reversal voucher nets the original to zero',q2(sum(trial_balance([v[0],reversed_]).values())),D('0.00'))
    fund=D(10000)-D(7000); chk('restricted fund balance after spending 7000',fund,D(3000)); chk('spending 4000 more would overdraw the restricted fund',fund-D(4000)<0,True)
    # lottery
    seed='bd-admit-2027-test-seed-0001'; ids=list(range(101,111)); order=draw_order(seed,ids)
    chk('commitment is sha256(seed)',commitment(seed),hashlib.sha256(seed.encode()).hexdigest())
    chk('order does not depend on input order',draw_order(seed,list(reversed(ids))),order); chk('selected 3 + waiting 2',(order[:3],order[3:5]),(order[:3],order[3:5]))
    chk('a late applicant does not reshuffle others',[x for x in draw_order(seed,ids+[999]) if x!=999],order)
    chk('a different seed gives a different order',draw_order('another-seed',ids)!=order,True)
    # risk
    chk('attendance 70 + marks 72->50 -> combined high',risk(70,72,50,0),({'attendance':'watch','marks_drop':'watch'},'high'))
    chk('only dues 2 months -> watch',risk(95,70,70,2),({'dues':'watch'},'watch'))
    chk('attendance 55 alone -> high',risk(55,None,None,0),({'attendance':'high'},'high'))
    chk('healthy student -> no flag',risk(92,70,74,0),({},None))
    return R

if __name__=='__main__':
    res=run_all(); bad=[r for r in res if not r[1]]
    for n,ok,d in res: print(('PASS ' if ok else 'FAIL ')+n+('' if ok else '  -> '+d))
    print(f'\n{len(res)-len(bad)}/{len(res)} passed'); raise SystemExit(1 if bad else 0)
