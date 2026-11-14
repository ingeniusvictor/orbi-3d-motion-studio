import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  NATIVE_RIG_SCHEMA,LANDMARKS,LANDMARK_NAMES,BONE_DEFS,
  initialMarkers,validateMarkers,skeletonDraft,mirrorMarker,
  exportRigDraft,importRigDraft,
} from '../src/lib/autoRig/nativeRig.js';

const bounds={min:{x:-1,y:0,z:-.25},max:{x:1,y:2,z:.25}};
const fresh=()=>initialMarkers(bounds);

test('02A initializes all 22 markers from Blender Z-up preset to Three.js Y-up',()=>{
  const m=fresh();
  assert.equal(LANDMARK_NAMES.length,22);
  assert.equal(Object.keys(m).length,22);
  assert.deepEqual(m.pelvis,[0,1.06,0]);
  assert.ok(m.headTop[1]>m.head[1]);
  assert.ok(m.leftWrist[0]<m.leftElbow[0]);
  assert.ok(m.rightWrist[0]>m.rightElbow[0]);
  assert.deepEqual(m.leftShoulder,[(-.12*2),1.54,0]);
});

test('02B matches existing 19-bone naming and parent hierarchy',()=>{
  const m=fresh(),bones=skeletonDraft(m);
  assert.equal(BONE_DEFS.length,19);
  assert.equal(bones.length,19);
  assert.deepEqual(bones.map(x=>x.name),
    BONE_DEFS.map(x=>x[0]));
  const seen=new Set();
  for(const b of bones){
    assert.ok(!b.parent||seen.has(b.parent),'Missing parent for '+b.name);
    assert.equal(b.head.length,3);
    assert.ok(b.tail.every(Number.isFinite));
    seen.add(b.name);
  }
  assert.equal(bones[0].name,'hips');
  assert.equal(bones.at(-1).name,'rightFoot');
});

test('02A refuses empty/degenerate bounds before creating handles',()=>{
  assert.throws(()=>initialMarkers(null),/límites/);
  assert.throws(()=>initialMarkers({min:{x:0,y:0,z:0},max:{x:0,y:0,z:0}}),/altura/);
  assert.throws(()=>initialMarkers({min:{x:0,y:0,z:NaN},max:{x:1,y:1,z:1}}),/finitos/);
});

test('02B blocks non-finite, missing and zero-length skeleton joints',()=>{
  const m=fresh();
  assert.equal(validateMarkers(m).ok,true);
  assert.equal(validateMarkers({...m,head:null}).ok,false);
  assert.equal(validateMarkers({...m,head:[Infinity,1,0]}).ok,false);
  assert.equal(validateMarkers({...m,headTop:[...m.head]}).ok,false);
  assert.throws(()=>skeletonDraft({...m,headTop:[...m.head]}),/longitud/);
});

test('02A mirrors only a corresponding point, never source data',()=>{
  const m=fresh();
  const modified={...m,leftElbow:[-.7,1.42,.14]};
  const result=mirrorMarker(modified,'leftElbow');
  assert.deepEqual(result.rightElbow,[.7,1.42,.14]);
  assert.notDeepEqual(modified.rightElbow,result.rightElbow);
  assert.deepEqual(modified.leftElbow,[-.7,1.42,.14]);
  assert.throws(()=>mirrorMarker(m,'pelvis'),/izquierdo o derecho/);
});

test('02A provides warnings rather than corrupting reversed orientation',()=>{
  const m=fresh();
  const reversed={...m,leftShoulder:m.rightShoulder,rightShoulder:m.leftShoulder};
  const result=validateMarkers(reversed);
  assert.ok(result.warnings.some(x=>x.includes('izquierda/derecha')));
});

test('02B exports only versioned editable JSON draft, roundtrips exact positions',()=>{
  const m=fresh(),draft=exportRigDraft(m,'LUMIA 50K.glb');
  assert.equal(draft.schemaVersion,NATIVE_RIG_SCHEMA);
  assert.equal(draft.coordinateSystem,'three-world-y-up');
  assert.equal(draft.status,'SKELETON_DRAFT_NO_SKINNING');
  assert.equal(draft.markerCount,22);
  assert.equal(draft.boneCount,19);
  assert.equal(draft.sourceFilename,'LUMIA 50K.glb');
  assert.equal('skinWeights' in draft,false);
  assert.equal('modelGeometry' in draft,false);
  const restored=importRigDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored,m);
  restored.pelvis[0]=999;
  assert.notEqual(m.pelvis[0],999);
});

test('02B rejects malformed or unrelated draft format',()=>{
  const m=fresh(),d=exportRigDraft(m);
  assert.throws(()=>importRigDraft({...d,schemaVersion:1}),/incompatible/);
  assert.throws(()=>importRigDraft({...d,coordinateSystem:'blender-z-up'}),/incompatible/);
  assert.throws(()=>importRigDraft({...d,markers:{...m,extraneous:[1,2,3]}}),/22 marcadores/);
  assert.throws(()=>importRigDraft({...d,markers:{...m,head:[NaN,0,0]}}),/no finito/);
});

test('02A/B integration uses a separate overlay, never writes into source rig',()=>{
  const src=readFileSync(new URL('../src/lib/autoRig/NativeRigEditor.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(src,/viewer\.scene\.add\(this\.root\)/);
  assert.match(src,/TransformControls/);
  assert.match(src,/raycaster\.intersectObjects/);
  assert.match(src,/this\.root\.parent\?\.remove\(this\.root\)/);
  assert.match(app,/AutoRigLab key=/);
  assert.match(app,/getViewer=\{getViewer\}/);
});
