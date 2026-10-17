#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
docs/pricing/build_selfhosted_pdf.py - the CLIENT-facing licence and price list for installing the product on the client's OWN server (not a subscription).
Inputs: docs/pricing/selfhosted/settings.json (this edition's numbers) + the shared docs/pricing/settings.json (size tiers, class prices, example bundles, contact), modules.csv, features.csv.
    python3 docs/pricing/build_selfhosted_pdf.py            build  docs/pricing/Selfhosted-Pricing-bn.pdf
    python3 docs/pricing/build_selfhosted_pdf.py --check    no browser: inputs, exclusions, arithmetic (computed twice), watermark, wording
While  "approved": false  in selfhosted/settings.json every page carries the DRAFT watermark. Internal notes (gaps, open decisions) are NOT in this document: docs/SELF-HOSTED.md.
"""
import os, re, sys, json, html as _h
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
import pricing_calc as P, selfhosted_calc as H, build_client_pdf as B
OUT = os.path.join(HERE, 'Selfhosted-Pricing-bn.pdf')
esc, bn, tk = B.esc, B.bn, B.tk

def excluded(f, SH):
    ex = SH['exclude']; toks = {x.strip() for x in f['evidence'].split(';')}
    return f['module'] in ex['modules'] or bool(toks & set(ex['evidence']))

def milestone_label(k, FS):
    m = FS['modules'].get(k, {}).get('milestone', ''); return f'পর্ব {bn(m[1:])}' if m.startswith('M') else 'পর্ব নির্ধারিত নয়'

def build_html(S, SH, mods, it, scope, index, FS, feats):
    approved = bool(SH.get('approved')); T = S['tiers']; t1 = T[0]; name = esc(S['product_name']); ct = S['contact']
    fbm = {}
    for f in feats:
        if not excluded(f, SH): fbm.setdefault(f['module'], []).append(f)
    nF = sum(len(v) for v in fbm.values())
    cats = S['categories']; usable = {k: r for k, r in mods.items() if k not in SH['exclude']['modules']}
    bycat = {c[0]: [r for r in usable.values() if r['category'] == c[0]] for c in cats}
    def req_html(r):
        rq = P.requires_of(r)
        return '' if not rq else '<br><span class="ft">এর সাথে লাগে: ' + ', '.join(esc(mods[x]['name_bn']) for x in rq) + '</span>'
    def feat_html(k): return '<ul class="feat">' + ''.join(f'<li>{esc(f["feature_bn"])}</li>' for f in fbm.get(k, [])) + '</ul>'
    def avail(k, ty): return '●' if k in it[ty]['modules'] else '–'
    out = []; w = out.append; wm = '' if approved else '<div class="wm">খসড়া — নমুনা মূল্য</div>'
    w(f'<div class="coverband"><div class="cv1">প্রতিষ্ঠানের জন্য প্রস্তাবনা</div><div class="cv2">{name}</div><div class="cv3">নিজস্ব সার্ভারে স্থাপন — লাইসেন্স ও মূল্য-তালিকা</div></div>')
    w('<p style="font-size:15px"><b>সাবস্ক্রিপশন নয়:</b> সফটওয়্যারটি আপনার নিজের সার্ভারে বসানো হবে; লাইসেন্স একবারের, তারপর ঐচ্ছিক বার্ষিক রক্ষণাবেক্ষণ। যাদের তথ্য নিজের সার্ভারে নিজের নিয়ন্ত্রণে রাখতে হবে, বা নিজস্ব কাস্টমাইজেশন লাগবে, তাদের জন্য।</p>')
    w(f'<p class="big">{bn(nF)}টি ফিচার · {bn(len(usable))}টি মডিউল (নিজস্ব-সার্ভারে প্রযোজ্য)</p>')
    w(f'<div class="note"><b>কার জন্য:</b> {esc(SH["eligibility"])} {esc(SH["select_note"])}</div>')
    if not approved: w('<div class="draftbox"><b>খসড়া — মূল্য অনুমোদিত নয়।</b> সব টাকার অঙ্ক <b>নমুনা</b>: বাজার-গবেষণা বা খরচ-হিসাবের ভিত্তিতে নয়, শুধু কাঠামো ও হিসাব দেখানোর জন্য। প্রকৃত মূল্য নির্ধারণের পর এই সতর্কতা ও জলছাপ থাকবে না।</div>')
    w('<div class="note">পণ্যটি উন্নয়নাধীন। মডিউলগুলো নির্মাণ-পর্ব অনুযায়ী সরবরাহ হবে; কোনো তারিখের প্রতিশ্রুতি নয়। কোনো মডিউলের লাইসেন্স-ফি প্রযোজ্য হয় সেটি আপনার সার্ভারে স্থাপিত ও গ্রহণ-পরীক্ষিত হওয়ার পর।</div>')
    # 1 compare
    w('<h1 class="sec"><span class="num">১</span>সাবস্ক্রিপশন, না নিজস্ব সার্ভার?</h1><table class="t small"><tr><th style="width:22%"></th><th>সাবস্ক্রিপশন (আমাদের সার্ভারে)</th><th>নিজস্ব সার্ভারে স্থাপন</th></tr>'
      '<tr><td><b>সার্ভার ও রক্ষণাবেক্ষণ</b></td><td>আমরা চালাই</td><td>আপনার সার্ভার, আপনার দায়িত্ব; সফটওয়্যারের রক্ষণাবেক্ষণ আমরা (AMC)</td></tr>'
      '<tr><td><b>খরচের ধরন</b></td><td>মাসিক বা বার্ষিক</td><td>একবারের লাইসেন্স + স্থাপন + বার্ষিক AMC</td></tr>'
      '<tr><td><b>তথ্য কোথায়</b></td><td>আমাদের সার্ভারে</td><td><b>আপনার সার্ভারে, আপনার নিয়ন্ত্রণে</b></td></tr>'
      '<tr><td><b>আপডেট</b></td><td>স্বয়ংক্রিয়</td><td>AMC-এর আওতায় আমরা সরবরাহ ও স্থাপনে সহায়তা করি</td></tr>'
      '<tr><td><b>কাস্টমাইজেশন</b></td><td>সীমিত</td><td>সম্ভব (আলাদা মূল্যে)</td></tr>'
      '<tr><td><b>শুরুর খরচ</b></td><td>কম</td><td>বেশি</td></tr></table>')
    # 2 structure  (D47: one licence price per module, no sizes, no limits)
    ex = H.quote(S, SH, mods, ['attendance', 'fees']); exm = {l[0]: l[2] for l in ex['lines']}
    w('<h1 class="sec"><span class="num">২</span>মূল্য কীভাবে হিসাব হয়</h1><ol class="rules">'
      '<li><b>মডিউল-লাইসেন্স (একবার):</b> যে মডিউলগুলো নেবেন প্রতিটির আলাদা লাইসেন্স — সবার জন্য একই মূল্য, ছোট-বড় ভেদ নেই। কিছু মডিউল অন্য মডিউল ছাড়া চলে না ("এর সাথে লাগে", §৪)।</li>'
      '<li><b>যেকোনো একটি মডিউল:</b> শুধু যেটুকু দরকার তার কোড নিতে পারেন; পরে আরও যোগ করা যায়। ভিত্তি (ছাত্র, শ্রেণি-শাখা, লগইন, নিরাপত্তা) সাথে অন্তর্ভুক্ত।</li>'
      '<li><b>স্থাপন ও সেটআপ (একবার):</b> আপনার সার্ভারে সফটওয়্যার বসানো, কনফিগারেশন, ব্যাকআপ-ব্যবস্থা (§৫)।</li>'
      '<li><b>বার্ষিক রক্ষণাবেক্ষণ ও সহায়তা (AMC, ঐচ্ছিক):</b> লাইসেন্স-ফির একটি শতাংশ (§৭)।</li>'
      '<li><b>ঐচ্ছিক:</b> কাস্টমাইজেশন (দিন-ভিত্তিক), অতিরিক্ত প্রশিক্ষণ, সোর্স-কোড মালিকানা।</li>'
      '<li><b>আপনার নিজের খরচ:</b> সার্ভার, SMS-গেটওয়ে, পেমেন্ট-গেটওয়ে ইত্যাদি (§৮)।</li></ol>')
    w(f'<div class="note"><b>উদাহরণ:</b> হাজিরা ও ফি নিলে লাইসেন্স = হাজিরা {tk(exm["attendance"], S)} + ফি {tk(exm["fees"], S)} = <b>{tk(ex["license"], S)}</b> (একবার)। বার্ষিক AMC ≈ <b>{tk(ex["amc"], S)}</b>।{"" if approved else " <span class=dim>(নমুনা-সংখ্যা)</span>"}</div>')
    # 3 foundation + no limits + source ownership
    w('<h1 class="sec"><span class="num">৩</span>ভিত্তি, সীমাহীন ব্যবহার ও সোর্স-কোড মালিকানা</h1>')
    w('<div class="note"><b>কোনো সংখ্যার সীমা নেই।</b> আপনার নিজের সার্ভারে ছাত্র, শিক্ষক, ব্যবহারকারী, ব্যাচ বা তথ্যের কোনো সংখ্যার সীমা নেই; সীমা শুধু আপনার সার্ভারের সক্ষমতা। SMS-ক্রেডিট, অনলাইন-পেমেন্টের গেটওয়ে-ফি ও AI-ব্যবহার আপনার নিজের গেটওয়ে/সেবার সাথে আলাদা, ব্যবহার-ভিত্তিক।</div>')
    w('<h3>ভিত্তিতে যা আছে (যেকোনো মডিউলের সাথে অন্তর্ভুক্ত, আলাদা মূল্য নেই)</h3>')
    for r in bycat.get('base', []): w(f'<p style="margin:8px 0 2px"><b>{esc(r["name_bn"])}</b> <span class="dim">— {esc(r["desc_bn"])}</span></p>' + feat_html(r['key']))
    w('<p style="margin:8px 0 2px"><b>প্ল্যাটফর্ম ও নিরাপত্তা</b> <span class="dim">— লগইন, নিরাপত্তা, সেটিং, ভাষা, থিম, অডিট</span></p>' + feat_html('platform'))
    so = SH['source_ownership']
    w(f'<h3>{esc(so["title"])}</h3><p>লাইসেন্স-ফির সাথে একটি গুণক যোগ করে নিতে পারেন (§৯-এর প্যাকেজে অঙ্ক দেখানো)। এতে:</p><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in so['includes']) + '</ul><p><b>শর্ত:</b></p><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in so['restrictions']) + '</ul>')
    # 4 each module
    w('<h1 class="sec"><span class="num">৪</span>প্রতিটি মডিউলের লাইসেন্স ও ফিচার</h1>')
    w('<p>● = সেই ধরনের প্রতিষ্ঠানে পাওয়া যায়। <b>মূল্য মডিউল-পিছু, একবারের লাইসেন্স — সবার জন্য একই;</b> মডিউলের নিচের সব ফিচার মূল্যের মধ্যে।</p>')
    n = 0; FSM = json.loads(open(os.path.join(ROOT, 'docs/release/full-scope.json'), encoding='utf-8').read())
    for cid, ctitle, cnote in cats:
        rs = bycat.get(cid, [])
        if not rs or cid == 'base': continue
        n += 1; head = ''.join(f'<th style="width:6%">{d}</th>' for _, d in B.TYPE_NAMES); body = ''
        for r in rs:
            k = r['key']; p1 = H.lic_module(S, SH, r)
            body += (f'<tbody class="mod"><tr><td><b>{esc(r["name_bn"])}</b><br><span class="dim">{esc(r["desc_bn"])}</span>{req_html(r)}</td>' + ''.join(f'<td class="dot">{avail(k, ty)}</td>' for ty, _ in B.TYPE_NAMES) +
                     f'<td class="dim">{esc(milestone_label(k, FSM))}</td><td class="price">{tk(p1, S)}</td></tr><tr class="frow"><td colspan="7">{feat_html(k)}</td></tr></tbody>')
        w(f'<h3>{bn(n)}. {esc(ctitle)}</h3><table class="t small f"><tr><th>মডিউল</th>{head}<th style="width:13%">সরবরাহ-পর্ব</th><th style="width:16%">লাইসেন্স (একবার)</th></tr>{body}</table>')
    w(f'<p class="dim">{esc(SH["delivery_note"])}</p>')
    # 5 install
    w('<h1 class="sec"><span class="num">৫</span>স্থাপন ও সেটআপ (একবার)</h1><table class="t"><tr><th>কাজ</th><th style="width:14%">ধরন</th><th style="width:20%">মূল্য</th></tr>' + ''.join(f'<tr><td>{esc(i["name"])}</td><td class="dim">{"অপরিহার্য" if i["required"] else "ঐচ্ছিক"}</td><td class="price">{tk(i["price"], S)}</td></tr>' for i in SH['install']) + '</table>')
    w('<p><b>স্থাপনের মূল্যের মধ্যে:</b></p><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in SH['included_in_install']) + '</ul>')
    w('<h3>অন্যান্য একবারের সেবা</h3><table class="t small"><tr><th>সেবা</th><th style="width:20%">মূল্য</th></tr>' + ''.join(f'<tr><td>{esc(o["name"])}</td><td class="price">{tk(o["price"], S)}</td></tr>' for o in S['one_time'] if 'ডোমেইন' not in o['name'] and 'সেটআপ ও প্রশিক্ষণ' not in o['name']) + '</table>')
    # 6 custom
    cd = SH['custom_dev']
    w(f'<h1 class="sec"><span class="num">৬</span>কাস্টমাইজেশন</h1><p>আপনার নিজস্ব প্রয়োজনে নতুন ফিচার বা বদল: <b>প্রতি কর্মদিবস {tk(cd["day_rate"], S)}</b>। {esc(cd["note"])}</p><p>{esc(cd["ownership"])}</p>')
    # 7 AMC
    am = SH['amc']; sla = SH['sla']; show = lambda v: esc(v) if v else 'চুক্তিতে নির্ধারিত'
    w(f'<h1 class="sec"><span class="num">৭</span>বার্ষিক রক্ষণাবেক্ষণ ও সহায়তা (AMC)</h1><p><b>{esc(am["optional_note"])}</b></p><table class="t"><tr><th></th><th>স্ট্যান্ডার্ড</th><th>প্রায়োরিটি</th></tr>'
      f'<tr><td><b>বার্ষিক মূল্য</b></td><td class="price">লাইসেন্সের {bn(am["percent"])}%</td><td class="price">লাইসেন্সের {bn(am["percent"] + am["priority_extra_percent"])}%</td></tr>'
      f'<tr><td><b>সাড়া-সময়</b></td><td>{show(sla["standard_response"])}</td><td>{show(sla["priority_response"])}</td></tr><tr><td><b>সহায়তার সময়</b></td><td colspan="2">{show(sla["hours"])}</td></tr></table>')
    w(f'<p><b>AMC-তে আছে:</b></p><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in am['includes']) + '</ul><p><b>AMC-তে নেই:</b></p><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in am['excludes']) + f'</ul><p>{esc(am["if_not_taken"])} স্থাপনের পর <b>প্রথম {bn(am["warranty_days"])} দিন ওয়ারেন্টি</b> (ত্রুটি-সংশোধন বিনামূল্যে), AMC তার পর থেকে।</p>')
    # 8 customer side
    w('<h1 class="sec"><span class="num">৮</span>আপনার নিজের খরচ ও দায়িত্ব</h1><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in SH['customer_costs']) + f'</ul><div class="note"><b>সার্ভার:</b> {esc(SH["server_recommendation"])}</div>')
    # 9 packages
    w('<h1 class="sec"><span class="num">৯</span>নমুনা-প্যাকেজ ও সাবস্ক্রিপশনের সাথে তুলনা</h1><p>উদাহরণ মাত্র; মূল্য সবার জন্য একই। দুই পথের খরচ পাশাপাশি।</p>')
    for b in S['bundles']:
        keys = [k for k in b['modules'] if k not in SH['exclude']['modules']]; q = H.quote(S, SH, mods, keys)
        body = ''.join(f'<tr><td>{esc(nm)}' + (' <span class="ft">(সঙ্গী মডিউল — এটি ছাড়া চলে না)</span>' if added else '') + f'</td><td class="price">{tk(pr, S)}</td></tr>' for _, nm, pr, added in q['lines'])
        w(f'<h3>{esc(b["name"])}</h3><table class="t small"><tr><th>মডিউল</th><th style="width:22%">লাইসেন্স (একবার)</th></tr>{body}<tr class="tot"><td>লাইসেন্স মোট</td><td class="price">{tk(q["license"], S)}</td></tr>'
          f'<tr><td>অপরিহার্য স্থাপন ও সেটআপ</td><td class="price">{tk(q["install"], S)}</td></tr><tr><td>বার্ষিক AMC (স্ট্যান্ডার্ড, ঐচ্ছিক)</td><td class="price">{tk(q["amc"], S)} / বছর</td></tr>'
          + (f'<tr><td>সোর্স-কোড মালিকানা (ঐচ্ছিক)</td><td class="price">{tk(q["source"], S)}</td></tr>' if q['source'] else '') + '</table>'
          f'<table class="t small"><tr><th>তুলনা (আপনার সার্ভার/কর্মীর খরচ বাদে)</th><th style="width:22%">নিজস্ব সার্ভার</th><th style="width:22%">সাবস্ক্রিপশন</th></tr><tr><td>৩ বছরে মোট</td><td class="price">{tk(q["three_year"], S)}</td><td class="price">{tk(q["saas_three_year"], S)}</td></tr><tr><td>৫ বছরে মোট</td><td class="price">{tk(q["five_year"], S)}</td><td class="price">{tk(q["saas_five_year"], S)}</td></tr></table>')
    w('<p class="dim">তুলনায় সাবস্ক্রিপশনে সার্ভার ও আপডেট অন্তর্ভুক্ত; নিজস্ব সার্ভারে সার্ভার-ভাড়া, ইন্টারনেট ও দায়িত্বপ্রাপ্ত ব্যক্তির খরচ আপনার আলাদা (§৮)।</p>')
    # 10 payment
    w('<h1 class="sec"><span class="num">১০</span>পরিশোধ-সূচি</h1><table class="t"><tr><th>ধাপ</th><th style="width:16%">অংশ</th></tr>' + ''.join(f'<tr><td>{esc(x["label"])}</td><td class="price">{bn(x["percent"])}%</td></tr>' for x in SH['payment_schedule']) + '</table><p class="dim">সূচি লাইসেন্স ও স্থাপন-ফির জন্য; প্রতিটি মডিউলের লাইসেন্স-ফি সেই মডিউল স্থাপিত ও গৃহীত হওয়ার পর। (খসড়া — আপনি ঠিক করবেন।)</p>')
    # 11 not included, 12 terms, 13 faq, 14 contact
    w('<h1 class="sec"><span class="num">১১</span>এই সংস্করণে যা থাকে না</h1><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in SH['not_included']) + '</ul>')
    w('<h1 class="sec"><span class="num">১২</span>লাইসেন্স, তথ্য ও নিরাপত্তা' + ('' if approved else ' (খসড়া)') + '</h1><ul class="b">' + ''.join(f'<li>{esc(x)}</li>' for x in SH['terms']) + '</ul>')
    w('<h1 class="sec"><span class="num">১৩</span>সাধারণ প্রশ্ন</h1><table class="t small">'
      '<tr><td style="width:30%"><b>একাধিক শাখা চালানো যাবে?</b></td><td>একটি প্রতিষ্ঠানের একাধিক শাখা "একাধিক শাখা" মডিউলে (লাইসেন্স আলাদা)। সম্পূর্ণ আলাদা প্রতিষ্ঠান হলে আলাদা লাইসেন্স।</td></tr>'
      '<tr><td><b>পরে সাবস্ক্রিপশনে যাওয়া যাবে?</b></td><td>আপনার তথ্য আমদানি করে সাবস্ক্রিপশনে যাওয়ার ব্যবস্থা আলোচনা সাপেক্ষে।</td></tr>'
      '<tr><td><b>নতুন মডিউল পরে নেওয়া যাবে?</b></td><td>হ্যাঁ — তখনকার মূল্য-তালিকা অনুযায়ী লাইসেন্স কিনে আপনার সার্ভারে স্থাপন।</td></tr>'
      '<tr><td><b>ছাত্র বা ব্যবহারকারী বাড়লে?</b></td><td>কোনো সংখ্যার সীমা নেই; লাইসেন্সের মূল্য বদলায় না। সীমা শুধু আপনার সার্ভারের সক্ষমতা।</td></tr>'
      '<tr><td><b>শুধু একটি মডিউলের কোড নেওয়া যায়?</b></td><td>হ্যাঁ। কোনো মডিউলের সাথে আরেকটি লাগলে মূল্য-তালিকায় "এর সাথে লাগে" লেখা আছে।</td></tr>'
      '<tr><td><b>ইন্টারনেট ছাড়া চলে?</b></td><td>অভ্যন্তরীণ নেটওয়ার্কে চলতে পারে, কিন্তু SMS, অনলাইন-পেমেন্ট ও আপডেটে ইন্টারনেট লাগে।</td></tr></table>')
    c = lambda v, ph: esc(v) if v else f'<span class="dim">[{ph}]</span>'
    w(f'<h1 class="sec"><span class="num">১৪</span>যোগাযোগ</h1><p>ফোন: {c(ct.get("phone"), "ফোন নম্বর")}<br>ইমেইল: {c(ct.get("email"), "ইমেইল")}<br>ওয়েবসাইট: {c(ct.get("web"), "ওয়েবসাইট")}<br>ঠিকানা: {c(ct.get("address"), "ঠিকানা")}</p>')
    foot = f'{name} — নিজস্ব সার্ভারে স্থাপন: লাইসেন্স ও মূল্য' + ('' if approved else ' — খসড়া, মূল্য অনুমোদিত নয়')
    title = f'{S["product_name"]} — নিজস্ব সার্ভারে স্থাপন: লাইসেন্স ও মূল্য-তালিকা' + ('' if approved else ' (খসড়া)')
    return f'<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>{esc(title)}</title><style>{B.BUILD_CSS}{B.EXTRA_CSS}</style></head><body>{wm}{"".join(out)}</body></html>', foot

def facts():
    S, mods, it, scope, index = B.facts(); import csv
    return S, H.load_sh(), mods, it, scope, index, json.load(open(os.path.join(ROOT, 'docs/release/full-scope.json'), encoding='utf-8')), B.load_features()

def check():
    S, SH, mods, it, scope, index, FS, feats = facts(); bad = []
    ex = SH['exclude']
    for k in ex['modules']:
        if k not in mods: bad.append(f'exclusion names an unknown module: {k}')
    seen = {t for f in feats for t in [x.strip() for x in f['evidence'].split(';')]}
    for t in ex['evidence']:
        if t not in seen: bad.append(f'exclusion matches no feature (stale): {t}')
    for k in ('license_months', 'license_round_to'):
        if not isinstance(SH.get(k), (int, float)) or SH[k] <= 0: bad.append(f'{k} must be a positive number')
    if not 0 < SH['amc']['percent'] < 100 or SH['amc']['priority_extra_percent'] < 0: bad.append('AMC percentages out of range')
    if sum(x['percent'] for x in SH['payment_schedule']) != 100: bad.append('payment schedule must add up to 100%')
    if not any(i['required'] for i in SH['install']): bad.append('at least one installation item must be required')
    for b in S['bundles']:
        for k in b['modules']:
            if k in ex['modules']: bad.append(f'bundle {b["name"]} uses {k}, which this edition excludes')
    bad += P.structure_problems(S, mods, it)
    if bad: return bad
    try: bad += H.selftest()
    except Exception as e: return bad + [f'self-hosted arithmetic failed: {type(e).__name__}: {e}']
    if bad: return bad
    try: h, foot = build_html(S, SH, mods, it, scope, index, FS, feats)
    except Exception as e: return bad + [f'could not build the document: {type(e).__name__}: {e}']
    draft = 'খসড়া — নমুনা মূল্য' in h
    if draft == bool(SH.get('approved')): bad.append('the DRAFT watermark must be present exactly when "approved" is false')
    visible = re.sub(r'<style.*?</style>', ' ', h, flags=re.S); visible = _h.unescape(re.sub(r'<[^>]+>', ' ', visible))
    leak = sorted(set(re.findall(r'\bR\d(?:\.\d)?\b|Release|Spike|agent|এজেন্ট|guard|গার্ড|docs/|LOCKED|verify|\bD\d{1,2}\b|\bOD-|PM-\d|\bM\d\b|SELF-HOSTED|আকার-স্তর|ছাত্র-সংখ্যা অনুযায়ী|ছোট স্কুল|বড় স্কুল|ভিত্তি-ফি|ভিত্তি-লাইসেন্স', visible)))
    if leak: bad.append(f'internal wording leaked into the CLIENT document: {leak[:6]}')
    for must in ('ডোমেইন', 'AMC', 'পরিশোধ-সূচি'):
        if must not in visible: bad.append(f'section missing: {must}')
    left = [f['feature_bn'][:24] for f in feats if not excluded(f, SH) and f['module'] in ex['modules']]
    if left: bad.append('excluded module feature still listed')
    if not SH.get('source_ownership_multiple'): bad.append('D46: source-code ownership is sold, so source_ownership_multiple must be set')
    for must in ('ডেভেলপার', 'সম্পূর্ণ ঐচ্ছিক', 'মালিকানা আমাদের', 'শুধু সেগুলো নিতে পারবেন', 'সোর্স-কোড মালিকানা', 'কোনো সংখ্যার সীমা নেই', 'এর সাথে লাগে'):
        if must not in visible: bad.append(f'D46 condition missing from the client document: "{must}"')
    if SH.get('approved'):
        if not S['contact'].get('phone') or not S['contact'].get('email'): bad.append('approved prices need contact phone and email in docs/pricing/settings.json')
        if not S.get('valid_until'): bad.append('approved prices need valid_until in docs/pricing/settings.json')
    return bad

def main():
    if '--check' in sys.argv:
        bad = check(); print('self-hosted price list:', 'OK' if not bad else '\n  ' + '\n  '.join(bad)); return 1 if bad else 0
    bad = check()
    if bad: print('REFUSING to build - fix first:\n  ' + '\n  '.join(bad)); return 1
    S, SH, mods, it, scope, index, FS, feats = facts(); h, foot = build_html(S, SH, mods, it, scope, index, FS, feats); B.render(h, foot, OUT)
    from pypdf import PdfReader
    print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(PdfReader(OUT).pages)} pages; approved={SH.get("approved")}'); return 0

if __name__ == '__main__': sys.exit(main())
