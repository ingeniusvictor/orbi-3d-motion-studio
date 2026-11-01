import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Bone, AnimationClip, QuaternionKeyframeTrack } from 'three';
import { extensionOf, isSupportedModel, formatBytes, uniqueClipName, boneKey, inspectRigCompatibility, summarizeRenderableGeometry, validateLoadedContent } from '../src/lib/modelInfo.js';

test('admite modelos GLB, glTF, FBX y VRM sin distinguir mayúsculas', () => {
  assert.equal(isSupportedModel('Lumia.GLB'), true);
  assert.equal(isSupportedModel('personaje.gltf'), true);
  assert.equal(isSupportedModel('idle.FBX'), true);
  assert.equal(isSupportedModel('avatar.VRM'), true);
  assert.equal(isSupportedModel('foto.png'), false);
  assert.equal(extensionOf('archivo.sin.modelo.obj'), 'obj');
});
test('tamaños y nombres únicos', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-5), '—');
  assert.equal(uniqueClipName(['Idle', 'Idle (2)'], 'idle'), 'idle (3)');
  assert.equal(boneKey('mixamorig:Hips'), 'hips');
});
function model(names) {
  const root = new Object3D();
  let parent = root;
  for (const name of names) {
    const bone = new Bone(); bone.name = name; parent.add(bone); parent = bone;
  }
  return root;
}
const clip = new AnimationClip('Idle', 1, [new QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0,1], [0,0,0,1,0,0,0,1])]);
test('rig idéntico: acepta animación y resuelve el destino', () => {
  const out = inspectRigCompatibility(model(['Hips','Spine']), model(['mixamorig:Hips','mixamorig:Spine']), [clip]);
  assert.equal(out.ok, true);
  assert.equal(out.mappedTracks[0][1].name, 'Hips');
});
test('rechaza huesos ausentes y jerarquías incompletas', () => {
  assert.equal(inspectRigCompatibility(model(['Hips','Spine']), model(['Hips','Head']), [clip]).ok, false);
  assert.equal(inspectRigCompatibility(model(['Hips','Spine']), model(['Hips']), [clip]).ok, false);
});
test('rechaza clips con canales sin hueso correspondiente', () => {
  const unsupported = new AnimationClip('Scale', 1, [new QuaternionKeyframeTrack('unknown.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  assert.equal(inspectRigCompatibility(model(['Hips']), model(['Hips']), [unsupported]).ok, false);
});

test('distingue FBX solo de animación de un personaje con geometría', () => {
  const root = new Object3D();
  root.add(new Bone());
  assert.deepEqual(summarizeRenderableGeometry(root), {
    meshes:0, drawableMeshes:0, vertices:0, hasGeometry:false,
  });
});
test('detecta modelos con mallas ocultas y respeta jerarquía de visibilidad', async () => {
  const { Mesh, BufferGeometry, Float32BufferAttribute } = await import('three');
  const root = new Object3D();
  const geo = new BufferGeometry();
  geo.setAttribute('position',new Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0],3));
  root.add(new Mesh(geo));
  assert.equal(summarizeRenderableGeometry(root).drawableMeshes, 1);
  root.visible = false;
  const result = summarizeRenderableGeometry(root);
  assert.equal(result.hasGeometry, true);
  assert.equal(result.drawableMeshes, 0);
});

test('Mixamo Without Skin puede importarse como animación, pero no visualizarse como personaje', () => {
  const emptyGeometry = {hasGeometry:false, drawableMeshes:0};
  assert.equal(validateLoadedContent(emptyGeometry,1,true),null);
  assert.match(validateLoadedContent(emptyGeometry,1,false),/Without Skin/);
  assert.match(validateLoadedContent(emptyGeometry,0,true),/no contiene animaciones/);
});

test('un modelo visual sigue necesitando geometría visible', () => {
  assert.equal(validateLoadedContent({hasGeometry:true,drawableMeshes:1},0,false),null);
  assert.match(validateLoadedContent({hasGeometry:true,drawableMeshes:0},2,false),/ocultas/);
});
