(function(window,document){'use strict';
const VERSION='1.0.6';
let R=window.QmxDiagramRegistry;
if(!R){console.error('[QMX Diagram] Registry missing.');return;}
const S={open:false,subject:'general',view:'recommended',search:'',category:'all',handlers:new Map(),root:null,dialog:null,tools:null,count:null,subjectEl:null,searchEl:null,categoryEl:null,status:null,activeTextarea:null,previousFocus:null,busyTool:'',busyToken:0};

function currentRegistry(){
 const next=window.QmxDiagramRegistry;
 if(next?.tools&&next?.subjects)R=next;
 return R;
}
function refillSelect(select,items,value){
 if(!select)return;select.innerHTML='';items.forEach(item=>select.add(new Option(item.label,item.value)));
 if(items.some(item=>item.value===value))select.value=value;
}
function syncRegistry(force=false){
 const previous=R,next=window.QmxDiagramRegistry;if(!next?.tools||!next?.subjects)return false;R=next;
 if(!S.root||(!force&&previous===next))return true;
 const subjectValue=S.subject,categoryValue=S.category;
 refillSelect(S.subjectEl,R.subjects.map(x=>({label:x.label,value:x.id})),subjectValue);
 refillSelect(S.categoryEl,Object.entries(R.categoryLabels).map(([value,label])=>({label,value})),categoryValue);
 S.subject=R.findSubject(subjectValue)?.id||R.subjects[0]?.id||'general';S.subjectEl.value=S.subject;
 if(!Array.from(S.categoryEl.options).some(o=>o.value===categoryValue))S.category='all';S.categoryEl.value=S.category;
 if(S.open)render();return true;
}
function announceReady(){
 document.dispatchEvent(new CustomEvent('qmx:diagram-launcher-ready',{detail:{version:VERSION,registry:currentRegistry()}}));
}
function onRegistryUpdate(){const previous=R;if(syncRegistry()&&R!==previous)announceReady();}

function addStyles(){
 if(document.getElementById('qmx-diagram-launcher-styles'))return;
 const s=document.createElement('style');s.id='qmx-diagram-launcher-styles';
 s.textContent=`
.qmx-diagram-launcher[hidden]{display:none!important}.qmx-diagram-launcher{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.55);backdrop-filter:blur(2px)}
.qmx-diagram-dialog{width:min(980px,100%);max-height:min(88vh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #dbe4ef;border-radius:18px;background:#fff;color:#0f172a;box-shadow:0 24px 70px rgba(15,23,42,.24)}
.qmx-diagram-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 14px;border-bottom:1px solid #e2e8f0}.qmx-diagram-title{margin:0;font-size:20px}.qmx-diagram-subtitle{margin:5px 0 0;color:#64748b;font-size:13px}
.qmx-diagram-close{width:38px;height:38px;border:1px solid #dbe4ef;border-radius:10px;background:#fff;color:#334155;font-size:22px;cursor:pointer}
.qmx-diagram-controls{display:grid;grid-template-columns:minmax(200px,1.15fr) minmax(210px,1.4fr) minmax(170px,.9fr);gap:12px;padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.qmx-diagram-field{display:grid;gap:5px;color:#475569;font-size:12px;font-weight:700}.qmx-diagram-field select,.qmx-diagram-field input{width:100%;min-width:0;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;padding:9px 11px;font-size:14px;font-weight:400}
.qmx-diagram-tabs{display:flex;align-items:center;gap:8px;padding:12px 20px 0}.qmx-diagram-tab{border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#334155;padding:8px 13px;font-size:13px;font-weight:700;cursor:pointer}.qmx-diagram-tab.is-active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.qmx-diagram-note{margin-left:auto;color:#64748b;font-size:12px}
.qmx-diagram-body{min-height:280px;overflow:auto;padding:14px 20px 20px}.qmx-diagram-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.qmx-diagram-tool{position:relative;display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:start;min-height:116px;border:1px solid #dbe4ef;border-radius:14px;background:#fff;padding:13px;text-align:left;cursor:pointer}.qmx-diagram-tool:hover,.qmx-diagram-tool:focus-visible{border-color:#60a5fa;background:#f8fbff;box-shadow:0 7px 20px rgba(37,99,235,.08)}.qmx-diagram-tool:disabled{cursor:wait;opacity:.72}.qmx-diagram-tool.is-loading{border-color:#2563eb;background:#eff6ff}.qmx-diagram-tool.is-loading .qmx-diagram-status-badge::before{content:'';display:inline-block;width:8px;height:8px;margin-right:5px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:qmx-diagram-spin .7s linear infinite}@keyframes qmx-diagram-spin{to{transform:rotate(360deg)}}
.qmx-diagram-tool-badge{display:grid;place-items:center;width:56px;height:48px;border:1px solid #bfdbfe;border-radius:11px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800}.qmx-diagram-tool-title{display:block;color:#0f172a;font-size:14px;font-weight:800}.qmx-diagram-tool-title-bn{display:block;margin-top:2px;color:#334155;font-size:13px;font-weight:700}.qmx-diagram-tool-description{display:block;margin-top:7px;color:#64748b;font-size:12px;line-height:1.4}
.qmx-diagram-status-badge{position:absolute;right:10px;bottom:9px;border-radius:999px;background:#f1f5f9;color:#64748b;padding:3px 7px;font-size:10px;font-weight:800}.qmx-diagram-empty{display:grid;place-items:center;min-height:240px;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b;text-align:center;padding:24px}
.qmx-diagram-footer{display:flex;align-items:center;gap:12px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#f8fafc}.qmx-diagram-status{min-height:20px;color:#475569;font-size:12px}.qmx-diagram-footer-note{margin-left:auto;color:#64748b;font-size:11px}.qmx-ribbon-button.is-diagram-open{border-color:#93c5fd!important;background:#eff6ff!important}
@media(max-width:820px){.qmx-diagram-launcher{padding:8px}.qmx-diagram-dialog{max-height:95vh;border-radius:14px}.qmx-diagram-controls{grid-template-columns:1fr 1fr}.qmx-diagram-field:first-child{grid-column:1/-1}.qmx-diagram-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.qmx-diagram-header{padding:14px}.qmx-diagram-controls{grid-template-columns:1fr;padding:12px 14px}.qmx-diagram-field:first-child{grid-column:auto}.qmx-diagram-tabs{padding:10px 14px 0;flex-wrap:wrap}.qmx-diagram-note{width:100%;margin-left:0}.qmx-diagram-body{padding:12px 14px 16px}.qmx-diagram-grid{grid-template-columns:1fr}.qmx-diagram-footer{padding:10px 14px}.qmx-diagram-footer-note{display:none}}
`;document.head.appendChild(s);
}
function activeTextarea(){
 const a=document.activeElement;if(a&&a.tagName==='TEXTAREA'&&!a.disabled)return a;
 return Array.from(document.querySelectorAll('textarea')).find(t=>{const r=t.getBoundingClientRect(),cs=getComputedStyle(t);return !t.disabled&&r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';})||null;
}
function subjectLabel(){
 const b=document.querySelector('[data-diagram-launcher][data-diagram-subject-label]');
 const buttonLabel=String(b?.getAttribute('data-diagram-subject-label')||'').trim();
 if(buttonLabel)return buttonLabel;
 const c=document.querySelector('#subject_id,select[name="subject_id"],input[name="subject_id"]');if(!c)return '';
 if(c.tagName==='SELECT')return String(c.selectedOptions[0]?.textContent||c.value||'').trim();
 return String(c.getAttribute('data-subject-label')||c.value||'').trim();
}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function ensureSharedToolIconStyles(){
 if(document.getElementById('qmx-diagram-tool-icon-styles'))return;
 const s=document.createElement('style');s.id='qmx-diagram-tool-icon-styles';
 s.textContent=`
.qmx-diagram-tool-content{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center}
.qmx-diagram-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.qmx-diagram-tool-icon svg{width:18px;height:18px;display:block}
.qmx-diagram-tool-text{display:block;line-height:1.2}
.qmx-diagram-tool-text small,.qmx-diagram-tool-text span{display:block;margin-top:3px;color:#64748b}
`;
 document.head.appendChild(s);
}
function toolIconSvg(id,label){
 const map={
  select:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l12 8-5 1 3 7-2.2.9-3-6.9-4.8 3z"/></svg>',
  wire:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10"/></svg>',
  junction:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  resistor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-4 3 8 3-8 2 4h6"/></svg>',
  capacitor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h7M14 12h7M10 7v10M14 7v10"/></svg>',
  inductor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 12h3"/><path d="M5 12a2 2 0 1 1 4 0"/><path d="M9 12a2 2 0 1 1 4 0"/><path d="M13 12a2 2 0 1 1 4 0"/><path d="M17 12h5"/></svg>',
  cell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h6M15 12h6M10 7v10M14 9v6"/></svg>',
  battery:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12h4M18 12h4M8 6v12M12 9v6M16 6v12"/></svg>',
  diode:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h5"/><path d="M17 12h5"/><path d="M7 7l8 5-8 5z"/><path d="M15 7v10"/></svg>',
  led:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h5"/><path d="M17 12h5"/><path d="M7 7l8 5-8 5z"/><path d="M15 7v10"/><path d="M14 4l2-2"/><path d="M17 7l2-2"/></svg>',
  lamp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>',
  switch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="14" r="2"/><circle cx="19" cy="10" r="2"/><path d="M7 13l9-4"/></svg>',
  fuse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12h6M16 12h6"/><rect x="8" y="9" width="8" height="6" rx="1.5"/></svg>',
  ground:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v7"/><path d="M6 13h12"/><path d="M8 16h8"/><path d="M10 19h4"/></svg>',
  text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M12 6v12M8 18h8"/></svg>',
  connector:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 7c4 0 6 2 10 9"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13"/><path d="M13 7l5 5-5 5"/></svg>',
  node:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>',
  decision:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 9-8 9-8-9z"/></svg>',
  process:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
  terminator:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="10" rx="5"/></svg>',
  database:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>',
  actor:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="5" r="2.5"/><path d="M12 8v6M8 12l4 2 4-2M9 20l3-6 3 6"/></svg>',
  usecase:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7.5" ry="4.5"/></svg>',
  class:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M5 9h14M5 14h14"/></svg>',
  component:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h2v2H9zM13 9h2v2h-2zM9 13h6"/></svg>',
  package:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h6l2 2h8v8H4z"/><path d="M4 8V6h6l2 2"/></svg>',
  lifeline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.5 2.5"><rect x="7" y="3" width="10" height="4" rx="1.5" stroke-dasharray="0"/><path d="M12 7v14"/></svg>',
  circle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/></svg>',
  rectangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
  triangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 5l8 14H4z"/></svg>',
  line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 18L19 6"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-7"/></svg>',
  venn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/></svg>'
 };
 if(map[id])return map[id];
 const lowered=String(id||label||'').toLowerCase();
 const byWord=[
  ['wire','wire'],['arrow','arrow'],['flow','arrow'],['link','connector'],['connector','connector'],['node','node'],['decision','decision'],
  ['process','process'],['terminator','terminator'],['database','database'],['actor','actor'],['use-case','usecase'],['usecase','usecase'],
  ['class','class'],['component','component'],['package','package'],['lifeline','lifeline'],['chart','chart'],['plot','chart'],
  ['circle','circle'],['rect','rectangle'],['box','rectangle'],['triangle','triangle'],['line','line'],['vector','arrow'],['venn','venn']
 ];
 const match=byWord.find(([needle])=>lowered.includes(needle));
 if(match&&map[match[1]])return map[match[1]];
 const letters=String(label||id||'?').split(/[\s/-]+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?';
 return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" font-family="Arial, sans-serif">${esc(letters)}</text></svg>`;
}
function toolButtonContent(id,label,labelBn){
 ensureSharedToolIconStyles();
 return `<span class="qmx-diagram-tool-content"><span class="qmx-diagram-tool-icon" aria-hidden="true">${toolIconSvg(id,label)}</span><span class="qmx-diagram-tool-text">${esc(label)}<small>${esc(labelBn||'')}</small></span></span>`;
}
function make(){
 syncRegistry();if(S.root)return;addStyles();
 const root=document.createElement('div');root.className='qmx-diagram-launcher';root.hidden=true;root.innerHTML=`
<section class="qmx-diagram-dialog" role="dialog" aria-modal="true" aria-labelledby="qmx-diagram-title">
<header class="qmx-diagram-header"><div><h2 class="qmx-diagram-title" id="qmx-diagram-title">Subject Diagram Tools</h2><p class="qmx-diagram-subtitle">বিষয় অনুযায়ী গুরুত্বপূর্ণ editable diagram tool নির্বাচন করুন।</p></div><button type="button" class="qmx-diagram-close" aria-label="Close">&times;</button></header>
<div class="qmx-diagram-controls">
<label class="qmx-diagram-field"><span>বিষয়</span><select data-diagram-subject></select></label>
<label class="qmx-diagram-field"><span>টুল খুঁজুন</span><input type="search" data-diagram-search placeholder="যেমন: Flowchart, Circuit, Timeline"></label>
<label class="qmx-diagram-field"><span>বিভাগ</span><select data-diagram-category></select></label>
</div>
<div class="qmx-diagram-tabs" role="tablist"><button type="button" class="qmx-diagram-tab is-active" data-view="recommended">গুরুত্বপূর্ণ টুলস</button><button type="button" class="qmx-diagram-tab" data-view="all">Extra: সকল টুলস</button><span class="qmx-diagram-note">Graph ও Table আলাদা Ribbon tool।</span></div>
<div class="qmx-diagram-body"><div class="qmx-diagram-grid" data-diagram-tools></div></div>
<footer class="qmx-diagram-footer"><span class="qmx-diagram-status" data-diagram-status aria-live="polite"></span><span class="qmx-diagram-footer-note" data-diagram-count></span></footer>
</section>`;
 document.body.appendChild(root);S.root=root;S.dialog=root.querySelector('.qmx-diagram-dialog');S.tools=root.querySelector('[data-diagram-tools]');S.count=root.querySelector('[data-diagram-count]');S.subjectEl=root.querySelector('[data-diagram-subject]');S.searchEl=root.querySelector('[data-diagram-search]');S.categoryEl=root.querySelector('[data-diagram-category]');S.status=root.querySelector('[data-diagram-status]');
 syncRegistry(true);
 root.querySelector('.qmx-diagram-close').addEventListener('click',close);root.addEventListener('mousedown',e=>{if(e.target===root)close();});
 S.subjectEl.addEventListener('change',()=>{S.subject=S.subjectEl.value;S.status.textContent='';render();});
 S.searchEl.addEventListener('input',()=>{S.search=S.searchEl.value;if(S.search.trim())view('all');render();});
 S.categoryEl.addEventListener('change',()=>{S.category=S.categoryEl.value;if(S.category!=='all')view('all');render();});
 root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view(b.dataset.view);render();}));
 S.tools.addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b)select(b.dataset.tool);});
 root.addEventListener('keydown',keys);
}
function view(v){S.view=v==='all'?'all':'recommended';S.root.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===S.view));}
function list(){
 syncRegistry();const subject=R.findSubject(S.subject),q=String(S.search||'').trim().toLocaleLowerCase();
 let xs=S.view==='recommended'?subject.recommended.map(R.findTool).filter(Boolean):R.tools.slice();
 if(S.category!=='all')xs=xs.filter(x=>x.category===S.category);
 if(q)xs=xs.filter(x=>[x.label,x.labelBn,x.category,x.description,x.badge].join(' ').toLocaleLowerCase().includes(q));
 if(S.view==='all'){const rec=new Set(subject.recommended);xs.sort((a,b)=>(rec.has(a.id)?0:1)-(rec.has(b.id)?0:1)||a.label.localeCompare(b.label));}
 return xs;
}
function announceRendered(xs){document.dispatchEvent(new CustomEvent('qmx:diagram-launcher-rendered',{detail:{version:VERSION,toolIds:xs.map((tool)=>tool.id),search:S.search,subject:S.subject,category:S.category,view:S.view}}));}
function applyBusyState(){
 const busy=Boolean(S.busyTool);S.root?.setAttribute('aria-busy',busy?'true':'false');
 S.tools?.querySelectorAll?.('[data-tool]').forEach((button)=>{button.disabled=busy;const active=busy&&button.dataset.tool===S.busyTool;button.classList.toggle('is-loading',active);if(active)button.querySelector('.qmx-diagram-status-badge').textContent='Loading';});
}
function clearBusy(){S.busyTool='';applyBusyState();}
function render(){
 const xs=list();S.tools.innerHTML='';
 if(!xs.length){S.tools.innerHTML='<div class="qmx-diagram-empty" style="grid-column:1/-1"><div><strong>কোনো matching tool পাওয়া যায়নি।</strong><br>Search বা filter পরিবর্তন করুন।</div></div>';S.count.textContent='0 tools';announceRendered([]);return;}
 xs.forEach(x=>{const b=document.createElement('button');b.type='button';b.className='qmx-diagram-tool';b.dataset.tool=x.id;const ready=S.handlers.has(x.id);b.innerHTML=`<span class="qmx-diagram-tool-badge">${esc(x.badge)}</span><span><span class="qmx-diagram-tool-title">${esc(x.label)}</span><span class="qmx-diagram-tool-title-bn">${esc(x.labelBn)}</span><span class="qmx-diagram-tool-description">${esc(x.description)}</span></span><span class="qmx-diagram-status-badge">${ready?'Ready':'পরিকল্পিত'}</span>`;S.tools.appendChild(b);});
 S.count.textContent=xs.length+' tools';applyBusyState();announceRendered(xs);
}
function isPromiseLike(value){return Boolean(value&&typeof value.then==='function');}
function select(id){
 if(S.busyTool)return;syncRegistry();const tool=R.findTool(id);if(!tool)return;const ctx={tool,subject:R.findSubject(S.subject),textarea:S.activeTextarea,source:'diagram-ribbon',closeLauncher:close},fn=S.handlers.get(id);
 if(typeof fn==='function'){
  const token=++S.busyToken;S.busyTool=id;S.status.textContent=tool.labelBn+' editor প্রস্তুত হচ্ছে…';applyBusyState();
  let result;try{result=fn(ctx);}catch(error){clearBusy();S.status.textContent=tool.labelBn+' editor খোলা যায়নি।';console.error('[QMX Diagram Launcher]',error);return;}
  if(isPromiseLike(result)){
   Promise.resolve(result).then((opened)=>{if(token!==S.busyToken)return;clearBusy();if(opened===false){S.status.textContent=tool.labelBn+' editor খোলা যায়নি।';return;}if(S.open)close();},(error)=>{if(token!==S.busyToken)return;clearBusy();S.status.textContent=tool.labelBn+' editor খোলা যায়নি।';console.error('[QMX Diagram Launcher]',error);});
   return;
  }
  clearBusy();if(S.open)close();return;
 }
 S.status.textContent=tool.labelBn+' editor module পরবর্তী implementation phase-এ যুক্ত হবে।';
 document.dispatchEvent(new CustomEvent('qmx:diagram-tool-selected',{detail:ctx}));
}
function open(opts={}){
 syncRegistry();make();S.previousFocus=document.activeElement;S.activeTextarea=opts.textarea||window.QmxQuestionEditorTarget?.()?.textarea||activeTextarea();
 const sub=opts.subjectId?R.findSubject(opts.subjectId):R.detectSubject(opts.subjectLabel||subjectLabel());S.busyToken++;clearBusy();S.subject=sub.id;S.subjectEl.value=S.subject;S.search='';S.searchEl.value='';S.category='all';S.categoryEl.value='all';S.status.textContent='';view('recommended');render();
 S.root.hidden=false;S.open=true;document.body.dataset.qmxDiagramOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden';
 document.querySelectorAll('[data-diagram-launcher]').forEach(b=>{b.classList.add('is-diagram-open');b.setAttribute('aria-expanded','true');});setTimeout(()=>S.subjectEl.focus(),0);
 if(window.QmxDiagramLazyLoader?.prefetch){
  const subject=R.findSubject(S.subject);
  (subject?.recommended||[]).slice(0,3).forEach((toolId)=>window.QmxDiagramLazyLoader.prefetch(toolId,'launcher-open'));
 }
}
function close(){
 if(!S.root||!S.open)return;S.root.hidden=true;S.open=false;document.body.style.overflow=document.body.dataset.qmxDiagramOverflow||'';delete document.body.dataset.qmxDiagramOverflow;
 document.querySelectorAll('[data-diagram-launcher]').forEach(b=>{b.classList.remove('is-diagram-open');b.setAttribute('aria-expanded','false');});S.previousFocus?.focus?.();
}
function keys(e){
 if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key!=='Tab')return;
 const fs=Array.from(S.dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')).filter(x=>x.offsetParent!==null);if(!fs.length)return;
 if(e.shiftKey&&document.activeElement===fs[0]){e.preventDefault();fs.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===fs.at(-1)){e.preventDefault();fs[0].focus();}
}
function register(id,fn){syncRegistry();if(!R.findTool(id))throw new Error('Unknown diagram tool: '+id);if(typeof fn!=='function')throw new TypeError('Handler must be a function.');S.handlers.set(id,fn);if(S.open)render();return()=>S.handlers.delete(id);}
function init(){syncRegistry(true);make();document.addEventListener('click',e=>{const b=e.target.closest('[data-diagram-launcher]');if(b){e.preventDefault();open();}});announceReady();}
document.addEventListener('qmx:diagram-tools-updated',onRegistryUpdate);
document.addEventListener('qmx:diagram-registry-ready',onRegistryUpdate);
window.addEventListener('pageshow',onRegistryUpdate);window.addEventListener('focus',onRegistryUpdate);
window.QmxDiagramToolButtonContent=toolButtonContent;
window.QmxDiagramLauncher=Object.freeze({version:VERSION,open,close,registerToolHandler:register,getActiveTextarea:()=>S.activeTextarea,refreshRegistry:()=>syncRegistry(true)});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})(window,document);
