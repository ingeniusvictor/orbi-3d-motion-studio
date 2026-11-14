import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PLACEMENT_MODES,VIEW_PRESETS,PLANE_FOR_VIEW,
  constrainMarkerPosition,getViewDirection,getDefaultAxesForView,
} from '../src/lib/autoRig/placementConstraints.js';

test('safe marker placement defaults to XY; Z depth cannot change by accident',()=>{
  assert.deepEqual(constrainMarkerPosition([1,2,3],[7,8,100]),[7,8,3]);
  assert.deepEqual(constrainMarkerPosition([-2,4,3],[10,-5,999],'XY'),[10,-5,3]);
});

test('single axis modes preserve other two coordinates exactly',()=>{
  const start=[1,2,3],target=[4,5,6];
  assert.deepEqual(constrainMarkerPosition(start,target,'X'),[4,2,3]);
  assert.deepEqual(constrainMarkerPosition(start,target,'Y'),[1,5,3]);
  assert.deepEqual(constrainMarkerPosition(start,target,'Z'),[1,2,6]);
});

test('planar modes preserve the axis normal to the chosen view',()=>{
  const start=[1,2,3],target=[4,5,6];
  assert.deepEqual(constrainMarkerPosition(start,target,'XY'),[4,5,3]);
  assert.deepEqual(constrainMarkerPosition(start,target,'XZ'),[4,2,6]);
  assert.deepEqual(constrainMarkerPosition(start,target,'YZ'),[1,5,6]);
  assert.deepEqual(constrainMarkerPosition(start,target,'XYZ'),[4,5,6]);
});

test('reject invalid or nonfinite values instead of poisoning the rig geometry',()=>{
  assert.throws(()=>constrainMarkerPosition([0,0,0],[NaN,1,2]),/finitas/);
  assert.throws(()=>constrainMarkerPosition([0,Infinity,0],[1,2,3]),/finitas/);
  assert.throws(()=>constrainMarkerPosition([0,0,0],[1,2,3],'rotar'),/desconocida/);
});

test('camera preset plane mappings are deterministic and axis-aligned',()=>{
  assert.deepEqual(VIEW_PRESETS,['front','back','left','right','top']);
  assert.equal(getDefaultAxesForView('front'),'XY');
  assert.equal(getDefaultAxesForView('back'),'XY');
  assert.equal(getDefaultAxesForView('left'),'YZ');
  assert.equal(getDefaultAxesForView('right'),'YZ');
  assert.equal(getDefaultAxesForView('top'),'XZ');
  assert.deepEqual(getViewDirection('front'),[0,0,1]);
  assert.deepEqual(getViewDirection('back'),[0,0,-1]);
  assert.deepEqual(getViewDirection('left'),[-1,0,0]);
  assert.deepEqual(getViewDirection('right'),[1,0,0]);
  assert.deepEqual(getViewDirection('top'),[0,1,0]);
  assert.equal(Object.keys(PLANE_FOR_VIEW).length,5);
  assert.equal(PLACEMENT_MODES.length,7);
  assert.throws(()=>getDefaultAxesForView('oblique'),/desconocida/);
});

test('editor disables camera by default and restores original state on disposal',()=>{
  const s=readFileSync(new URL('../src/lib/autoRig/NativeRigEditor.js',import.meta.url),'utf8');
  assert.match(s,/this\.cameraLock=true/);
  assert.match(s,/this\.setView\('front'\)/);
  assert.match(s,/controls\.enableRotate=locked\?false:original\.enableRotate/);
  assert.match(s,/controls\.enablePan=locked\?false:original\.enablePan/);
  assert.match(s,/controls\.enableZoom=original\.enableZoom/);
  assert.match(s,/viewer\.controls\.enableRotate=snap\.enableRotate/);
  assert.match(s,/viewer\.controls\.enabled=snap\.enabled/);
  assert.match(s,/viewer\.controls\.target\.copy\(snap\.target\)/);
  assert.match(s,/constrainMarkerPosition\(/);
  assert.match(s,/this\.undoStack\.push\(before\)/);
  assert.match(s,/this\.redoStack\.push\(current\)/);
  assert.match(s,/window\.removeEventListener\('keydown',this\.onKeyDown\)/);
  assert.doesNotMatch(s,/viewer\.model\.position\.(?:set|copy)/);
});
