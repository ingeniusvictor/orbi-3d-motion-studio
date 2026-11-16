import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=filename=>readFileSync(new URL('../src/'+filename,import.meta.url),'utf8');

test('02E places one accessible animation toggle in the 3D viewport toolbar',()=>{
  const app=read('App.jsx');
  assert.match(app,/className=\{motionDockOpen\?/);
  assert.match(app,/aria-label="Ajustes de animación en el visor"/);
  assert.match(app,/aria-controls="orbi-motion-dock"/);
  assert.match(app,/aria-expanded=\{motionDockOpen\}/);
  assert.match(app,/model\?\.bones>0&&<button/);
  assert.match(app,/<ViewportMotionDock/);
  assert.match(app,/onClick=\{\(\)=>changeTool\('motion'\)\}/);
  assert.match(app,/setMotionDockOpen\(open=>!open\);setFaceDockOpen\(false\);setActiveTool\(''\)/);
  assert.match(app,/setFaceDockOpen\(open=>!open\);setMotionDockOpen\(false\);setActiveTool\(''\)/);
});

test('02E moves the ONLY rigged animation editor from sidebar into viewer',()=>{
  const app=read('App.jsx'),lab=read('AutoRigLab.jsx'),
    dock=read('ViewportMotionDock.jsx');
  assert.doesNotMatch(lab,/import ExistingRigMotionLab/);
  assert.doesNotMatch(lab,/<ExistingRigMotionLab/);
  assert.equal((app.match(/<ViewportMotionDock/g)||[]).length,1);
  assert.equal((dock.match(/<ExistingRigMotionLab/g)||[]).length,1);
  assert.match(dock,/id="orbi-motion-dock"/);
  assert.match(dock,/style=\{\{display:open\?'flex':'none'\}\}/);
  assert.match(dock,/compact visible=\{open\}/);
  assert.match(dock,/onClose/);
  assert.match(dock,/setSide\(value=>value==='right'\?'left':'right'\)/);
  assert.match(lab,/botón/);
});

test('02E adjusts arms first; advanced fields and rig mapping are collapsible',()=>{
  const lab=read('ExistingRigMotionLab.jsx');
  assert.match(lab,/compact=false,visible=true/);
  assert.match(lab,/if\(!visible\)return undefined/);
  assert.match(lab,/Asignación de huesos \(avanzado\)/);
  assert.match(lab,/Más ajustes · Look, Overdrive, Trim y Mirror/);
  assert.match(lab,/Character Arm-Space · separación de brazos/);
  assert.match(lab,/Arms · amplitud del movimiento/);
  assert.match(lab,/editExistingRigAnimation\(clipIndex,v,targets\)/);
  assert.match(lab,/exportGLB\(/);
  assert.match(lab,/Restaurar movimiento original/);
  assert.match(lab,/seekExistingRigAnimation/);
});

test('02E dock scrolls independently, supports moving side and responsive viewport',()=>{
  const css=read('styles.css');
  for(const style of [
    '.viewport-motion-dock{',
    '.viewport-motion-dock.dock-right{',
    '.viewport-motion-dock.dock-left{',
    '.viewport-motion-dock-scroll{',
    'overflow-y:auto',
    'overscroll-behavior:contain',
    '@media(max-width:580px)',
    '.viewport-motion-trigger',
  ])assert.ok(css.includes(style),style);
});
