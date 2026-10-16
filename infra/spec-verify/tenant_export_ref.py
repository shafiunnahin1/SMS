"""
Reference prototype of per-institution export -> import-as-NEW-institution (docs/modules/platform-ops.md section 6, decision D38).
It runs on the REAL schema.sql (translated to SQLite) and answers one question with evidence: which id-bearing columns must an exporter remap,
including the ones that have NO foreign key? The generated map is committed as docs/database/tenant-export-map.json and re-checked by verify.py.
"""
import re,json,sqlite3,os,sys,random,collections
from pathlib import Path

from schema_inventory import operational_schema, read_inventory

def load_schema(root):
    s=operational_schema((Path(root)/'docs/database/schema.sql').read_text(encoding='utf-8'))
    t=re.sub(r'--[^\n]*','',s); t=re.sub(r"ENUM\([^)]*\)","TEXT",t)
    t=re.sub(r"\bBIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY\b","INTEGER PRIMARY KEY AUTOINCREMENT",t); t=re.sub(r"\b(BIGINT|TINYINT|INT) UNSIGNED\b",r"\1",t)
    t=re.sub(r"\bON UPDATE CURRENT_TIMESTAMP\b","",t); t=re.sub(r"\bUNIQUE KEY\s+\w+\s*\(",'UNIQUE (',t); t=re.sub(r",?\s*\n\s*(?:INDEX|KEY)\s+\w+\s*\([^)]*\)",'',t)
    con=sqlite3.connect(':memory:')
    for st in [x.strip() for x in t.split(';') if x.strip()]: con.execute(st)
    return con

# Columns that reference a row but whose name does not say which table. Everything else is resolved by FK or by the <name>_id convention.
OVERRIDES={
 'parent_user_id':'users','user_id':'users','teacher_id':'teachers','substitute_teacher_id':'teachers','original_teacher_id':'teachers',
 'interested_program_id':'programs','interested_batch_id':'batches','converted_student_id':'students','reverses_id':None,   # self-reference, handled below
 'approved_by':'users','created_by':'users','added_by':'users','taken_by':'users','issued_by':'users','marked_by':'users','sent_by':'users','recorded_by':'users',
 'proposed_by':'users','prepared_by':'users','reviewed_by':'users','paid_by':'users','requested_by':'users','processed_by':'users','closed_by':'users',
 'reopened_by':'users','granted_by':'users','locked_by':'users','decided_by':'users','acknowledged_by':'users','posted_by':'users','received_by':'users',
 'updated_by':'users','drawn_by':'users','assigned_to':'users','author_id':None,'super_admin_id':None,'target_user_id':'users','theme_updated_by':'users',
 'payment_id':'payments','invoice_id':'subscription_invoices','coupon_id':'coupons','settlement_id':'settlements','event_id':'institution_events',
 'fund_id':'donation_funds','payroll_run_id':'payroll_runs','payroll_item_id':'payroll_items','scheme_id':'bonus_schemes','revision_id':'salary_revisions',
 'structure_id':'salary_structures','template_id':'sms_templates','campaign_id':None,'cycle_id':'admission_cycles','lead_id':'admission_leads','online_payment_id':'online_payments',
 'parent_id':None,'unit_id':'syllabus_units','routine_id':'routines','enrollment_id':'enrollments','result_sheet_id':'result_sheets','device_id':'attendance_devices',
 'token_id':None,'cover_item_id':'gallery_items','album_id':'gallery_albums','run_id':'payroll_runs','job_id':'import_jobs','budget_id':'budgets','account_id':'ledger_accounts',
 'voucher_id':'vouchers','item_id':None,'ticket_id':'support_tickets','notice_id':'notices','academic_year_id':'academic_years','theme_preset_id':'theme_presets',
 'subscription_plan_id':None,'component_id':'salary_components','routine_block_id':'routine_blocks','vehicle_id':'vehicles','route_id':'transport_routes',
 'hostel_id':'hostels','room_id':'hostel_rooms','book_id':'books','exam_id':'exams','subject_id':'subjects','fee_category_id':'fee_categories','program_id':'programs',
 'batch_id':'batches','student_id':'students','class_id':None,'leave_type_id':'leave_types','leave_id':None,'sender_id':None,'stop_id':'route_stops',
 'fee_payment_id':'fee_payments','plan_id':None,'installment_plan_id':'fee_installment_plans','parent_user':'users','training_id':'training_programs','scholarship_id':'scholarships',
 'collected_by':'users','from_user_id':'users','to_user_id':'users','imported_by':'users','reported_by':'users','changed_by':'users','verified_by':'users',
 'staff_id':'staff_members','optional_subject_id':'subjects','campaign_id':'donation_campaigns','credit_for_id':'subscription_invoices',
 'question_id':'exam_questions','online_exam_id':'online_exams','homework_id':'homeworks','meeting_id':'parent_meetings','teacher_user_id':'users',
 'unlocked_by':'users','student_user_id':'users',                                                  # D65 question bank
}
# Polymorphic (type column -> id column) pairs. The id's target depends on the type value.
POLY={('payee_type','payee_id'):{'teacher':'teachers','staff':'staff_members'},
      ('person_type','person_id'):{'student':'students','teacher':'teachers','staff':'staff_members'},
      ('issued_to_type','issued_to_id'):{'student':'students','teacher':'teachers','staff':'staff_members'},
      ('created_table','created_id'):'DYNAMIC'}
