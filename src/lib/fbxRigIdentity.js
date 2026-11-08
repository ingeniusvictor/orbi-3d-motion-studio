// MOTION-05B.3: reconcile a *physical* FBX LimbNode hierarchy after export.
// Some exporters resolve name collisions with static FBX scene nodes by
// renaming the one remaining body root. It is unsafe to blindly ignore such a
// mismatch, even when the bone count is correct.
export function reconcilePhysicalRigNames(expected,physical,loadedSkins=[]){
  if(!(expected instanceof Map)||!(physical instanceof Map))
    throw new Error('La auditoría del rig requiere dos mapas de huesos.');
  const missing=[...expected.keys()].filter(n=>!physical.has(n));
  const unexpected=[...physical.keys()].filter(n=>!expected.has(n));
  const mapping=new Map();
  const warnings=[];
  if(missing.length||unexpected.length){
    const bodyRootMissing=missing.length===1&&missing[0]==='root'&&
      expected.get('root')===null;
    const oneReplacement=unexpected.length===1&&
      physical.get(unexpected[0])===null;
    if(bodyRootMissing&&oneReplacement){
      const replacement=unexpected[0];
      // The FBX may hold a renamed helper as a LimbNode, but it must be a
      // root referenced by a SkinnedMesh skeleton, not an unrelated scene Bone.
      let references=0;
      for(const skin of loadedSkins){
        if(skin.skeleton?.bones?.some(b=>b?.isBone&&b.name===replacement))
          references++;
      }
      const originalChildren=[...expected]
        .filter(([,p])=>p==='root').map(([name])=>name).sort();
      const replacementChildren=[...physical]
        .filter(([,p])=>p===replacement).map(([name])=>name).sort();
      const exactChildren=originalChildren.length===replacementChildren.length&&
        originalChildren.every((n,i)=>n===replacementChildren[i]);
      if(references&&exactChildren){
        mapping.set('root',replacement);
        warnings.push('El exportador FBX cambió únicamente el nombre del hueso '+
          'raíz corporal «root» por «'+replacement+
          '». Se comprobaron la descendencia física y su uso por el skin. '+
          'Verifica que Mixamo reconozca este rig.');
      }
    }
    if(!mapping.size){
      throw new Error('El FBX exportado tiene '+physical.size+
        ' huesos físicos, pero no coincide su identidad con la referencia. '+
        'Faltan: '+(missing.slice(0,6).join(', ')||'ninguno')+
        '. Nuevos: '+(unexpected.slice(0,6).join(', ')||'ninguno')+
        '. No se puede aceptar un cambio de raíz sin comprobar la descendencia y el skin.');
    }
  }
  for(const [name,parent] of expected){
    const actual=mapping.get(name)||name;
    if(!physical.has(actual))
      throw new Error('El FBX perdió el hueso físico «'+name+'».');
    const actualParent=physical.get(actual);
    const mappedParent=parent===null?null:(mapping.get(parent)||parent);
    if(actualParent!==mappedParent)
      throw new Error('La jerarquía física de «'+name+'» cambió en FBX: '+
        'padre esperado «'+(mappedParent||'(raíz)')+
        '», obtenido «'+(actualParent||'(raíz)')+'».');
  }
  if(expected.size!==physical.size)
    throw new Error('El FBX añadió o perdió huesos físicos durante la exportación.');
  return {renamedBones:[...mapping].map(([before,after])=>({before,after})),warnings};
}
