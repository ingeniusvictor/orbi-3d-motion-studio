import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isKnownMintSplitRig,suggestedAccessoryMode,
  accessoryModeLabel,strictSplitRigHint,
} from '../src/lib/motionExportModes.js';

const mint={
  filename:'Mint_Swimsuit_V6_LUMIA_AZUL_OJOS_CIAN.fbx',
  format:'FBX',meshes:2,bones:376,
};
test('MOTION-05B.1 known Mint 340+36 rig defaults visibly to rigid ChestBow',()=>{
  assert.equal(isKnownMintSplitRig(mint),true);
  assert.equal(suggestedAccessoryMode(mint),'rigid');
  assert.equal(accessoryModeLabel('rigid'),'Lazo rígido unido al torso');
  assert.equal(accessoryModeLabel('exclude'),'Solo cuerpo, sin accesorio');
});
test('MOTION-05B.1 unknown models never silently default to an irreversible accessory conversion',()=>{
  for(const info of [
    {filename:'personaje.fbx',meshes:2,bones:376},
    {filename:'Mint_Swimsuit_unrelated.fbx',meshes:4,bones:376},
    {filename:'Mint_Swimsuit_unrelated.fbx',meshes:2,bones:75},
    null,undefined,
  ]){
    assert.equal(suggestedAccessoryMode(info),'strict');
    assert.equal(isKnownMintSplitRig(info),false);
  }
});
test('MOTION-05B.1 strict mode reports the exact actionable failure, not a generic root mismatch',()=>{
  const err=new Error('«root» tiene orientación o escala de referencia distinta en «mint019_swimsuit_ChestBow_skin_LOD0». No es una simple traslación.');
  assert.match(strictSplitRigHint(err,'strict'),/conservar accesorio como malla rígida/i);
  assert.match(strictSplitRigHint(err,'strict'),/Solo cuerpo/);
  assert.equal(strictSplitRigHint(err,'rigid'),'');
  assert.equal(strictSplitRigHint(err,'exclude'),'');
  assert.equal(strictSplitRigHint(new Error('Falta una malla'), 'strict'),'');
});