# Context-dependent single columns
CONTEXT={('fee_installments','payment_id'):'fee_payments',('coupon_redemptions','payment_id'):'payments',('subscription_invoices','payment_id'):'payments',('vouchers','source_id'):'by source',('lesson_plans','batch_id'):'batches',('support_ticket_messages','author_id'):'by author_type',('salary_adjustments','payroll_item_id'):'payroll_items',
         ('expenses','payroll_run_id'):'payroll_runs',('teacher_payouts','payroll_item_id'):'payroll_items',('sms_logs','campaign_id'):'sms_campaigns',('salary_revisions','payee_id'):None,
         ('qb_unlocks','item_id'):None,('qb_student_unlocks','item_id'):None}   # D65: a platform catalogue id (item_type picks qb_questions/qb_concepts/qb_resources) - global, kept as it is

TYPES={}
def INTEGER_COL(t,c): return 'INT' in TYPES[t].get(c,'')

def build_map(con):
    tabs=[r[0] for r in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
    cols={t:[c[1] for c in con.execute(f'PRAGMA table_info({t})')] for t in tabs}
    TYPES.update({t:{c[1]:(c[2] or '').upper() for c in con.execute(f'PRAGMA table_info({t})')} for t in tabs})
    fks={t:{f[3]:f[2] for f in con.execute(f'PRAGMA foreign_key_list({t})')} for t in tabs}
    tenant=[t for t in tabs if 'institution_id' in cols[t] and t!='institutions']
    out={}; unresolved=[]
    singular=lambda n: n[:-3] if n.endswith('_id') else n
    for t in tenant:
        refs={}; poly=[]; json_cols=[]
        pairs_here=[(a,b) for (a,b) in POLY if a in cols[t] and b in cols[t]]
        for a,b in pairs_here: poly.append({'type_col':a,'id_col':b,'targets':POLY[(a,b)]})
        polyid={b for _,b in pairs_here}
        for c in cols[t]:
            if c in ('id','institution_id') or c in polyid: continue
            if not (c.endswith('_id') or c.endswith('_by') or c=='assigned_to'): continue
            if not INTEGER_COL(t,c): continue                                   # strings/enums (trx_id, employee_id, collected_by ENUM ...) are never references
            if c in fks[t]: refs[c]=fks[t][c]; continue
            if (t,c) in CONTEXT:
                v=CONTEXT[(t,c)]
                if v and v not in ('by source','by author_type'): refs[c]=v
                elif v: poly.append({'type_col':'(see note)','id_col':c,'targets':v})
                continue
            if c=='parent_id' or c=='reverses_id': refs[c]=t; continue            # self reference
            if c in OVERRIDES and OVERRIDES[c]: refs[c]=OVERRIDES[c]; continue
            guess=singular(c); cand=[guess,guess+'s',guess+'es',guess[:-1]+'ies' if guess.endswith('y') else guess]
            hit=[x for x in cand if x in tabs]
            if hit: refs[c]=hit[0]
            else: unresolved.append((t,c))
        out[t]={'refs':refs,'poly':poly}
    return tabs,cols,fks,tenant,out,unresolved

# Import ORDER must also respect ids that live INSIDE json columns (no FK to see). table -> tables whose rows must exist first
JSON_DEPS={'institution_events':['programs'],'online_payments':['enrollments','batches','fee_categories'],'result_sheets':['exams'],'final_results':['subjects'],
           'fee_refunds':['fee_payments'],'admission_draws':['admission_leads'],'exam_attempts':['exam_questions'],'bonus_schemes':['teachers','staff_members'],
           'sms_campaigns':['batches','programs'],'payroll_items':['salary_adjustments','salary_advances']}

def topo(tenant,out):
    order=[]; seen=set()
    def visit(t,stack=()):
        if t in seen or t not in tenant: return
        seen.add(t)
        for c,r in out[t]['refs'].items():
            if r!=t and r in tenant and r not in stack: visit(r,stack+(t,))
        for pp in out[t]['poly']:
            if isinstance(pp['targets'],dict):
                for r in pp['targets'].values():
                    if r!=t and r in tenant and r not in stack: visit(r,stack+(t,))
        for r in JSON_DEPS.get(t,[]):
            if r!=t and r in tenant and r not in stack: visit(r,stack+(t,))
        order.append(t)
    for t in sorted(tenant): visit(t)
    return order

# ====================================================================================================================================
# Export policy (D38). Tables that are NOT exported, each with the reason. Everything else with institution_id IS exported.
EXCLUDED={
 'institution_registrations':'D90 first-principal approval is not portable; new tenant needs fresh review',
 'account_activation_requests':'D90 contact/challenge authorization evidence; never export or replay',
 'audit_logs':'platform-held trail; the new institution starts a fresh trail with one "imported" entry',
 'impersonation_sessions':'platform-owned','tenant_exports':'operational','support_tickets':'platform-owned (has internal notes)','support_ticket_messages':'platform-owned',
 'import_jobs':'operational','import_rows':'operational','device_punches':'raw high-volume feed; processed attendance IS exported','attendance_devices':'global device key + secret: re-register on the new institution',
 'institution_domains':'a domain is globally unique and belongs to one institution','institution_payment_gateways':'credentials (secrets)','institution_payout_accounts':'bank/mobile account numbers (secrets)',
 'settlements':'platform money flow','sms_logs':'personal message bodies; heavy','sms_credit_transactions':'platform credit ledger','coupon_redemptions':'platform-owned',
 'institution_theme_logs':'history only','student_import_logs':'operational','subscription_invoices':'platform billing','payments':'platform billing',
}
# D33/D38: what a Super-Admin-initiated `backup` must NOT contain (the Super Admin chooses the passphrase, so anything inside is readable by the platform operator).
# An institution-Admin `export` (their own passphrase, explicit tick-box + password re-entry) MAY include all of it.
BACKUP_EXCLUDE_TABLES=['salary_components','salary_structures','salary_structure_lines','salary_revisions','salary_adjustments','bonus_schemes','salary_advances',
                       'salary_pay_accounts','payroll_runs','payroll_items','provident_fund_entries']
BACKUP_REDACT_COLUMNS=[('teachers','salary'),('teachers','house_rent'),('teachers','medical_allowance'),('teachers','transport_allowance')]
# Globally unique values that would collide when the same data is imported again: regenerate them on import.
REGEN={('online_payments','gateway_ref'),('qb_student_orders','ref')}   # globally unique gateway references (D65: the question-bank bKash ref)
# JSON columns that carry ids -> how to remap. (any JSON column NOT listed here is asserted to carry no foreign ids)
def _m(idmap,table,v): return idmap[table][v] if v is not None else None
JSON_IDS={
 ('institution_events','program_ids'):   lambda v,im: [_m(im,'programs',x) for x in v],
 ('online_payments','items'):            lambda v,im: [{**i,'enrollment_id':_m(im,'enrollments',i.get('enrollment_id')),'batch_id':_m(im,'batches',i.get('batch_id')),'fee_category_id':_m(im,'fee_categories',i.get('fee_category_id'))} for i in v],
 ('result_sheets','rule'):               lambda v,im: {**v,'components':[({'exam_id':_m(im,'exams',c['exam_id']),'weight':c['weight']} if 'exam_id' in c else {'best_of':c['best_of'],'of':[_m(im,'exams',x) for x in c['of']],'weight':c['weight']}) for c in v['components']]},
 ('final_results','details'):            lambda v,im: {str(_m(im,'subjects',int(k))):x for k,x in v.items()},
 ('fee_refunds','refund_lines'):                lambda v,im: [{**l,'fee_payment_id':_m(im,'fee_payments',l['fee_payment_id'])} for l in v],
 ('admission_draws','result'):           lambda v,im: {**v,'order':[_m(im,'admission_leads',x) for x in v['order']]},
 ('exam_attempts','answers'):            lambda v,im: {str(_m(im,'exam_questions',int(k))):x for k,x in v.items()},
 ('bonus_schemes','applies_to'):         lambda v,im: {**v,'exclude':[{'type':e['type'],'id':_m(im,'teachers' if e['type']=='teacher' else 'staff_members',e['id'])} for e in v.get('exclude',[])]},
 ('sms_campaigns','audience'):           lambda v,im: {**v,'ids':[_m(im,{'batch':'batches','program':'programs'}[v['type']],x) for x in v.get('ids',[])]} if v.get('type') in ('batch','program') else v,
 ('payroll_items','breakdown'):          lambda v,im: [({**l,'ref_id':_m(im,{'adjustment':'salary_adjustments','advance':'salary_advances'}[l['source']],l['ref_id'])} if l.get('ref_id') and l.get('source') in ('adjustment','advance') else l) for l in v],
}
TRUE_JSON_IDS=dict(JSON_IDS)          # pristine copy: verification must never use a map that is under test
# JSON columns asserted to contain NO foreign ids (a rule for the people who write the services; checked by the dataset below)
JSON_NO_IDS={'users.notification_preferences','users.ui_preferences','batches.schedule','results.component_marks','exam_questions.options','scholarship_applications.documents',
             'online_payments.raw_response','settlements.payout_snapshot','exam_subjects.components','salary_components.name','payroll_runs.settings_snapshot','risk_flags.details',
             'admission_cycles.rule','sms_templates.body','device_punches.raw','support_ticket_messages.attachments','import_jobs.mapping','import_jobs.summary','import_rows.data',
             'student_import_logs.error_log','audit_logs.old_data','audit_logs.new_data','institution_theme_logs.old_values','institution_theme_logs.new_values'}
SAMPLE={  # realistic JSON payloads, built from real ids by the populator
}

def unresolved_exported(root):
    """id-bearing columns of tables that ARE exported but whose target table the map cannot name. Must be [] (columns of excluded tables never travel)."""
    con=load_schema(root); tabs,cols,fks,tenant,out,unres=build_map(con)
    return [(t,c) for t,c in unres if t not in EXCLUDED]

def backup_policy_problems(root):
    con=load_schema(root); tabs,cols,fks,tenant,out,unres=build_map(con); inc=exported_tables(tenant); bad=[]
    for tb in BACKUP_EXCLUDE_TABLES:
        if tb not in inc: bad.append(f'{tb}: not an exported table')
    for tb,c in BACKUP_REDACT_COLUMNS:
        if c not in [x[1] for x in con.execute(f'PRAGMA table_info({tb})')]: bad.append(f'{tb}.{c}: no such column')
    # every salary-bearing table must be covered: anything named salary_*/payroll_*/provident_* has to be in the exclude list
    for tb in inc:
        if re.match(r'(salary_|payroll_|provident_)',tb) and tb not in BACKUP_EXCLUDE_TABLES: bad.append(f'{tb}: salary-like table missing from BACKUP_EXCLUDE_TABLES')
    return bad

def map_is_fresh(root):
    _,m,*_=build_export_map(root)
    cur=json.loads(open(os.path.join(root,'docs/database/tenant-export-map.json'),encoding='utf-8').read())
    return m==cur

def exported_tables(tenant): return [t for t in tenant if t not in EXCLUDED]

def build_export_map(root):
    con=load_schema(root); tabs,cols,fks,tenant,out,unres=build_map(con)
    inc=exported_tables(tenant); order=topo(set(inc),{t:out[t] for t in inc})
    m={'format_version':1,'design_only_tables':sorted(read_inventory(root)[2]),'generated_from':'docs/database/schema.sql (python3 infra/spec-verify/tenant_export_ref.py --write)',
       'excluded':EXCLUDED,'backup_excludes':{'tables':BACKUP_EXCLUDE_TABLES,'columns':[f'{a}.{b}' for a,b in BACKUP_REDACT_COLUMNS]},'regenerate_on_import':sorted(f'{a}.{b}' for a,b in REGEN),'order':order,
       'json_with_ids':sorted(f'{a}.{b}' for a,b in JSON_IDS),'json_without_ids':sorted(JSON_NO_IDS),
       'tables':{t:{'refs':dict(sorted(out[t]['refs'].items())),'polymorphic':out[t]['poly']} for t in order},
       'refs_to_excluded_or_platform':{t:{c:r for c,r in out[t]['refs'].items() if r not in inc and r!=t} for t in order if any(r not in inc and r!=t for r in out[t]['refs'].values())}}
    return con,m,tabs,cols,fks,inc,order,out

if __name__=='__main__' and '--write' in sys.argv:
    root=sys.argv[1]
    _,m,*_=build_export_map(root)
    open(os.path.join(root,'docs/database/tenant-export-map.json'),'w',encoding='utf-8').write(json.dumps(m,ensure_ascii=False,indent=1)+'\n')
    print('wrote docs/database/tenant-export-map.json:',len(m['order']),'tables exported,',len(m['excluded']),'excluded')


# ====================================================================================================================================
# Round-trip proof: fill institution A with consistent synthetic data across EVERY exported table, export, import as institution B,
# then check (1) row counts, (2) every reference of B points inside B, (3) no id of A leaked into B, (4) B is structurally identical to A.
NULL_ON_IMPORT={('online_payments','settlement_id'),('institutions','subscription_plan_id')}

def populate(con,inst_id,order,out,types,fks,seed=7):
    rnd=random.Random(seed); ids=collections.defaultdict(list)           # table -> ids inserted for this institution
    def pick(table,k):
        L=ids[table]; return L[k%len(L)] if L else None
    for t in order:
        for k in range(2):
            row={}
            for cid,name,typ,nn,d,pk in con.execute(f'PRAGMA table_info({t})'):
                if pk: continue
                T=(typ or '').upper()
                if name=='institution_id': row[name]=inst_id
                elif name in out[t]['refs']:
                    ref=out[t]['refs'][name]
                    if ref==t: row[name]=ids[t][0] if (ids[t] and k==1 and name in ('parent_id',)) else None      # tree: second row is a child of the first
                    elif ref in EXCLUDED or ref in ('payments','settlements','theme_presets','subscription_plans','coupons'): row[name]=None
                    else: row[name]=pick(ref,k)
                    if row[name] is None and nn and d is None: row[name]=1
                elif 'JSON' in T: row[name]=None
                elif d is not None or not nn: continue
                elif 'INT' in T or 'DECIMAL' in T: row[name]=k+1
                elif 'DATE' in T or 'TIME' in T: row[name]='2027-01-0%d'%(k+1)
                else: row[name]=f'{t[:6]}-{name[:8]}-{inst_id}-{k}'
            # polymorphic pairs: alternate target type, point at a real row
            for pp in out[t]['poly']:
                if isinstance(pp['targets'],dict):
                    tv=list(pp['targets'])[k%len(pp['targets'])]; tgt=pp['targets'][tv]
                    row[pp['type_col']]=tv; row[pp['id_col']]=pick(tgt,k)
            # id-carrying JSON built from real ids
            def put(c,val): 
                if c in [x[1] for x in con.execute(f'PRAGMA table_info({t})')]: row[c]=json.dumps(val)
            if t=='institution_events': put('program_ids',[pick('programs',0),pick('programs',1)])
            if t=='online_payments': put('items',[{'enrollment_id':pick('enrollments',k),'batch_id':pick('batches',k),'fee_category_id':pick('fee_categories',k),'amount':500}]); row['gateway_ref']=f'GW-{inst_id}-{k}'
            if t=='result_sheets': put('rule',{'components':[{'exam_id':pick('exams',0),'weight':60},{'best_of':1,'of':[pick('exams',0),pick('exams',1)],'weight':40}]})
            if t=='final_results': put('details',{str(pick('subjects',0)):{'pct':80},str(pick('subjects',1)):{'pct':70}})
            if t=='fee_refunds': put('refund_lines',[{'fee_payment_id':pick('fee_payments',k),'amount':100}])
            if t=='admission_draws': put('result',{'order':[pick('admission_leads',0),pick('admission_leads',1)]})
            if t=='exam_attempts': put('answers',{str(pick('exam_questions',0)):'A',str(pick('exam_questions',1)):'B'})
            if t=='bonus_schemes': put('applies_to',{'payee_types':['teacher'],'exclude':[{'type':'teacher','id':pick('teachers',0)},{'type':'staff','id':pick('staff_members',0)}]})
            if t=='sms_campaigns': put('audience',{'type':'batch','ids':[pick('batches',0)]})
            if t=='payroll_items': put('breakdown',[{'code':'basic','source':'structure','amount':1},{'code':'bonus','source':'adjustment','ref_id':pick('salary_adjustments',k),'amount':2},{'code':'adv','source':'advance','ref_id':pick('salary_advances',k),'amount':3}])
            for jc in [c[1] for c in con.execute(f'PRAGMA table_info({t})') if 'JSON' in (c[2] or '').upper()]:
                if jc not in row or row[jc] is None:
                    if (t,jc) in JSON_IDS: continue
                    row[jc]=json.dumps({})
                    if types[t][jc] and nn_json(con,t,jc): row[jc]=json.dumps({})
            cols_=list(row); con.execute(f"insert into {t}({','.join(cols_)}) values({','.join('?'*len(cols_))})",[row[c] for c in cols_])
            ids[t].append(con.execute('select last_insert_rowid()').fetchone()[0])
    return ids
def nn_json(con,t,c): return True

def export_rows(con,inst_id,order):
    out={}
    for t in order:
        cur=con.execute(f'select * from {t} where institution_id=? order by id',(inst_id,)); names=[d[0] for d in cur.description]
        out[t]=[dict(zip(names,r)) for r in cur.fetchall()]
    return out

def import_rows(con,data,order,out,new_inst_id):
    idmap=collections.defaultdict(dict); n=0
    cols_of={t:[c[1] for c in con.execute(f'PRAGMA table_info({t})')] for t in order}
    for t in order:
        deferred=[]
        for r in data[t]:
            row=dict(r); old=row.pop('id'); row['institution_id']=new_inst_id
            for c,ref in out[t]['refs'].items():
                if row.get(c) is None: continue
                if ref.startswith('qb_') and ref not in order: continue          # D65: the platform question-bank catalogue - global ids, kept as they are
                if (t,c) in NULL_ON_IMPORT or ref not in order and ref!=t: row[c]=None; continue
                if ref==t: deferred.append((old,c,row[c])); row[c]=None; continue
                row[c]=idmap[ref][row[c]]                                   # KeyError here = a reference the export map does not cover
            for pp in out[t]['poly']:
                if isinstance(pp['targets'],dict) and row.get(pp['id_col']) is not None:
                    row[pp['id_col']]=idmap[pp['targets'][row[pp['type_col']]]][row[pp['id_col']]]
            for jc in cols_of[t]:
                if (t,jc) in JSON_IDS and row.get(jc) is not None: row[jc]=json.dumps(JSON_IDS[(t,jc)](json.loads(row[jc]),idmap))
            for (rt,rc) in REGEN:
                if rt==t: row[rc]=f'IMP-{new_inst_id}-{old}'
            names=list(row); con.execute(f"insert into {t}({','.join(names)}) values({','.join('?'*len(names))})",[row[c] for c in names])
            idmap[t][old]=con.execute('select last_insert_rowid()').fetchone()[0]; n+=1
        for old,c,oldref in deferred: con.execute(f'update {t} set {c}=? where id=?',(idmap[t][oldref],idmap[t][old]))
    return idmap,n

def canonical(con,inst_id,order,out,json_ids=None):
    json_ids=json_ids if json_ids is not None else JSON_IDS
    """institution-independent form: drop ids/institution_id/timestamps, replace every reference by the target row's RANK inside the institution"""
    data=export_rows(con,inst_id,order); rank={t:{r['id']:i for i,r in enumerate(data[t])} for t in order}
    cols_of={t:[c[1] for c in con.execute(f'PRAGMA table_info({t})')] for t in order}
    res={}
    for t in order:
        rows=[]
        for r in data[t]:
            x={k:v for k,v in r.items() if k not in ('id','institution_id') and not k.endswith('_at') and k not in ('gateway_ref',) and (t,k) not in REGEN}
            for c,ref in out[t]['refs'].items():
                if x.get(c) is not None and ref in rank: x[c]=('ref',ref,rank[ref].get(x[c],'DANGLING'))
            for pp in out[t]['poly']:
                if isinstance(pp['targets'],dict) and x.get(pp['id_col']) is not None: x[pp['id_col']]=('ref',pp['targets'][x[pp['type_col']]],rank[pp['targets'][x[pp['type_col']]]].get(x[pp['id_col']],'DANGLING'))
            for jc in cols_of[t]:
                if (t,jc) in json_ids and x.get(jc) is not None:
                    try: x[jc]=json.dumps(json_ids[(t,jc)](json.loads(x[jc]),rank),sort_keys=True)   # ids inside JSON -> their RANK, so A and B become comparable
                    except KeyError as e: x[jc]=f'DANGLING-ID-IN-JSON {e}'
            rows.append(x)
        res[t]=rows
    return res

def run_roundtrip(root,truth=None):
    """truth = (order, out) of the PRISTINE map: it fills the data and judges the result. The map under test (current module globals) only drives the import."""
    con,m,tabs,cols,fks,inc,order_test,out_test=build_export_map(root)
    if truth is None: truth=(order_test,out_test)
    order_t,out_t=truth
    types={t:{c[1]:(c[2] or '').upper() for c in con.execute(f'PRAGMA table_info({t})')} for t in tabs}
    for name in ('A','B'): con.execute("insert into institutions(id,name,slug) values (?,?,?)",({'A':1,'B':2}[name],f'Inst {name}',f'inst-{name.lower()}'))
    ids=populate(con,1,order_t,out_t,types,fks)                       # ground truth decides which columns carry ids
    total=sum(len(v) for v in ids.values())
    data=export_rows(con,1,order_t)
    idmap,n=import_rows(con,data,order_test,out_test,2)               # the map under test decides how ids are remapped
    report={'tables':len(order_t),'rows_A':total,'rows_imported':n,'problems':[]}
    for t in order_t:                                                    # (1) counts
        a=con.execute(f'select count(*) from {t} where institution_id=1').fetchone()[0]; b=con.execute(f'select count(*) from {t} where institution_id=2').fetchone()[0]
        if a!=b: report['problems'].append(f'count {t}: A={a} B={b}')
    for t in order_t:                                                    # (2)+(3) every true reference of B points inside B
        for c,ref in out_t[t]['refs'].items():
            if ref not in order_t: continue
            bad=con.execute(f"select count(*) from {t} x where x.institution_id=2 and x.{c} is not null and not exists (select 1 from {ref} y where y.id=x.{c} and y.institution_id=2)").fetchone()[0]
            if bad: report['problems'].append(f'B.{t}.{c} -> {ref}: {bad} reference(s) outside B (leak or dangling)')
        for pp in out_t[t]['poly']:
            if not isinstance(pp['targets'],dict): continue
            for tv,tgt in pp['targets'].items():
                bad=con.execute(f"select count(*) from {t} x where x.institution_id=2 and x.{pp['type_col']}=? and x.{pp['id_col']} is not null and not exists (select 1 from {tgt} y where y.id=x.{pp['id_col']} and y.institution_id=2)",(tv,)).fetchone()[0]
                if bad: report['problems'].append(f'B.{t}.{pp["id_col"]} ({tv}) -> {tgt}: {bad} outside B')
    ca=canonical(con,1,order_t,out_t,TRUE_JSON_IDS); cb=canonical(con,2,order_t,out_t,TRUE_JSON_IDS)   # (4) structural identity, JSON ids included
    for t in order_t:
        if ca[t]!=cb[t]: report['problems'].append(f'structure differs in {t}')
    return report,con,out_t,order_t

if __name__=='__main__' and '--roundtrip' in sys.argv:
    rep,*_=run_roundtrip(sys.argv[1])
    print(json.dumps({k:v for k,v in rep.items()},ensure_ascii=False,indent=1))
    sys.exit(1 if rep['problems'] else 0)


def mutation_selftest(root):
    """Break the export map in six different ways; the round-trip MUST notice every one (otherwise the proof is worthless)."""
    import copy
    saved=dict(OVERRIDES=dict(OVERRIDES),CONTEXT=dict(CONTEXT),JSON_IDS=dict(JSON_IDS),JSON_DEPS={k:list(v) for k,v in JSON_DEPS.items()},REGEN=set(REGEN))
    def restore():
        OVERRIDES.clear(); OVERRIDES.update(saved['OVERRIDES']); CONTEXT.clear(); CONTEXT.update(saved['CONTEXT'])
        JSON_IDS.clear(); JSON_IDS.update(saved['JSON_IDS']); JSON_DEPS.clear(); JSON_DEPS.update({k:list(v) for k,v in saved['JSON_DEPS'].items()}); REGEN.clear(); REGEN.update(saved['REGEN'])
    muts=[
     ('forget a non-FK reference: enrollments.optional_subject_id',lambda: OVERRIDES.__setitem__('optional_subject_id',None)),
     ('forget a non-FK reference: fee_payments.collected_by',lambda: OVERRIDES.__setitem__('collected_by',None)),
     ('forget the JSON handler for exam_attempts.answers',lambda: JSON_IDS.pop(('exam_attempts','answers'))),
     ('forget the import-order dependency exam_attempts -> exam_questions',lambda: JSON_DEPS.pop('exam_attempts')),
     ('map fee_installments.payment_id to the platform payments table',lambda: CONTEXT.__setitem__(('fee_installments','payment_id'),'payments')),
     ('do not regenerate the globally unique online_payments.gateway_ref',lambda: REGEN.clear()),
    ]
    _c,_m,_t,_cols,_fks,_inc,truth_order,truth_out=build_export_map(root)           # pristine, before any mutation
    out=[]
    for name,patch in muts:
        patch()
        try: rep,*_=run_roundtrip(root,truth=(truth_order,truth_out)); detected=bool(rep['problems']); how=rep['problems'][0][:70] if detected else 'NOT DETECTED'
        except Exception as e: detected=True; how=f'{type(e).__name__}: {str(e)[:60]}'
        finally: restore()
        out.append((name,detected,how))
    return out

if __name__=='__main__' and '--selftest' in sys.argv:
    res=mutation_selftest(sys.argv[1])
    for name,det,how in res: print(('CAUGHT ' if det else 'MISSED ')+name+'  ->  '+how)
    sys.exit(0 if all(d for _,d,_ in res) else 1)

if __name__=='__main__' and '--check' in sys.argv:
    root=sys.argv[1]; con=load_schema(root); tabs,cols,fks,tenant,out,unres=build_map(con)
    ue=unresolved_exported(root)
    print('tenant tables:',len(tenant),'| exported:',len(exported_tables(tenant)),'| excluded:',len(EXCLUDED),'| id columns resolved:',sum(len(v['refs']) for v in out.values()),
          '| without any foreign key:',sum(1 for t in out for c in out[t]['refs'] if c not in fks[t]),'| polymorphic pairs:',sum(len(v['poly']) for v in out.values()))
    bp=backup_policy_problems(root)
    print('unresolved id columns in EXPORTED tables:',ue,'| map fresh:',map_is_fresh(root),'| backup-policy problems:',bp)
    sys.exit(1 if ue or bp or not map_is_fresh(root) else 0)
