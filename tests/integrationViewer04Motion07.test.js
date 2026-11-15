import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {MotionViewer} from '../src/lib/viewer.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('INTEGRATION VIEWER-04/MOTION-07 retains all three independent controls',()=>{
  const app=source('src/App.jsx');
  assert.match(app,/PanelErrorBoundary/);
  assert.match(app,/ViewportMotionDock/);
  assert.match(app,/MixamoRetargetLab/);
  assert.match(app,/MixamoToeLockLab/);
  assert.match(app,/Recuperar visor en modo seguro/);
  assert.equal((app.match(/<MixamoToeLockLab\b/g)||[]).length,1);
  assert.equal((app.match(/<MixamoRetargetLab\b/g)||[]).length,1);
  const viewer=source('src/lib/viewer.js');
  assert.match(viewer,/targetVersion='v06b'/);
  assert.match(viewer,/targetRoot:targetAtRest,pivot,toes,targetVersion/);
  assert.match(viewer,/getExistingRigMotionStatus/);
  assert.match(viewer,/getGraphicsDiagnostics/);
  assert.match(viewer,/loadCompatibleModel/);
  assert.match(viewer,/prepareStaticRigPreview/);
});
test('INTEGRATION panels render a static GLB without clips and do not blank React',async()=>{
  const vite=await createServer({
    server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent',
  });
  try{
    const {default:ToeLab}=await vite.ssrLoadModule('/src/MixamoToeLockLab.jsx');
    const {default:MotionLab}=await vite.ssrLoadModule('/src/MixamoRetargetLab.jsx');
    const root=new THREE.Group();
    const model={format:'GLB',bones:346,
      filename:'LUMIA_CLAUDE_MAESTRA_346.glb'};
    const getViewer=()=>({model:root,clips:[],current:null});
    const toe=renderToString(React.createElement(ToeLab,{model,getViewer}));
    assert.match(toe,/MOTION-07/);
    assert.match(toe,/Primero carga LUMIA_CLAUDE_MAESTRA_346/);
    const retarget=renderToString(React.createElement(MotionLab,{
      model,getViewer,onComplete:()=>{},
    }));
    assert.match(retarget,/MOTION-06\/07/);
  }finally{await vite.close();}
});
test('INTEGRATION zero-animation rig returns safe arrays to floating dock',()=>{
  const scene=new THREE.Group();
  const bone=new THREE.Bone();bone.name='Bone';scene.add(bone);
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=scene;viewer.clips=[];
  const status=viewer.getExistingRigMotionStatus();
  assert.equal(status.ok,false);
  assert.ok(Array.isArray(status.bones));
  assert.ok(Array.isArray(status.clips));
  assert.equal(status.clips.length,0);
});
