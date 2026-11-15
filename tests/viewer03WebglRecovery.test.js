import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MotionViewer} from '../src/lib/viewer.js';
import {
  rendererPreset,isRecoverableGraphicsFailure,shortGraphicsReport,
} from '../src/lib/viewerGraphicSafety.js';
import {
  rememberLoadPhase,readInterruptedLoad,clearInterruptedLoad,
} from '../src/lib/viewerSessionDiagnostics.js';
const source=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');

test('WEBGL-03 safe mode lowers GPU backbuffer use without altering mesh materials',()=>{
  const normal=rendererPreset({safeMode:false,devicePixelRatio:2.5});
  assert.equal(normal.options.antialias,true);
  assert.equal(normal.pixelRatio,2);
  const safe=rendererPreset({safeMode:true,devicePixelRatio:3.5});
  assert.equal(safe.options.antialias,false);
  assert.equal(safe.options.alpha,false);
  assert.equal(safe.pixelRatio,1);
  assert.equal(safe.options.powerPreference,'default');
  assert.equal(rendererPreset({safeMode:true,devicePixelRatio:0}).pixelRatio,1);
  assert.equal(rendererPreset({devicePixelRatio:Infinity}).pixelRatio,1);
});

test('WEBGL-03 graphics loss vs healthy statuses are distinct and diagnosed',()=>{
  assert.ok(isRecoverableGraphicsFailure({type:'lost'}));
  assert.ok(isRecoverableGraphicsFailure({type:'render-error'}));
  assert.ok(isRecoverableGraphicsFailure({type:'creation-error'}));
  assert.equal(isRecoverableGraphicsFailure({type:'restored'}),false);
  const entry=shortGraphicsReport({type:'lost',message:'context lost',safeMode:true,
    diagnostics:{textures:15,geometries:20,pixelRatio:1,
      maxTextureSize:8192,contextLossCount:1,file:'LUMIA_V09.glb'},
  });
  assert.equal(entry.textures,15);
  assert.equal(entry.geometries,20);
  assert.equal(entry.maxTextureSize,8192);
  assert.equal(entry.contextLossCount,1);
  assert.equal(entry.file,'LUMIA_V09.glb');
});

test('WEBGL-03 browser reload preserves only import stage and extension',()=>{
  const old=globalThis.sessionStorage,stored=new Map();
  globalThis.sessionStorage={
    setItem(k,v){stored.set(k,v);},
    getItem(k){return stored.get(k)||null;},
    removeItem(k){stored.delete(k);},
  };
  try{
    const value=rememberLoadPhase('Ajustando cámara al personaje…','GLB');
    assert.equal(value.extension,'GLB');
    const latest=readInterruptedLoad();
    assert.equal(latest.stage,'Ajustando cámara al personaje…');
    assert.equal(latest.extension,'GLB');
    assert.ok(!JSON.stringify(latest).includes('data:'));
    assert.ok(!JSON.stringify(latest).includes('vertices'));
    clearInterruptedLoad();
    assert.equal(readInterruptedLoad(),null);
  }finally{
    if(old===undefined)delete globalThis.sessionStorage;
    else globalThis.sessionStorage=old;
  }
});

test('WEBGL-03 a GPU status report can be read without an active GL context',()=>{
  const viewer=Object.create(MotionViewer.prototype);
  viewer.safeMode=true;
  viewer.graphicsState='lost';
  viewer.contextLossCount=2;
  viewer.lastGraphicsError='webglcontextlost';
  viewer.renderer={getPixelRatio:()=>1,info:{memory:{textures:16,geometries:21}},
    capabilities:{maxTextureSize:16384}};
  viewer.model={};viewer.clips=[];viewer.lastFilename='LUMIA_V09.glb';
  const report=viewer.getGraphicsDiagnostics();
  assert.equal(report.type,'lost');
  assert.equal(report.contextLossCount,2);
  assert.equal(report.textures,16);
  assert.equal(report.animationCount,0);
  assert.equal(report.modelLoaded,true);
});

test('WEBGL-03 disposing a lost renderer removes event hooks and dead canvas',()=>{
  const viewer=Object.create(MotionViewer.prototype);
  const removed=[];
  viewer.canvas={
    removeEventListener(name){removed.push(name);},
    remove(){removed.push('canvas');},
  };
  viewer.disposed=false;viewer.loadSequence=1;
  viewer.resizeObserver={disconnect(){removed.push('observer');}};
  viewer.raf=22;
  viewer.handleContextLost=()=>{};
  viewer.handleContextRestored=()=>{};
  viewer.controls={dispose(){removed.push('controls');}};
  viewer.renderer={dispose(){removed.push('renderer');}};
  viewer.clearModel=()=>{removed.push('model');};
  const oldCancel=globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame=()=>{};
  try{viewer.dispose();viewer.dispose();}
  finally{
    if(oldCancel===undefined)delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame=oldCancel;
  }
  assert.deepEqual(removed,[
    'observer','webglcontextlost','webglcontextrestored',
    'model','controls','renderer','canvas',
  ]);
  assert.equal(viewer.loadSequence,2);
});

test('WEBGL-03 recovery is wired outside WebGL canvas, without page reload',()=>{
  const viewer=source('src/lib/viewer.js');
  const app=source('src/App.jsx');
  const css=source('src/styles.css');
  assert.match(viewer,/this\.canvas\.addEventListener\('webglcontextlost'/);
  assert.match(viewer,/this\.canvas\.addEventListener\('webglcontextrestored'/);
  assert.match(viewer,/event\.preventDefault\(\)/);
  assert.match(viewer,/if \(this\.disposed\|\|this\.graphicsState!=='ready'\) return/);
  assert.match(viewer,/getGraphicsDiagnostics\(\)/);
  assert.match(viewer,/const preset=rendererPreset/);
  assert.match(app,/const rebuildViewer=useCallback/);
  assert.match(app,/new MotionViewer\(mountRef\.current,syncPlayer,\{/);
  assert.match(app,/safeMode:safe,onGraphicsStatus/);
  assert.match(app,/Recuperar visor en modo seguro/);
  assert.match(app,/Modo gráfico seguro/);
  assert.match(app,/rememberLoadPhase\(message,ext\)/);
  assert.match(app,/viewer\.current!==instance/);
  assert.match(css,/\.graphics-recovery-overlay/);
  assert.doesNotMatch(app,/window\.location\.reload\(/);
});
