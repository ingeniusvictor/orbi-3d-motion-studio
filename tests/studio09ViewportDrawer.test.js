import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {
  LP_FEATURES,describeLpCapabilities
} from '../src/lib/livingPresence/lpCapabilities.js';

const src=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
function statuses(model,viewer){
  return Object.fromEntries(describeLpCapabilities(model,viewer).map(x=>[x.id,x]));
}
test('STUDIO-09 LP audit only enables body on VRM but recognizes Claude facial morphs',()=>{
  const glb={format:'GLB',bones:346},viewer={
    model:{},vrm:null,
    getLivingLipDiagnostics:()=>({supported:true,names:['A','I','U','E','O']}),
    getLivingFacialDiagnostics:()=>({supported:true,blink:true,morphCount:41}),
    getLivingComposerStatus:()=>null,
  };
  const s=statuses(glb,viewer);
  assert.equal(LP_FEATURES.length,5);
  assert.equal(s.lp01.state,'requires-vrm');
  assert.equal(s.lp02.state,'requires-vrm');
  assert.equal(s.lp03ab.state,'requires-vrm');
  assert.equal(s.lp03c.state,'available');
  assert.equal(s.lp03d.state,'available');
  assert.match(s.lp01.reason,/humanoide normalizado VRM/);
});
test('STUDIO-09 voice remains available even with no mouth and unknown body',()=>{
  const s=statuses({format:'FBX'},{model:{},vrm:null,
    getLivingLipDiagnostics:()=>({supported:false}),
    getLivingFacialDiagnostics:()=>({supported:false})});
  assert.equal(s.lp03c.state,'partial');
  assert.equal(s.lp03d.state,'pending');
  assert.equal(s.lp03ab.state,'requires-vrm');
  assert.equal(statuses(null,null).lp01.state,'no-model');
});
test('STUDIO-09 VRM LP compositor requires eligible movement',()=>{
  const viewer={model:{},vrm:{humanoid:{}},
    getLivingComposerStatus:()=>({eligible:false}), 
    getLivingLipDiagnostics:()=>({supported:true}),
    getLivingFacialDiagnostics:()=>({supported:true}),
  };
  assert.equal(statuses({format:'VRM'},viewer).lp02.state,'pending');
  viewer.getLivingComposerStatus=()=>({eligible:true});
  assert.equal(statuses({format:'VRM'},viewer).lp02.state,'available');
  assert.equal(statuses({format:'VRM'},viewer).lp01.state,'available');
});
test('STUDIO-09 ribbon is keyboard accessible, toggles and opens one tool at a time',async()=>{
  const vite=await createServer({
    appType:'custom',server:{middlewareMode:true,hmr:false},logLevel:'silent',
  });
  try{
    const mod=await vite.ssrLoadModule('/src/StudioToolStrip.jsx');
    const {STUDIO_TOOLS,toggleStudioTool,toolLabel}=mod;
    assert.ok(STUDIO_TOOLS.length>=12);
    assert.equal(new Set(STUDIO_TOOLS.map(x=>x.id)).size,STUDIO_TOOLS.length);
    assert.equal(toggleStudioTool('', 'clips'),'clips');
    assert.equal(toggleStudioTool('clips','clips'),'');
    assert.equal(toggleStudioTool('clips','voice'),'voice');
    assert.equal(toggleStudioTool('voice','unknown'),'');
    assert.equal(toolLabel('presence'),'LP cuerpo');
    const html=renderToString(React.createElement(mod.default,{
      activeTool:'voice',onSelect:()=>{},hasModel:true,
    }));
    assert.match(html,/aria-label="Herramientas desplegables sobre el personaje"/);
    assert.match(html,/aria-pressed="true"/);
    assert.match(html,/aria-label="Voz"/);
    assert.match(html,/aria-label="Ocultar paneles del personaje"/);
    assert.equal((html.match(/studio-tool-tab/g)||[]).length,STUDIO_TOOLS.length);
    assert.equal(renderToString(React.createElement(mod.default,{
      activeTool:'',onSelect:()=>{},hasModel:false,
    })), '');
  }finally{await vite.close();}
});
test('STUDIO-09 each previously available tool remains mounted in exactly one viewport slot',()=>{
  const app=src('App.jsx'),css=src('styles.css');
  const slots=['extract','retarget','toelock','inspector','autorig',
    'presence','voice','textures','integrate','light'];
  for(const name of slots){
    assert.equal((app.match(new RegExp('data-tool="'+name+'"','g'))||[]).length,1,name);
    assert.ok(app.includes("data-open={activeTool==='"+name+"'}"),name);
  }
  assert.match(app,/data-open=\{activeTool==='clips'\}/);
  assert.match(app,/<StudioToolStrip activeTool=/);
  assert.match(app,/setActiveTool\(current=>toggleStudioTool\(current,next\)\)/);
  assert.match(app,/showVoice=\{false\}/);
  assert.equal((app.match(/<VoiceMotorLab/g)||[]).length,1);
  assert.equal((app.match(/<ViewportMotionDock/g)||[]).length,1);
  assert.equal((app.match(/<FaceQuickDock/g)||[]).length,1);
  assert.equal((app.match(/ref=\{mountRef\}/g)||[]).length,1);
  assert.match(css,/\.studio-tool-strip/);
  assert.match(css,/\.studio-tool-drawer/);
  assert.match(css,/\.studio-tool-slot\[data-open="false"\]/);
  assert.match(css,/calc\(100dvh - 186px\)/);
  assert.match(css,/@media\(max-width:580px\)/);
});
test('STUDIO-09 face controls and motion dock are still independently accessible',()=>{
  const app=src('App.jsx');
  assert.match(app,/onClick=\{\(\)=>changeTool\('motion'\)\}/);
  assert.match(app,/onClick=\{\(\)=>changeTool\('face'\)\}/);
  assert.match(app,/setFaceDockOpen\(open=>!open\)/);
  assert.match(app,/setMotionDockOpen\(open=>!open\)/);
  assert.match(app,/PanelErrorBoundary/);
  assert.match(app,/Recuperar visor en modo seguro/);
  assert.match(app,/MixamoToeLockLab/);
});
