import {Bone,CheckCircle2,Download,ShieldAlert,ShieldCheck} from 'lucide-react';

const PREPARE='.\\tools\\autorig01_windows.ps1 -Step prepare';
const RIG='.\\tools\\autorig01_windows.ps1 -Step rig';
const validFormat=model=>model?.format==='GLB'||model?.format==='GLTF';
export function autoRigEligibility(model){
  if(!model)return {ok:false,reason:'Carga un personaje GLB o glTF sin esqueleto.'};
  if(!validFormat(model))return {
    ok:false,reason:'La primera versión solo acepta GLB/glTF estáticos. FBX y VRM no se modificarán.'};
  if(model.bones>0)return {
    ok:false,reason:'Este modelo ya contiene huesos; AUTORIG-01 no reemplaza rigs existentes.'};
  if(model.animations>0)return {
    ok:false,reason:'Este modelo contiene animaciones; AUTORIG-01 no las sobrescribe.'};
  if(model.meshes<1)return {ok:false,reason:'El modelo no tiene ninguna malla.'};
  return {ok:true,reason:'Compatible para preparar marcadores; la T-Pose y la calidad del skinning todavía deben verificarse en Blender.'};
}

export default function AutoRigLab({model}){
  const eligible=autoRigEligibility(model);
  return <section className="panel inspector-panel" aria-label="ORBI AutoRig Studio">
    <div className="panel-header"><div>
      <div className="section-icon mint"><Bone size={19}/></div>
      <div><h3>AutoRig Studio</h3><p>AUTORIG-01 · Humanoide experimental</p></div>
    </div></div>
    <div style={{padding:'14px 15px',display:'grid',gap:12}}>
      <div className="compat-note" style={{margin:0,alignItems:'flex-start'}}>
        {eligible.ok?<ShieldCheck size={17}/>:<ShieldAlert size={17}/>}
        <span>{eligible.reason}</span>
      </div>
      <small style={{fontSize:11,lineHeight:1.6,color:'#a8bdc9'}}>
        Primera etapa local asistida, similar al sistema de marcadores de Mixamo.
        Usa Blender instalado en Windows: el navegador no puede ejecutar Blender
        ni producir pesos de skinning por sí solo. Sin GPU dedicada obligatoria.
      </small>
      <details className="lp-accordion">
        <summary>Preparar personaje y colocar marcadores</summary>
        <div style={{display:'grid',gap:10,padding:10,fontSize:11,lineHeight:1.6}}>
          <div><strong>1.</strong> Utiliza un GLB sin huesos y vertical en T-Pose.
            La previsualización no transforma ni modifica el archivo.</div>
          <div><strong>2.</strong> Abre PowerShell desde el repositorio y ejecuta:</div>
          <code style={{wordBreak:'break-all',color:'#83ddcd'}}>{PREPARE}</code>
          <div><strong>3.</strong> Abre el workspace <code>ORBI_AUTORIG_WORKSPACE.blend</code> creado junto al GLB.
            Ajusta las esferas <code>ORBI_LM_*</code> sobre las articulaciones reales:
            pelvis, espalda, cuello, cabeza, hombros, codos, muñecas, manos, caderas, rodillas y pies.
            Guarda con Ctrl+S; no muevas el modelo original.</div>
          <div><strong>4.</strong> Tras la revisión visual, ejecuta:</div>
          <code style={{wordBreak:'break-all',color:'#83ddcd'}}>{RIG}</code>
          <div><strong>5.</strong> Solo si pasa las auditorías habrá candidatos
            <code> ORBI_AUTORIG_RIGGED.glb</code> y <code> .fbx</code>, además de un
            <code> .blend</code> editable y JSON de resultados.</div>
        </div>
      </details>
      <a className="outline-btn" style={{width:'100%',margin:0,textDecoration:'none'}}
        href="/autorig01/humanoid_tpose.json" download="humanoid_tpose.json">
        <Download size={15}/> Descargar esquema de marcadores
      </a>
      <a href="https://github.com/ingeniusvictor/orbi-3d-motion-studio/blob/feat/autorig-01/docs/AUTORIG-01-SAFE-BLENDER-WORKFLOW.md"
        target="_blank" rel="noreferrer"
        style={{fontSize:11,color:'#82daca'}}>Guía detallada y restricciones</a>
      <div style={{display:'flex',alignItems:'start',gap:7,fontSize:10,lineHeight:1.6,color:'#93aec0'}}>
        <CheckCircle2 size={14}/>
        <span>El modelo de origen nunca se sobrescribe. Los archivos V6/V7/V8 de LUMIA
          permanecen fuera de esta función. El rig corporal inicial tiene 19 huesos;
          dedos, rostro y retargeting son fases posteriores.</span>
      </div>
    </div>
  </section>;
}
