import * as THREE from 'three';

// MOTION-05E.1: compare *real round-tripped FBX geometry*, not just bones,
// total vertices or bounding boxes. Point coverage catches local missing
// surfaces (body/face/hair) even when global bounds remain unchanged.
const SOURCE_SAMPLES=15000;
const TARGET_SAMPLES=160000;
const MAX_MATERIALS=512;
const finite=v=>v.toArray().every(Number.isFinite);
const materialList=mesh=>{
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(materials.length>MAX_MATERIALS)
    throw new Error('Demasiados materiales en «'+mesh.name+'».');
  return materials.map(m=>({
    name:m?.name||'',side:m?.side??THREE.FrontSide,
    opacity:Number(m?.opacity??1),transparent:Boolean(m?.transparent),
    alphaTest:Number(m?.alphaTest??0),
    hasTexture:Boolean(m?.map||m?.normalMap||m?.alphaMap),
  }));
};
function meshes(root){
  const list=[];root.traverse(node=>{
    if(node.isMesh&&node.geometry?.getAttribute('position')?.count)
      list.push(node);
  });return list;
}
const triangles=mesh=>{
  const geom=mesh.geometry;
  const count=geom.index?.count||geom.getAttribute('position')?.count||0;
  if(count%3!==0)throw new Error('Índices no triangulares en «'+mesh.name+'».');
  return count/3;
};
function sampleVertices(mesh,max){
  const attr=mesh.geometry?.getAttribute('position');
  if(!attr?.count)return [];
  const step=Math.max(1,Math.ceil(attr.count/max));
  const points=[],p=new THREE.Vector3();
  // Keep SkinnedMesh.bindMatrixInverse synchronized after scene rotations.
  mesh.updateMatrixWorld(true);
  for(let i=0;i<attr.count;i+=step){
    mesh.getVertexPosition(i,p);
    p.applyMatrix4(mesh.matrixWorld);
    if(!finite(p))
      throw new Error('«'+mesh.name+'» contiene vértices no finitos (índice '+i+').');
    points.push(p.clone());
  }
  return points;
}
function geomStats(mesh){
  const g=mesh.geometry;
  return {
    name:mesh.name||'(sin nombre)',
    skinned:Boolean(mesh.isSkinnedMesh),
    vertices:g.getAttribute('position').count,
    triangles:triangles(mesh),
    morphs:g.morphAttributes?.position?.length||0,
    materials:materialList(mesh),
    mesh,
  };
}
const close=(a,b)=>a===b;
const prefix='Auditoría de geometría FBX: ';
const fail=message=>{throw new Error(prefix+message);};
const cellKey=(x,y,z)=>x+','+y+','+z;
function nearestCoverage(source,target){
  const box=new THREE.Box3().setFromPoints(source);
  const diameter=Math.max(box.getSize(new THREE.Vector3()).length(),1e-4);
  // 0.6% of mesh diagonal; enough for independent FBX triangulation while
  // detecting centimeter-scale missing patches on a human body.
  const tolerance=Math.max(diameter*.006,1e-6);
  const inverse=1/tolerance;
  const cells=new Map();
  const coordinates=p=>[
    Math.floor(p.x*inverse),Math.floor(p.y*inverse),Math.floor(p.z*inverse),
  ];
  for(const p of target){
    const [x,y,z]=coordinates(p),key=cellKey(x,y,z);
    let bucket=cells.get(key);
    if(!bucket){bucket=[];cells.set(key,bucket);}
    bucket.push(p);
  }
  const min=box.min,size=box.getSize(new THREE.Vector3());
  const zones=new Map();
  let missed=0;
  const threshold=tolerance*tolerance;
  for(const p of source){
    const [x,y,z]=coordinates(p);
    let found=false;
    for(let dx=-1;dx<=1&&!found;dx++)
      for(let dy=-1;dy<=1&&!found;dy++)
        for(let dz=-1;dz<=1&&!found;dz++){
          const bucket=cells.get(cellKey(x+dx,y+dy,z+dz));
          if(!bucket)continue;
          for(const q of bucket)if(q.distanceToSquared(p)<=threshold){
            found=true;break;
          }
        }
    if(!found)missed++;
    const region=[p.x,p.y,p.z].map((n,i)=>{
      const length=[size.x,size.y,size.z][i];
      const ratio=length<1e-8?0:(n-[min.x,min.y,min.z][i])/length;
      return Math.min(3,Math.max(0,Math.floor(ratio*4)));
    }).join('-');
    if(!zones.has(region))zones.set(region,{tested:0,missing:0});
    const regionStat=zones.get(region);regionStat.tested++;
    if(!found)regionStat.missing++;
  }
  const coverage=source.length?(source.length-missed)/source.length:0;
  const worst=[...zones].filter(([,z])=>z.tested>=20)
    .map(([zone,z])=>({...z,zone,coverage:1-z.missing/z.tested}))
    .sort((a,b)=>a.coverage-b.coverage)[0]||null;
  return {sampled:source.length,coverage,missed,
    localWorst:worst?{
      region:worst.zone,coverage:worst.coverage,
      missing:worst.missing,tested:worst.tested,
    }:null,tolerance};
}
export function auditMeshRoundTrip(prepared,reimported){
  prepared.updateMatrixWorld(true);
  reimported.updateMatrixWorld(true);
  const source=meshes(prepared).map(geomStats);
  const output=meshes(reimported).map(geomStats);
  if(!source.length)fail('la escena de referencia no contiene superficies.');
  if(source.length!==output.length)
    fail('faltan o sobran mallas. Preparadas: '+source.length+
      ', reimportadas: '+output.length+
      '. El FBX podría perder partes del cuerpo/ropa. No se descargó.');
  const matched=new Set(),warnings=[],details=[];
  for(const original of source){
    let candidate=output.find((m,i)=>!matched.has(i)&&m.name===original.name&&
      m.skinned===original.skinned);
    if(!candidate){
      const options=output.filter((m,i)=>!matched.has(i)&&
        m.skinned===original.skinned&&m.triangles===original.triangles);
      if(options.length!==1)
        fail('la malla «'+original.name+'» no se encuentra de forma inequívoca; '+
          'posible pérdida de piezas o cambio de topología.');
      candidate=options[0];
      warnings.push('La malla «'+original.name+'» se renombró a «'+
        candidate.name+'». Se verificó la correspondencia geométrica.');
    }
    const index=output.indexOf(candidate);matched.add(index);
    if(candidate.skinned!==original.skinned)
      fail('«'+original.name+'» perdió su vínculo de skinning.');
    if(original.triangles!==candidate.triangles)
      fail('«'+original.name+'» tiene '+original.triangles+
        ' triángulos antes y '+candidate.triangles+
        ' después del FBX. Puede faltar una superficie (por ejemplo, cadera, hombro o cabello).');
    if(original.morphs!==candidate.morphs)
      fail('«'+original.name+'» perdió morph targets: '+original.morphs+
        ' originales, '+candidate.morphs+' reimportados. No se permite perder expresiones.');
    if(original.materials.length!==candidate.materials.length)
      fail('«'+original.name+'» cambió de '+original.materials.length+
        ' materiales a '+candidate.materials.length+
        '; podría dejar caras invisibles o cambiar sus superficies.');
    for(let i=0;i<original.materials.length;i++){
      const a=original.materials[i],b=candidate.materials[i];
      if(a.side===THREE.DoubleSide&&b.side!==THREE.DoubleSide)
        fail('«'+original.name+'» perdió el material de doble cara #'+i+
          '. Se podrían ocultar superficies vistas desde atrás.');
      if(a.transparent&&!b.transparent&&a.opacity<.99)
        fail('«'+original.name+'» perdió transparencia en material #'+i+'.');
      if(a.hasTexture&&!b.hasTexture)
        warnings.push('«'+original.name+'»: texturas no incorporadas/verificables en '+
          'material #'+i+'. Conservar originales para Blender/Mixamo.');
    }
    const a=sampleVertices(original.mesh,SOURCE_SAMPLES);
    const b=sampleVertices(candidate.mesh,TARGET_SAMPLES);
    if(!a.length||!b.length)
      fail('«'+original.name+'» no contiene vértices verificables.');
    const forward=nearestCoverage(a,b);
    const backward=nearestCoverage(
      sampleVertices(candidate.mesh,Math.min(SOURCE_SAMPLES,6000)),
      sampleVertices(original.mesh,TARGET_SAMPLES));
    const fmt=v=>(100*v).toFixed(2)+'%';
    const worst=forward.localWorst;
    if(forward.coverage<.997||
      (worst&&worst.coverage<.96)||
      backward.coverage<.992){
      fail('«'+original.name+'» presenta pérdida/desplazamiento de superficie '+
        'en el FBX reimportado. Cobertura original→FBX '+fmt(forward.coverage)+
        ', FBX→original '+fmt(backward.coverage)+
        (worst?', región '+worst.region+' '+fmt(worst.coverage):'')+
        '. No se descargó un personaje con posibles deformaciones.');
    }
    details.push({mesh:original.name,exportedAs:candidate.name,
      skinned:original.skinned,triangles:original.triangles,
      verticesBefore:original.vertices,verticesAfter:candidate.vertices,
      coverage:forward.coverage,reverseCoverage:backward.coverage,
      worstRegion:worst?.region||null,materials:original.materials.length,
      morphs:original.morphs});
  }
  return {passed:true,meshCount:details.length,
    details,warnings};
}
// Compare topological components of the BODY before any posing; the bow may
// intentionally be converted into a rigid static mesh.
export function auditBodyPreparation(source,prepared){
  const getSkins=r=>meshes(r).filter(m=>m.isSkinnedMesh);
  const before=getSkins(source).sort((a,b)=>
    b.geometry.getAttribute('position').count-
    a.geometry.getAttribute('position').count)[0];
  const after=getSkins(prepared).sort((a,b)=>
    b.geometry.getAttribute('position').count-
    a.geometry.getAttribute('position').count)[0];
  if(!before||!after)
    fail('el cuerpo principal no conserva un SkinnedMesh verificable.');
  const orig=geomStats(before),post=geomStats(after);
  if(orig.vertices!==post.vertices||orig.triangles!==post.triangles||
    orig.morphs!==post.morphs)
    fail('el cuerpo cambió de topología o perdió expresiones durante la '+
      'preparación de la pose. Antes: '+orig.vertices+' vértices/'+
      orig.triangles+' triángulos/'+orig.morphs+' morphs; después: '+
      post.vertices+'/'+post.triangles+'/'+post.morphs+'.');
  return {bodyName:orig.name,triangles:orig.triangles,
    vertices:orig.vertices,morphs:orig.morphs};
}
