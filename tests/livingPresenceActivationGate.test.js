import test from 'node:test';
import assert from 'node:assert/strict';
import {describePresenceGate} from '../src/lib/livingPresence/activationGate.js';
const gate=(overrides={})=>describePresenceGate({
  vrmReady:true,presenceEnabled:true,clipSelected:true,
  composerEligible:true,composerEnabled:false,composerActive:false,
  ...overrides,
});
test('LP-03A.1 no FBX: eyes and coordinator run with presence alone',()=>{
  const r=gate({clipSelected:false,composerEligible:false});
  assert.equal(r.running,true);assert.equal(r.needsComposer,false);
});
test('LP-03A.1 eligible Mixamo Idle: explicitly requires LP-02C.1',()=>{
  const r=gate();
  assert.equal(r.running,false);assert.equal(r.needsComposer,true);
  assert.match(r.reason,/LP-02C\.1/);
});
test('LP-03A.1 active compositor unlocks eyes and motor responses over FBX',()=>{
  const r=gate({composerEnabled:true,composerActive:true});
  assert.equal(r.running,true);assert.equal(r.needsComposer,false);
});
test('LP-03A.1 zero blend intensity must not claim ocular system is active',()=>{
  const r=gate({composerEnabled:true,composerActive:false});
  assert.equal(r.running,false);assert.equal(r.needsComposer,false);
  assert.match(r.reason,/0 %/);
});
test('LP-03A.1 action clips keep sole mixer ownership with no quick enable',()=>{
  const r=gate({composerEligible:false});
  assert.equal(r.running,false);assert.equal(r.needsComposer,false);
  assert.match(r.reason,/FBX/);
});
test('LP-03A.1 model and base-presence guards are explicit',()=>{
  assert.match(gate({vrmReady:false}).reason,/VRM/);
  assert.match(gate({presenceEnabled:false}).reason,/Presencia natural/);
});
