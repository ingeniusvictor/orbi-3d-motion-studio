import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {MotionViewer} from '../src/lib/viewer.js';
import {
  isSupportedModel,summarizeRenderableGeometry,validateLoadedContent,
} from '../src/lib/modelInfo.js';
import {describeViewerRenderableState} from '../src/lib/staticRigPreview.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('INTEGRATION-01 has both independent panels in a single UI with unchanged editing dock',()=>{
  const app=source('src/App.jsx');
  assert.match(app,/import MixamoRetargetLab from '\.\/MixamoRetargetLab\.jsx'/);
  assert.match(app,/import ViewportMotionDock from '\.\/ViewportMotionDock\.jsx'/);
  assert.match(app,/import AutoRigLab from '\.\/AutoRigLab\.jsx'/);
  assert.equal((app.match(/<MixamoRetargetLab\b/g)||[]).length,1);
  assert.equal((app.match(/<ViewportMotionDock\b/g)||[]).length,1);
  assert.equal((app.match(/<AutoRigLab\b/g)||[]).length,1);
  assert.match(app,/onComplete=\{\(\)=>\{syncPlayer\(\)/);
  assert.match(app,/Diagnosticar visualización/);
  assert.match(app,/\.obj,\.mtl,\.stl,\.ply,\.dae,\.3ds/);
});

test('INTEGRATION-01 MotionViewer retains static preview, live animation editing and opt-in retarget',()=>{
  const viewerSource=source('src/lib/viewer.js');
  assert.match(viewerSource,/import \{loadCompatibleModel\}/);
  assert.match(viewerSource,/import \{prepareStaticRigPreview,describeViewerRenderableState\}/);
  assert.match(viewerSource,/addLumiaMixamoRetarget\(file,/);
  assert.match(viewerSource,/cloneAtReferencePose\(this\.model,this\.referencePose\)/);
  assert.match(viewerSource,/VRMUtils\.deepDispose\(source\.model\)/);
  assert.match(viewerSource,/this\.clips\.push\(\{name,clip,source:'LUMIA Mixamo retarget experimental',modified:true\}\)/);
  assert.match(viewerSource,/editExistingRigAnimation\(/);
  assert.match(viewerSource,/getImportDiagnostics\(/);
  assert.match(viewerSource,/diagnoseModelVisibility\(/);
  assert.equal(typeof MotionViewer.prototype.addLumiaMixamoRetarget,'function');
  assert.equal(typeof MotionViewer.prototype.editExistingRigAnimation,'function');
  assert.equal(typeof MotionViewer.prototype.diagnoseModelVisibility,'function');
});

test('INTEGRATION-01 static rig without clips remains viewable while retarget stays explicit',async()=>{
  const root=new THREE.Group();
  const bone=new THREE.Bone();bone.name='J_Bip_C_Head';root.add(bone);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.5),
    new THREE.MeshBasicMaterial());
  root.add(mesh);
  assert.equal(isSupportedModel('LUMIA_V09.glb'),true);
  const report=summarizeRenderableGeometry(root);
  assert.equal(validateLoadedContent(report,0,false),null);
  const viewer=Object.create(MotionViewer.prototype);
  viewer.model=root;viewer.clips=[];viewer.vrm=null;
  viewer.lastFilename='LUMIA_V09.glb';viewer.lastFormat='GLB';
  viewer.lastImportDiagnostics={};
  viewer.resetCamera=()=>({ok:true,method:'sampled bounds'});
  const result=viewer.diagnoseModelVisibility();
  assert.equal(result.ok,true);
  assert.equal(result.animations,0);
  assert.equal(result.renderable.staticModel,true);
  assert.equal(result.renderable.meshes,1);
  assert.equal(describeViewerRenderableState(root,[]).staticModel,true);
  await assert.rejects(
    viewer.addLumiaMixamoRetarget({name:'unknown.glb'}),
    /archivo FBX animado/,
  );
  assert.equal(viewer.clips.length,0,'no fake motion or model mutation');
});

test('INTEGRATION-01 CI runs both JS viewer and Python golden-wrapper safety tests',()=>{
  const workflow=source('.github/workflows/verify.yml');
  const packageJson=JSON.parse(source('package.json'));
  const lab=source('src/MixamoRetargetLab.jsx');
  assert.match(workflow,/run: npm test/);
  assert.match(workflow,/python3 -m unittest discover -s tools\/mixamo-retarget/);
  assert.match(workflow,/run: npm run build/);
  assert.match(packageJson.scripts.prebuild,/prepare-viewer-decoders/);
  assert.match(packageJson.scripts.predev,/prepare-viewer-decoders/);
  assert.match(lab,/MOTION-06/);
  assert.match(lab,/Golden/);
  assert.match(lab,/model\.bones===346/);
  assert.match(lab,/getViewer\?\.\(\)/);
});
