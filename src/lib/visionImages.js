import { ddsToCanvas } from './ddsTexture.js';

/** Prepares a bounded contact sheet, locally, for a small 0.8B vision model. */
export async function textureContactSheet(files,{size=150,columns=3}={}){
  if(!Array.isArray(files)||!files.length||files.length>8)
    throw new Error('Se admiten de una a ocho texturas en una comparativa.');
  const rows=Math.ceil(files.length/columns),height=rows*(size+38)+20;
  const canvas=document.createElement('canvas');canvas.width=columns*(size+12)+12;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  if(!ctx)throw new Error('No se pudo generar la lámina visual.');
  ctx.fillStyle='#111c29';ctx.fillRect(0,0,canvas.width,height);
  for(let i=0;i<files.length;i++){
    const file=files[i];
    const x=12+(i%columns)*(size+12),y=10+Math.floor(i/columns)*(size+38);
    ctx.fillStyle='#243446';ctx.fillRect(x,y,size,size);
    let image=null,close=null;
    try{
      if(/\.dds$/i.test(file.name)){
        image=(await ddsToCanvas(await file.arrayBuffer())).canvas;
      }else{
        const bitmap=await createImageBitmap(file);image=bitmap;close=()=>bitmap.close();
      }
      const w=image.width,h=image.height,r=Math.min(size/w,size/h);
      ctx.drawImage(image,x+(size-w*r)/2,y+(size-h*r)/2,w*r,h*r);
    }catch{
      ctx.fillStyle='#e5ad83';ctx.font='12px sans-serif';ctx.fillText('No legible',x+12,y+size/2);
    }finally{close?.();}
    ctx.fillStyle='#0b1320';ctx.fillRect(x,y+size-24,size,24);
    ctx.font='bold 14px sans-serif';ctx.fillStyle='#ffffff';
    ctx.fillText(String(i+1),x+8,y+size-7);
    ctx.font='10px sans-serif';ctx.fillStyle='#d9ebfa';
    ctx.fillText(String(file.name).slice(0,23),x,y+size+14,size);
  }
  return canvas.toDataURL('image/jpeg',0.83);
}
