import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Bone, AnimationClip, QuaternionKeyframeTrack } from 'three';
import { extensionOf, isSupportedModel, formatBytes, uniqueClipName, boneKey, inspectRigCompatibility } from '../src/lib/modelInfo.js';

test('admite modelos GLB, glTF y FBX sin distinguir mayúsculas', () => {
  assert.equal(isSupportedModel('Lumia.GLB'), true);
  assert.equal(isSupportedModel('personaje.gltf'), true);
  assert.equal(isSupportedModel('idle.FBX'), true);
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
