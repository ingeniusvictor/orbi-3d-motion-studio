// QA dock policy lives outside React: tests can validate the actual
// availability rules independently from the rendered floating buttons.
export function canRunFacialQuickAction(action,{face,lip,presenceEnabled,fbx=false}={}){
  if(action?.group==='mouth')return Boolean(lip?.mapping?.[action.key]&&!lip?.active&&(!fbx||face?.enabled));
  if(action?.key==='blink')return Boolean(face?.blink&&presenceEnabled);
  if(action?.feature==='gaze')return Boolean(face?.gaze&&presenceEnabled);
  if(!face?.enabled)return false;
  if(action?.feature==='squint')
    return Boolean(face?.channels?.leftSquint||face?.channels?.rightSquint);
  return Boolean(face?.channels?.[action?.feature]);
}
