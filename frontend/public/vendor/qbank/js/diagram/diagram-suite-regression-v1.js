(() => {
'use strict';
const VERSION='6.2.1';
const modules=[{"id":"general-drawing","mode":"general-drawing","label":"General Drawing / Flowchart","globalName":"QmxGeneralFlowchartEditor"},{"id":"geometry","mode":"geometry","label":"Geometry Drawing","globalName":"QmxGeometryEditor"},{"id":"coordinate-geometry","mode":"coordinate-geometry","label":"Coordinate Geometry","globalName":"QmxCoordinateGeometryEditor"},{"id":"number-line","mode":"number-line","label":"Number Line / Interval","globalName":"QmxNumberLineEditor"},{"id":"tree-diagram","mode":"tree-diagram","label":"Tree Diagram","globalName":"QmxTreeDiagramEditor"},{"id":"technical-drawing","mode":"technical-drawing","label":"Technical Drawing","globalName":"QmxTechnicalDrawingEditor"},{"id":"statistical-diagram","mode":"statistical-diagram","label":"Statistical Diagram","globalName":"QmxStatisticalDiagramEditor"},{"id":"function-transformation","mode":"function-transformation","label":"Function Transformation","globalName":"QmxFunctionTransformationEditor"},{"id":"complex-plane","mode":"complex-plane","label":"Complex Plane","globalName":"QmxComplexPlaneEditor"},{"id":"digital-logic","mode":"digital-logic","label":"Digital Logic","globalName":"QmxDigitalLogicEditor"},{"id":"finite-state-machine","mode":"finite-state-machine","label":"Finite State Machine","globalName":"QmxFiniteStateMachineEditor"},{"id":"database-er","mode":"database-er","label":"Database ER","globalName":"QmxDatabaseErEditor"},{"id":"network-topology","mode":"network-topology","label":"Network Topology","globalName":"QmxNetworkTopologyEditor"},{"id":"uml-software-design","mode":"uml-software-design","label":"UML Software Design","globalName":"QmxUmlSoftwareDesignEditor"},{"id":"uml-sequence","mode":"uml-sequence","label":"UML Sequence","globalName":"QmxUmlSequenceEditor"},{"id":"uml-activity","mode":"uml-activity","label":"UML Activity / BPMN","globalName":"QmxUmlActivityEditor"},{"id":"cloud-deployment","mode":"cloud-deployment","label":"Cloud Deployment","globalName":"QmxCloudDeploymentEditor"},{"id":"chemical-structure","mode":"chemical-structure","label":"Chemical Structure","globalName":"QmxChemicalStructureEditor"},{"id":"biological-cell","mode":"biological-cell","label":"Biological Cell","globalName":"QmxBiologicalCellEditor"},{"id":"human-anatomy","mode":"human-anatomy","label":"Human Anatomy","globalName":"QmxHumanAnatomyEditor"},{"id":"plant-anatomy","mode":"plant-anatomy","label":"Plant Anatomy","globalName":"QmxPlantAnatomyEditor"},{"id":"genetics-diagram","mode":"genetics-diagram","label":"Genetics","globalName":"QmxGeneticsEditor"},{"id":"ecology-diagram","mode":"ecology-diagram","label":"Ecology","globalName":"QmxEcologyEditor"},{"id":"geology-diagram","mode":"geology-diagram","label":"Geology","globalName":"QmxGeologyEditor"},{"id":"weather-climate-diagram","mode":"weather-climate-diagram","label":"Weather & Climate","globalName":"QmxWeatherClimateEditor"},{"id":"astronomy-diagram","mode":"astronomy-diagram","label":"Astronomy","globalName":"QmxAstronomyEditor"},{"id":"hydrology-diagram","mode":"hydrology-diagram","label":"Hydrology","globalName":"QmxHydrologyEditor"},{"id":"oceanography-diagram","mode":"oceanography-diagram","label":"Oceanography","globalName":"QmxOceanographyEditor"},{"id":"environmental-science-diagram","mode":"environmental-science-diagram","label":"Environmental Science","globalName":"QmxEnvironmentalScienceEditor"},{"id":"disaster-management-diagram","mode":"disaster-management-diagram","label":"Disaster Management","globalName":"QmxDisasterManagementEditor"},{"id":"vector-fbd","mode":"vector-fbd","label":"Vector / Free-body","globalName":"QmxVectorFbdEditor"},{"id":"circuit","mode":"circuit","label":"Circuit Diagram","globalName":"QmxCircuitEditor"},{"id":"ray-optics","mode":"ray-optics","label":"Ray Optics","globalName":"QmxRayOpticsEditor"},{"id":"waveform","mode":"waveform","label":"Waveform","globalName":"QmxWaveformEditor"},{"id":"venn-set","mode":"venn-set","label":"Venn / Set","globalName":"QmxVennSetEditor"},{"id":"timeline","mode":"timeline","label":"Timeline","globalName":"QmxTimelineEditor"},{"id":"data-flow","mode":"data-flow","label":"Data-flow","globalName":"QmxDataFlowEditor"},{"id":"cross-section","mode":"cross-section","label":"Cross-section / Profile","globalName":"QmxCrossSectionEditor"},{"id":"vector-art","mode":"vector-art","label":"Freehand / Vector Art","globalName":"QmxVectorArtEditor"},{"id":"sports-field","mode":"sports-field","label":"Sports Field / Tactics","globalName":"QmxSportsFieldEditor"},{"id":"stage-blocking","mode":"stage-blocking","label":"Stage / Blocking Plan","globalName":"QmxStageBlockingEditor"}];
function check(name,passed,detail=''){return {name,passed:Boolean(passed),detail:String(detail||'')};}
function rendererSmoke(module){
 const renderer=window.QmxDiagram;
 if(!renderer||typeof renderer.svgMarkup!=='function')return check(`${module.label}: renderer smoke`,false,'QmxDiagram.svgMarkup is unavailable.');
 try{const svg=renderer.svgMarkup({mode:module.mode,title:`QMX ${module.label} smoke`,width:420,height:240,objects:[]});return check(`${module.label}: renderer smoke`,typeof svg==='string'&&svg.includes('<svg'),'SVG generated.');}
 catch(error){return check(`${module.label}: renderer smoke`,false,error?.message||String(error));}
}
function collectRenderedModes(){const figures=Array.from(document.querySelectorAll('[data-qmx-diagram]'));const modes={};figures.forEach((figure)=>{const mode=figure.getAttribute('data-qmx-diagram-mode')||'unknown';modes[mode]=(modes[mode]||0)+1;});return {total:figures.length,modes,selected:figures.filter((figure)=>figure.classList.contains('is-selected')).length};}
function run(options={}){
 const deep=Boolean(options.deep);
 const loader=window.QmxDiagramLazyLoader;
 const core=[
  check('Diagram renderer API',Boolean(window.QmxDiagram&&typeof window.QmxDiagram.svgMarkup==='function')),
  check('Diagram renderer version',window.QmxDiagram?.version==='6.2.1',window.QmxDiagram?.version||'missing'),
  check('Diagram launcher API',Boolean(window.QmxDiagramLauncher&&typeof window.QmxDiagramLauncher.registerToolHandler==='function')),
  check('Diagram launcher version',window.QmxDiagramLauncher?.version==='1.0.6',window.QmxDiagramLauncher?.version||'missing'),
  check('Diagram registry API',Boolean(window.QmxDiagramRegistry&&typeof window.QmxDiagramRegistry.findTool==='function')),
  check('Lazy editor loader API',Boolean(loader&&typeof loader.load==='function'&&typeof loader.prefetch==='function'&&typeof loader.openFromPreview==='function')),
  check('Lazy editor loader version',loader?.version==='1.1.1',loader?.version||'missing'),
  check('Lazy editor module count',loader?.moduleCount===41,String(loader?.moduleCount??'missing')),
  check('Preview media controls API',Boolean(window.QmxPreviewMediaControls)),
  check('Regression asset version',VERSION==='6.2.1',VERSION)
 ];
 const moduleResults=modules.map((module)=>{
  const editor=window[module.globalName];
  const lazyReady=Boolean(loader?.supports?.(module.id)||loader?.supports?.(module.mode));
  const checks=[check(`${module.label}: editor available`,Boolean(editor)||lazyReady,editor?'loaded':'lazy')];
  checks.push(check(`${module.label}: preview loader`,Boolean(editor?.openFromPreview)||lazyReady,editor?'loaded':'lazy'));
  if(deep)checks.push(rendererSmoke(module));
  return {...module,loaded:Boolean(editor),lazy:!editor&&lazyReady,passed:checks.every((item)=>item.passed),checks};
 });
 const dom=[
  check('Question editor source textarea',Boolean(document.querySelector('[data-editor-textarea]'))),
  check('Compact token proxy',Boolean(document.querySelector('[data-qmx-token-proxy]'))),
  check('Question live preview',Boolean(document.querySelector('[data-question-live-preview]'))),
  check('Diagram ribbon launcher',Boolean(document.querySelector('[data-diagram-launcher], [data-tool="diagram"], [data-qmx-diagram-launcher]')))
 ];
 const allChecks=[...core,...dom,...moduleResults.flatMap((module)=>module.checks)];
 const failures=allChecks.filter((item)=>!item.passed);
 const report={suite:'QMX Diagram Suite',version:VERSION,checkedAt:new Date().toISOString(),status:failures.length?'FAIL':'PASS',deep,core,dom,modules:moduleResults,rendered:collectRenderedModes(),lazyLoader:loader?.getStats?.()||null,failures};
 document.documentElement.dataset.qmxDiagramSuite=report.status.toLowerCase();
 document.documentElement.dataset.qmxDiagramSuiteVersion=VERSION;
 return report;
}
function runDeep(){return run({deep:true});}
function print(report=run()){
 console.table([{Suite:report.suite,Version:report.version,Status:report.status,'Module count':report.modules.length,'Editors loaded':report.modules.filter((module)=>module.loaded).length,'Rendered figures':report.rendered.total,Failures:report.failures.length}]);
 console.table(report.modules.map((module)=>({Module:module.label,Mode:module.mode,State:module.loaded?'LOADED':(module.lazy?'LAZY':'MISSING'),Status:module.passed?'PASS':'FAIL'})));
 if(report.failures.length)console.table(report.failures.map((failure)=>({Check:failure.name,Detail:failure.detail})));
 return report;
}
function assert(options={}){const report=run(options);if(report.status!=='PASS'){const error=new Error(`QMX Diagram Suite regression failed: ${report.failures.length} check(s).`);error.report=report;throw error;}return report;}
window.QmxDiagramSuiteRegression=Object.freeze({version:VERSION,modules:Object.freeze(modules.map((module)=>Object.freeze({...module}))),run,runDeep,print,assert,Run:run,RunDeep:runDeep,Print:print,Assert:assert});
const initialize=()=>{const execute=()=>{const report=run();document.dispatchEvent(new CustomEvent('qmx:diagram-suite-regression',{detail:report}));};if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(execute,{timeout:2500});else window.setTimeout(execute,1200);};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initialize,{once:true}):initialize();
})();
