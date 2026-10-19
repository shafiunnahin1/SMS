(function(window,document){
'use strict';
if(window.QmxDiagramLazyLoader?.version)return;
const VERSION='1.1.1';
const MODULES=[{"key":"general-drawing","modes":["general-drawing","flowchart","block-diagram"],"toolIds":["general-drawing","flowchart","block-diagram"],"script":"general-flowchart-editor-v1.js","globalName":"QmxGeneralFlowchartEditor","label":"General Drawing / Flowchart"},{"key":"geometry","modes":["geometry"],"toolIds":["geometry"],"script":"geometry-editor-v1.js","globalName":"QmxGeometryEditor","label":"Geometry Drawing"},{"key":"coordinate-geometry","modes":["coordinate-geometry"],"toolIds":["coordinate-geometry","coordinate-construction","analytic-geometry"],"script":"coordinate-geometry-editor-v1.js","globalName":"QmxCoordinateGeometryEditor","label":"Coordinate Geometry"},{"key":"number-line","modes":["number-line"],"toolIds":["number-line","interval-diagram","inequality-diagram","interval-number-line","numberline"],"script":"number-line-editor-v1.js","globalName":"QmxNumberLineEditor","label":"Number Line / Interval"},{"key":"tree-diagram","modes":["tree-diagram"],"toolIds":["tree-diagram","probability-tree","decision-tree"],"script":"tree-diagram-editor-v1.js","globalName":"QmxTreeDiagramEditor","label":"Tree Diagram"},{"key":"technical-drawing","modes":["technical-drawing"],"toolIds":["technical-drawing","technical","engineering-drawing","workshop-drawing","orthographic","isometric"],"script":"technical-drawing-editor-v1.js","globalName":"QmxTechnicalDrawingEditor","label":"Technical Drawing"},{"key":"statistical-diagram","modes":["statistical-diagram"],"toolIds":["statistical-diagram","statistics-chart","data-chart","histogram","frequency-polygon"],"script":"statistical-diagram-editor-v1.js","globalName":"QmxStatisticalDiagramEditor","label":"Statistical Diagram"},{"key":"function-transformation","modes":["function-transformation"],"toolIds":["function-transformation","function-graph","curve-sketching","curve-sketch","function-curve","transformation-graph"],"script":"function-transformation-editor-v1.js","globalName":"QmxFunctionTransformationEditor","label":"Function Transformation"},{"key":"complex-plane","modes":["complex-plane"],"toolIds":["complex-plane","argand-diagram","argand-plane","polar-diagram","complex-number-diagram","complex-locus"],"script":"complex-plane-editor-v1.js","globalName":"QmxComplexPlaneEditor","label":"Complex Plane"},{"key":"digital-logic","modes":["digital-logic"],"toolIds":["digital-logic","logic-gate","logic-circuit","boolean-circuit"],"script":"digital-logic-editor-v1.js","globalName":"QmxDigitalLogicEditor","label":"Digital Logic"},{"key":"finite-state-machine","modes":["finite-state-machine"],"toolIds":["finite-state-machine","fsm","automata","state-machine","dfa","nfa"],"script":"finite-state-machine-editor-v1.js","globalName":"QmxFiniteStateMachineEditor","label":"Finite State Machine"},{"key":"database-er","modes":["database-er"],"toolIds":["database-er","erd","entity-relationship","database-schema","relational-schema","er-diagram"],"script":"database-er-editor-v1.js","globalName":"QmxDatabaseErEditor","label":"Database ER"},{"key":"network-topology","modes":["network-topology"],"toolIds":["network-topology","computer-network","network-diagram","topology-diagram","network"],"script":"network-topology-editor-v1.js","globalName":"QmxNetworkTopologyEditor","label":"Network Topology"},{"key":"uml-software-design","modes":["uml-software-design"],"toolIds":["uml-software-design","uml","class-diagram","software-architecture"],"script":"uml-software-design-editor-v1.js","globalName":"QmxUmlSoftwareDesignEditor","label":"UML Software Design"},{"key":"uml-sequence","modes":["uml-sequence"],"toolIds":["uml-sequence","sequence-diagram","interaction-diagram"],"script":"uml-sequence-editor-v1.js","globalName":"QmxUmlSequenceEditor","label":"UML Sequence"},{"key":"uml-activity","modes":["uml-activity"],"toolIds":["uml-activity","activity-diagram","bpmn","workflow-diagram","workflow"],"script":"uml-activity-editor-v1.js","globalName":"QmxUmlActivityEditor","label":"UML Activity / BPMN"},{"key":"cloud-deployment","modes":["cloud-deployment"],"toolIds":["cloud-deployment","cloud-architecture","deployment-diagram","infrastructure-diagram"],"script":"cloud-deployment-editor-v1.js","globalName":"QmxCloudDeploymentEditor","label":"Cloud Deployment"},{"key":"chemical-structure","modes":["chemical-structure"],"toolIds":["chemical-structure","reaction-scheme","reaction-mechanism","organic-structure"],"script":"chemical-structure-editor-v1.js","globalName":"QmxChemicalStructureEditor","label":"Chemical Structure"},{"key":"biological-cell","modes":["biological-cell"],"toolIds":["biological-cell","biological-diagram","cell-diagram","organelle-diagram"],"script":"biological-cell-editor-v1.js","globalName":"QmxBiologicalCellEditor","label":"Biological Cell"},{"key":"human-anatomy","modes":["human-anatomy"],"toolIds":["human-anatomy","anatomy","organ-system","human-body"],"script":"human-anatomy-editor-v1.js","globalName":"QmxHumanAnatomyEditor","label":"Human Anatomy"},{"key":"plant-anatomy","modes":["plant-anatomy"],"toolIds":["plant-anatomy","botany","plant-structure","flower-diagram"],"script":"plant-anatomy-editor-v1.js","globalName":"QmxPlantAnatomyEditor","label":"Plant Anatomy"},{"key":"genetics-diagram","modes":["genetics-diagram"],"toolIds":["genetics-diagram","genetics","dna","inheritance","punnett-square"],"script":"genetics-diagram-editor-v1.js","globalName":"QmxGeneticsEditor","label":"Genetics"},{"key":"ecology-diagram","modes":["ecology-diagram"],"toolIds":["ecology-diagram","ecology","food-chain","food-web","ecosystem"],"script":"ecology-diagram-editor-v1.js","globalName":"QmxEcologyEditor","label":"Ecology"},{"key":"geology-diagram","modes":["geology-diagram"],"toolIds":["geology-diagram","earth-science","rock-cycle","plate-tectonics","geological-cross-section"],"script":"geology-diagram-editor-v1.js","globalName":"QmxGeologyEditor","label":"Geology"},{"key":"weather-climate-diagram","modes":["weather-climate-diagram"],"toolIds":["weather-climate-diagram","meteorology","weather-map","climate-diagram","atmospheric-science"],"script":"weather-climate-editor-v1.js","globalName":"QmxWeatherClimateEditor","label":"Weather & Climate"},{"key":"astronomy-diagram","modes":["astronomy-diagram"],"toolIds":["astronomy-diagram","astronomy","solar-system","space-science","celestial-diagram"],"script":"astronomy-diagram-editor-v1.js","globalName":"QmxAstronomyEditor","label":"Astronomy"},{"key":"hydrology-diagram","modes":["hydrology-diagram"],"toolIds":["hydrology-diagram","river-basin","water-resources","hydrologic-cycle","drainage-basin","aquifer","flood-hydrograph","river-profile"],"script":"hydrology-diagram-editor-v1.js","globalName":"QmxHydrologyEditor","label":"Hydrology"},{"key":"oceanography-diagram","modes":["oceanography-diagram"],"toolIds":["oceanography-diagram","oceanography","marine-science","ocean-basin","coastal-processes","ocean-currents","tides","wave-refraction","upwelling","coral-reef"],"script":"oceanography-diagram-editor-v1.js","globalName":"QmxOceanographyEditor","label":"Oceanography"},{"key":"environmental-science-diagram","modes":["environmental-science-diagram"],"toolIds":["environmental-science-diagram","environmental-science","pollution","waste-management","sustainability","air-pollution","water-pollution","solid-waste","climate-change","environmental-impact"],"script":"environmental-science-diagram-editor-v1.js","globalName":"QmxEnvironmentalScienceEditor","label":"Environmental Science"},{"key":"disaster-management-diagram","modes":["disaster-management-diagram"],"toolIds":["disaster-management-diagram","disaster-management","natural-hazards","risk-assessment","earthquake-risk","flood-risk","cyclone-risk","emergency-response","evacuation-plan","hazard-map"],"script":"disaster-management-diagram-editor-v1.js","globalName":"QmxDisasterManagementEditor","label":"Disaster Management"},{"key":"vector-fbd","modes":["vector-fbd"],"toolIds":["vector-fbd"],"script":"vector-fbd-editor-v1.js","globalName":"QmxVectorFbdEditor","label":"Vector / Free-body"},{"key":"circuit","modes":["circuit"],"toolIds":["circuit"],"script":"circuit-editor-v1.js","globalName":"QmxCircuitEditor","label":"Circuit Diagram"},{"key":"ray-optics","modes":["ray-optics"],"toolIds":["ray-optics","optics"],"script":"ray-optics-editor-v1.js","globalName":"QmxRayOpticsEditor","label":"Ray Optics"},{"key":"waveform","modes":["waveform"],"toolIds":["waveform","waveform-diagram"],"script":"waveform-editor-v1.js","globalName":"QmxWaveformEditor","label":"Waveform"},{"key":"venn-set","modes":["venn-set"],"toolIds":["venn-set","venn-diagram"],"script":"venn-set-editor-v1.js","globalName":"QmxVennSetEditor","label":"Venn / Set"},{"key":"timeline","modes":["timeline"],"toolIds":["timeline"],"script":"timeline-editor-v1.js","globalName":"QmxTimelineEditor","label":"Timeline"},{"key":"data-flow","modes":["data-flow"],"toolIds":["data-flow"],"script":"data-flow-editor-v1.js","globalName":"QmxDataFlowEditor","label":"Data-flow"},{"key":"cross-section","modes":["cross-section"],"toolIds":["cross-section"],"script":"cross-section-editor-v1.js","globalName":"QmxCrossSectionEditor","label":"Cross-section / Profile"},{"key":"vector-art","modes":["vector-art"],"toolIds":["vector-art","freehand-art"],"script":"freehand-vector-art-editor-v1.js","globalName":"QmxVectorArtEditor","label":"Freehand / Vector Art"},{"key":"sports-field","modes":["sports-field"],"toolIds":["sports-field","sports-layout"],"script":"sports-field-tactics-editor-v1.js","globalName":"QmxSportsFieldEditor","label":"Sports Field / Tactics"},{"key":"stage-blocking","modes":["stage-blocking"],"toolIds":["stage-blocking","stage-plan"],"script":"stage-blocking-editor-v1.js","globalName":"QmxStageBlockingEditor","label":"Stage / Blocking Plan"}];
const ownScript=document.currentScript||Array.from(document.scripts||[]).find((script)=>String(script.src||'').includes('diagram-editor-lazy-loader-v1.js'))||null;
const ownUrl=ownScript?.src?new URL(ownScript.src,window.location?.href||'http://localhost/'):new URL('/vendor/qbank/js/diagram/diagram-editor-lazy-loader-v1.js',window.location?.href||'http://localhost/');
const baseUrl=new URL('./',ownUrl);
const cacheVersion=ownUrl.searchParams.get('v')||'20260803-621';
const byKey=new Map();
const byMode=new Map();
const byTool=new Map();
const loadState=new Map();
const proxyState=new Set();
const prefetchState=new Set();
const loadMetrics=new Map();
let singleResultTimer=0;
let loadingIndicatorTimer=0;
MODULES.forEach((module)=>{
 byKey.set(module.key,module);
 module.modes.forEach((mode)=>byMode.set(mode,module));
 module.toolIds.forEach((id)=>byTool.set(id,module));
});
function descriptor(value){
 const key=String(value||'').trim();
 return byKey.get(key)||byMode.get(key)||byTool.get(key)||null;
}
function supports(value){return Boolean(descriptor(value));}
function scriptUrl(module){const url=new URL(module.script,baseUrl);url.searchParams.set('v',cacheVersion);return url.href;}
function existingScript(module){
 const name='/'+module.script;
 return Array.from(document.querySelectorAll?.('script[src]')||[]).find((script)=>{
  try{return new URL(script.src,window.location?.href||ownUrl.href).pathname.endsWith(name);}catch(error){return String(script.src||'').includes(module.script);}
 })||null;
}
function waitForEditor(module,timeoutMs=10000){
 return new Promise((resolve,reject)=>{
  const started=Date.now();
  const tick=()=>{
   const editor=window[module.globalName];
   if(editor){resolve(editor);return;}
   if(Date.now()-started>=timeoutMs){reject(new Error(module.label+' editor global was not created.'));return;}
   window.setTimeout(tick,25);
  };
  tick();
 });
}
function now(){return window.performance?.now?.()??Date.now();}
function load(value){
 const module=descriptor(value);
 if(!module)return Promise.reject(new Error('Unknown diagram editor: '+String(value||'')));
 if(window[module.globalName])return Promise.resolve(window[module.globalName]);
 if(loadState.has(module.key))return loadState.get(module.key);
 const started=now();
 const source=existingScript(module)?'existing':'network';
 const promise=new Promise((resolve,reject)=>{
  const finish=()=>waitForEditor(module).then(resolve,reject);
  const fail=()=>reject(new Error('Failed to load '+module.script));
  const existing=existingScript(module);
  if(existing){
   if(window[module.globalName]){resolve(window[module.globalName]);return;}
   existing.addEventListener?.('load',finish,{once:true});
   existing.addEventListener?.('error',fail,{once:true});
   window.setTimeout(finish,0);
   return;
  }
  const script=document.createElement('script');
  script.src=scriptUrl(module);
  script.async=true;
  script.dataset.qmxLazyDiagramEditor=module.key;
  script.addEventListener('load',finish,{once:true});
  script.addEventListener('error',fail,{once:true});
  (document.head||document.documentElement).appendChild(script);
 });
 const tracked=promise.then((editor)=>{
  loadState.delete(module.key);
  const metric={key:module.key,source,durationMs:Math.max(0,Math.round(now()-started)),loadedAt:new Date().toISOString()};
  loadMetrics.set(module.key,metric);
  document.dispatchEvent?.(new CustomEvent('qmx:diagram-editor-loaded',{detail:{version:VERSION,module:module.key,metric}}));
  return editor;
 },(error)=>{loadState.delete(module.key);throw error;});
 loadState.set(module.key,tracked);
 return tracked;
}
function prefetch(value,reason='intent'){
 const module=descriptor(value);
 if(!module)return Promise.resolve(false);
 prefetchState.add(module.key);
 return load(module.key).then(()=>true).catch((error)=>{console.warn('[QMX Diagram Lazy Loader] Prefetch failed for '+module.key+' ('+reason+').',error);return false;});
}
function openLoadingIndicator(message){
 window.clearTimeout(loadingIndicatorTimer);
 loadingIndicatorTimer=window.setTimeout(()=>{
  if(!window.Swal?.fire)return;
  window.Swal.fire({
   title:'Diagram tools লোড হচ্ছে…',
   text:message||'একটু অপেক্ষা করুন…',
   allowEscapeKey:false,
   allowEnterKey:false,
   allowOutsideClick:false,
   showConfirmButton:false,
   didOpen:(popup)=>{
    popup.dataset.qmxTransientLoader='1';
    window.Swal.showLoading();
   }
  });
 },180);
}
function closeLoadingIndicator(){
 window.clearTimeout(loadingIndicatorTimer);
 const popup=window.Swal?.getPopup?.();
 if(popup?.dataset?.qmxTransientLoader==='1'){
  window.Swal.close();
 }
}
async function openTool(value,context={}){
 const module=descriptor(value)||descriptor(context?.tool?.id);
 if(!module)throw new Error('No lazy editor mapping for '+String(value||context?.tool?.id||''));
 openLoadingIndicator(module.label+' editor প্রস্তুত করা হচ্ছে…');
 try{
  const editor=await load(module.key);
  if(typeof editor.open!=='function')throw new Error(module.globalName+'.open is unavailable.');
  closeLoadingIndicator();
  context?.closeLauncher?.();
  editor.open(context);
  return true;
 }catch(error){
  closeLoadingIndicator();
  throw error;
 }
}
async function openFromPreview(mode,figure){
 const module=descriptor(mode);
 if(!module)return false;
 openLoadingIndicator(module.label+' editor প্রস্তুত করা হচ্ছে…');
 try{
  const editor=await load(module.key);
  if(typeof editor.openFromPreview!=='function')throw new Error(module.globalName+'.openFromPreview is unavailable.');
  closeLoadingIndicator();
  return editor.openFromPreview(figure)!==false;
 }catch(error){
  closeLoadingIndicator();
  throw error;
 }
}
function reportError(error,module){
 const message=error?.message||String(error||'Unknown error');
 console.error('[QMX Diagram Lazy Loader]',message,error);
 window.alert?.((module?.label||'Diagram')+' editor load failed. '+message);
}
function registerOne(module,id){
 const launcher=window.QmxDiagramLauncher;
 if(!launcher?.registerToolHandler)return false;
 const token=module.key+'::'+id;
 if(proxyState.has(token))return true;
 try{
  launcher.registerToolHandler(id,(context)=>openTool(module.key,context).catch((error)=>{reportError(error,module);return false;}));
  proxyState.add(token);
  return true;
 }catch(error){return false;}
}
function registerAll(){
 let count=0;
 MODULES.forEach((module)=>module.toolIds.forEach((id)=>{if(registerOne(module,id))count++;}));
 document.dispatchEvent?.(new CustomEvent('qmx:diagram-lazy-loader-ready',{detail:{version:VERSION,moduleCount:MODULES.length,proxyCount:count}}));
 return count;
}
function stats(){
 return {version:VERSION,moduleCount:MODULES.length,loaded:MODULES.filter((module)=>Boolean(window[module.globalName])).map((module)=>module.key),pending:Array.from(loadState.keys()),prefetched:Array.from(prefetchState),proxyCount:proxyState.size,loadMetrics:Array.from(loadMetrics.values())};
}
function intentToolId(event){return event.target?.closest?.('.qmx-diagram-tool[data-tool]')?.dataset?.tool||'';}
function onToolIntent(event){const id=intentToolId(event);if(id)prefetch(id,event.type);}
function onLauncherRendered(event){
 const ids=Array.isArray(event?.detail?.toolIds)?event.detail.toolIds.filter((id)=>supports(id)):[];
 if(!ids.length)return;
 window.clearTimeout(singleResultTimer);
 singleResultTimer=window.setTimeout(()=>{
  ids.slice(0,Math.min(ids.length,3)).forEach((id)=>prefetch(id,ids.length===1?'single-result':'visible-result'));
 },60);
}
const api=Object.freeze({version:VERSION,moduleCount:MODULES.length,modules:Object.freeze(MODULES.map((module)=>Object.freeze({...module,modes:Object.freeze(module.modes.slice()),toolIds:Object.freeze(module.toolIds.slice())}))),supports,load,prefetch,openTool,openFromPreview,registerAll,getStats:stats});
window.QmxDiagramLazyLoader=api;
document.addEventListener('qmx:diagram-launcher-ready',registerAll);
document.addEventListener('qmx:diagram-tools-updated',registerAll);
document.addEventListener('qmx:diagram-launcher-rendered',onLauncherRendered);
document.addEventListener('pointerover',onToolIntent,{passive:true});
document.addEventListener('focusin',onToolIntent);
document.addEventListener('pointerdown',onToolIntent,{capture:true,passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',registerAll,{once:true});else registerAll();
})(window,document);
