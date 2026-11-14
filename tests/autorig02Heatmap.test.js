import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  influenceColor,boneInfluenceHeatmap,combineInfluenceAudits,
} from '../src/lib/autoRig/weightHeatmap.js';

test('02C.2 gradient maps zero, middle and full influence to finite RGB colors',()=>{
  assert.deepEqual(influenceColor(0),[.035,.08,.22]);
  assert.deepEqual(influenceColor(1),[1,.18,.09]);
  for(const w of [0,.01,.15,.2,.45,.5,.7,.85,.999,1]){
    const color=influenceColor(w);
    assert.equal(color.length,3);
    assert.ok(color.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
  }
  assert.throws(()=>influenceColor(NaN),/entre 0 y 1/);
  assert.throws(()=>influenceColor(-.1),/entre 0 y 1/);
  assert.throws(()=>influenceColor(2),/entre 0 y 1/);
});

test('02C.2 correctly isolates a selected bone across all four influence slots',()=>{
  const indices=new Uint16Array([
    2,3,4,0,
    0,1,2,3,
    1,3,4,0,
  ]);
  const weights=new Float32Array([
    .6,.2,.1,.1,
    .1,.3,.4,.2,
    .6,.2,.1,.1,
  ]);
  const out=boneInfluenceHeatmap(indices,weights,2);
  assert.equal(out.colors.length,9);
  assert.equal(out.stats.vertices,3);
  assert.equal(out.stats.influencedVertices,2);
  assert.equal(out.stats.strongVertices,1);
  assert.ok(Math.abs(out.stats.influenceSum-1)<1e-6);
  assert.ok(Math.abs(out.stats.maximumInfluence-.6)<1e-6);
  assert.deepEqual(Array.from(out.colors.slice(6,9)),influenceColor(0));
  assert.equal(weights[0],new Float32Array([.6])[0],
    'read-only mapping must not alter source weights');
});

test('02C.2 aggregates per-mesh stats without counting colors as QA',()=>{
  const inputs=[
    {vertices:10,influencedVertices:4,strongVertices:2,influenceSum:2.5,
      maximumInfluence:.8},
    {vertices:20,influencedVertices:8,strongVertices:1,influenceSum:3.5,
      maximumInfluence:1},
  ];
  const s=combineInfluenceAudits(inputs);
  assert.equal(s.vertices,30);
  assert.equal(s.influencedVertices,12);
  assert.equal(s.strongVertices,3);
  assert.equal(s.influenceSum,6);
  assert.ok(Math.abs(s.averageInfluence-.2)<1e-12);
  assert.equal(s.maximumInfluence,1);
  assert.equal(combineInfluenceAudits([]).vertices,0);
});

test('02C.2 never accepts invalid buffers or unknown bones',()=>{
  assert.throws(()=>boneInfluenceHeatmap(new Uint16Array(4),
    new Float32Array(8),0),/incompletos/);
  assert.throws(()=>boneInfluenceHeatmap(new Uint16Array(4),
    new Float32Array([1,0,0,0]),-1),/Índice/);
  assert.throws(()=>boneInfluenceHeatmap(new Uint16Array(4),
    new Float32Array([-1,0,0,0]),0),/inválidos/);
});

test('02C.2 only swaps candidate materials and restores cloned ones on disposal',()=>{
  const text=readFileSync(new URL('../src/lib/autoRig/nativeSkinPreview.js',
    import.meta.url),'utf8');
  assert.match(text,/originalMaterials\.set\(rigged,materials\)/);
  assert.match(text,/mesh\.material=originalMaterials\.get\(mesh\)/);
  assert.match(text,/mesh\.geometry\.deleteAttribute\('color'\)/);
  assert.match(text,/disposeCandidate\(\)/);
  assert.match(text,/heatmapMaterial\?\.dispose\(\)/);
  assert.match(text,/source\.visible=false/);
  assert.doesNotMatch(text,/sourceMesh\.material\s*=/);
  assert.doesNotMatch(text,/sourceMesh\.geometry\.setAttribute/);
});
