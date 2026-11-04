import { decodeDds } from 'ac-dds/decode';

export const DDS_MAX_PIXELS = 4096 * 4096;
const DDS_MAGIC = 0x20534444;
const FOURCC = bytes => String.fromCharCode(...bytes.slice(84,88));
const MAX_SIZE = 50 * 1024 * 1024;
function bc4Values(bytes,start){
  const a=bytes[start],b=bytes[start+1];
  const palette=[a,b];
  if(a>b){
    for(let i=1;i<=6;i++)palette.push(Math.round(((7-i)*a+i*b)/7));
  }else{
    for(let i=1;i<=4;i++)palette.push(Math.round(((5-i)*a+i*b)/5));
    palette.push(0,255);
  }
  let bits=0n;
  for(let i=0;i<6;i++)bits|=BigInt(bytes[start+2+i])<<BigInt(i*8);
  return Array.from({length:16},(_,i)=>palette[Number((bits>>BigInt(i*3))&7n)]);
}
function decodeBC45(data,width,height,offset,bc5){
  const pixel=new Uint8Array(width*height*4);
  const xb=Math.ceil(width/4),yb=Math.ceil(height/4),size=bc5?16:8;
  const length=xb*yb*size;
  if(offset+length>data.byteLength)throw new Error('La textura DDS está incompleta (bloques BC4/BC5 faltantes).');
  for(let by=0;by<yb;by++)for(let bx=0;bx<xb;bx++){
    const start=offset+(by*xb+bx)*size;
    const red=bc4Values(data,start);
    const green=bc5?bc4Values(data,start+8):null;
    for(let py=0;py<4;py++)for(let px=0;px<4;px++){
      const x=bx*4+px,y=by*4+py;
      if(x>=width||y>=height)continue;
      const sample=py*4+px,dst=(y*width+x)*4,r=red[sample];
      pixel[dst]=r;
      if(bc5){
        const g=green[sample];
        const nx=r/127.5-1,ny=g/127.5-1;
        const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
        pixel[dst+1]=g;
        pixel[dst+2]=Math.round((nz*.5+.5)*255);
      }else{pixel[dst+1]=r;pixel[dst+2]=r;}
      pixel[dst+3]=255;
    }
  }
  return pixel;
}
/** Validate before allocating RGBA output; unsupported formats fail with a helpful error. */
export function inspectDdsHeader(buffer){
  const data=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(data.byteLength<128)throw new Error('DDS incompleto: faltan los 128 bytes del encabezado.');
  const dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(dv.getUint32(0,true)!==DDS_MAGIC||dv.getUint32(4,true)!==124)
    throw new Error('El archivo no tiene un encabezado DDS válido.');
  const height=dv.getUint32(12,true),width=dv.getUint32(16,true);
  if(width<1||height<1||width>16384||height>16384)
    throw new Error('Dimensiones DDS inválidas.');
  if(width*height>DDS_MAX_PIXELS)
    throw new Error('DDS demasiado grande ('+width+' × '+height+'). Por seguridad, conviértelo primero a PNG de máximo 4096 × 4096 píxeles.');
  const fourcc=FOURCC(data);
  let format=fourcc,offset=128,dxgi=null;
  if(fourcc==='DX10'){
    if(data.byteLength<148)throw new Error('DDS DX10 incompleto.');
    dxgi=dv.getUint32(128,true);
    offset=148;
    format=({71:'BC1',72:'BC1',74:'BC2',75:'BC2',77:'BC3',78:'BC3',
      80:'BC4',83:'BC5',98:'BC7',99:'BC7'})[dxgi]||'DXGI '+dxgi;
  }else{
    format=({DXT1:'BC1',DXT2:'BC2',DXT3:'BC2',DXT4:'BC3',DXT5:'BC3',
      ATI1:'BC4',BC4U:'BC4',ATI2:'BC5',BC5U:'BC5'})[fourcc]||fourcc;
    const fourccPresent=(dv.getUint32(80,true)&4)!==0;
    if(!fourccPresent){
      const bpp=dv.getUint32(88,true);
      format=bpp===32||bpp===24?'RGB/RGBA '+bpp:format;
    }
  }
  const arraySize=dxgi!==null?dv.getUint32(140,true):1;
  const caps2=dv.getUint32(112,true);
  if((caps2&0x200)!==0||arraySize>1)
    throw new Error('DDS cubemap o de varias imágenes: selecciona una textura 2D individual.');
  return {width,height,format,offset,dxgi,fourcc};
}
/** Decompress DDS into ordinary RGBA8 pixels so the viewer and GLB exporter both work. */
export async function decodeDDS(buffer){
  const header=inspectDdsHeader(buffer);
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(bytes.byteLength>MAX_SIZE)throw new Error('El archivo DDS supera el máximo de 50 MB.');
  let pixels;
  if(header.format==='BC4'||header.format==='BC5'){
    pixels=decodeBC45(bytes,header.width,header.height,header.offset,header.format==='BC5');
  }else{
    let result;
    try{
      result=decodeDds(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    }catch(error){
      throw new Error('No se pudo decodificar DDS '+header.format+': '+(error.message||error)+'. Convierte esta imagen a PNG en un editor de texturas.');
    }
    if(!result||!result.pixels)
      throw new Error('Compresión DDS '+header.format+' no compatible. Se admiten BC1, BC2, BC3, BC4, BC5, BC7 y RGB/RGBA habituales. Para otros formatos convierte a PNG.');
    if(result.width!==header.width||result.height!==header.height)
      throw new Error('La textura DDS decodificada no coincide con sus dimensiones originales.');
    pixels=result.pixels;
  }
  if(pixels.byteLength!==header.width*header.height*4)
    throw new Error('El DDS no se pudo convertir a RGBA8 válido.');
  return {width:header.width,height:header.height,pixels:Uint8Array.from(pixels),format:header.format};
}
export async function ddsToCanvas(buffer){
  const result=await decodeDDS(buffer);
  const canvas=document.createElement('canvas');
  canvas.width=result.width;canvas.height=result.height;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('El navegador no permite crear una imagen 2D para convertir este DDS.');
  const array=new Uint8ClampedArray(result.pixels);
  context.putImageData(new ImageData(array,result.width,result.height),0,0);
  return {canvas,format:result.format,width:result.width,height:result.height};
}
