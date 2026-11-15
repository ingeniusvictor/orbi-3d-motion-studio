import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {MotionViewer} from '../src/lib/viewer.js';
import {readFileSync} from 'node:fs';

function fixture(){
  const root=new THREE.Group();
  root.name='LUMIA V09 STATIC';
  const bone=new THREE.Bone();bone.name='mixamorig:Head';
  root.add(bone);
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=root;
  viewer.clips=[];
  viewer.current=null;
  viewer.playing=false;
  return viewer;
}

test('VIEWER-04 zero clips returns complete status contract, never undefined bones',()=>{
  const viewer=fixture();
  const status=viewer.getExistingRigMotionStatus();
  assert.equal(status.ok,false);
  assert.match(status.reason,/no incluye animaciones/);
  assert.ok(Array.isArray(status.bones));
  assert.ok(Array.isArray(status.clips));
  assert.deepEqual(status.clips,[]);
  assert.equal(typeof status.detected,'object');
  const vacant=Object.create(MotionViewer.prototype);
  vacant.model=null;
  vacant.clips=[];
  const empty=vacant.getExistingRigMotionStatus();
  assert.deepEqual(empty.bones,[]);
  assert.deepEqual(empty.clips,[]);
  assert.equal(empty.ok,false);
});

test('VIEWER-04 actual floating React motion dock SSR renders zero-clip rig without crashing',async()=>{
  const vite=await createServer({
    server:{middlewareMode:true,hmr:false},
    appType:'custom',
    logLevel:'silent',
  });
  try{
    const {default:ViewportMotionDock}=await vite.ssrLoadModule(
      '/src/ViewportMotionDock.jsx');
    const model={filename:'LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb',
      format:'GLB',bones:346};
    const viewer=fixture();
    for(const [name,status] of [
      ['complete',()=>viewer.getExistingRigMotionStatus()],
      ['legacy missing arrays',()=>({
        ok:false,reason:'Este rig no incluye animaciones.',
      })],
    ]){
      const facade={...viewer,getExistingRigMotionStatus:status,
        current:null,playing:false,clips:[]};
      // Even a CLOSED display:none dock is mounted by React.
      for(const open of [false,true]){
        assert.doesNotThrow(()=>{
          const html=renderToString(React.createElement(ViewportMotionDock,{
            model,getViewer:()=>facade,open,onClose:()=>{},generation:1,
          }));
          assert.match(html,/orbi-motion-dock/);
          assert.match(html,/no incluye animaciones/);
        },'Crash with '+name+', open='+open);
      }
    }
  }finally{await vite.close();}
});

test('VIEWER-04 source guards against absent animation-specific arrays',()=>{
  const lab=readFileSync(new URL('../src/ExistingRigMotionLab.jsx',
    import.meta.url),'utf8');
  assert.match(lab,/Array\.isArray\(rawStatus\.bones\)/);
  assert.match(lab,/Array\.isArray\(rawStatus\.clips\)/);
  assert.match(lab,/const boneSelectors=status\.ok\?roles\.map/);
  assert.doesNotMatch(lab,/const boneSelectors=roles\.map/);
});
