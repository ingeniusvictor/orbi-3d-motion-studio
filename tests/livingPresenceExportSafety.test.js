import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionViewer} from '../src/lib/viewer.js';

function fixture(){
  const events=[];
  const state={
    presenceSuspendCount:0,
    presence:{resetOverlay(){events.push('restore-procedural');}},
    vrm:{update(dt){events.push('sync-vrm-'+dt);}},
    model:{updateWorldMatrix(updateParents,updateChildren){
      events.push('world-'+updateParents+'-'+updateChildren);
    }},
  };
  return {state,events};
}
test('LP-02C.1 GLB/FBX export suspension restores raw VRM pose BEFORE cloning',async()=>{
  const {state,events}=fixture();
  const payload=await MotionViewer.prototype.withPresenceSuspended.call(state,async()=>{
    assert.equal(state.presenceSuspendCount,1);
    assert.deepEqual(events,[
      'restore-procedural','sync-vrm-0','world-true-true',
    ]);
    return 'exported';
  });
  assert.equal(payload,'exported');
  assert.equal(state.presenceSuspendCount,0);
});
test('LP-02C.1 nested export operations do not change saved pose twice',async()=>{
  const {state,events}=fixture();
  const invoke=fn=>MotionViewer.prototype.withPresenceSuspended.call(state,fn);
  const value=await invoke(async()=>{
    assert.equal(state.presenceSuspendCount,1);
    return invoke(async()=>{
      assert.equal(state.presenceSuspendCount,2);
      return 17;
    });
  });
  assert.equal(value,17);
  assert.equal(state.presenceSuspendCount,0);
  assert.equal(events.filter(x=>x==='restore-procedural').length,1);
});
test('LP-02C.1 export failure cannot leave the compositor suspended',async()=>{
  const {state,events}=fixture();
  await assert.rejects(
    ()=>MotionViewer.prototype.withPresenceSuspended.call(state,async()=>{
      throw new Error('Exportación falló');
    }),
    /Exportación falló/
  );
  assert.equal(state.presenceSuspendCount,0);
  assert.equal(events.filter(x=>x==='restore-procedural').length,1);
});
