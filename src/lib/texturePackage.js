import { unzipSync } from 'fflate';
import { isTextureFile } from './textureStudio.js';
import { normalizedPath } from './textureAuto.js';

export const PACKAGE_LIMITS=Object.freeze({
 archiveBytes:250*1024*1024,expandedBytes:200*1024*1024,
 perImageBytes:50*1024*1024,maxImages:300,maxDepth:16,
});
const IMAGE=/\.(png|jpe?g|webp|dds)$/i;
export function safeRelativePath(path){
 const name=String(path||'').replace(/\\/g,'/');
 const parts=name.split('/');
 if(!name||name[0]==='/'||/^[a-z]:/i.test(name)||parts.some(x=>x==='..'||x===''||x==='.'))
   throw new Error('Ruta ZIP insegura o no relativa: '+name.slice(0,160));
 if(parts.length>PACKAGE_LIMITS.maxDepth)
   throw new Error('La ruta del paquete tiene demasiadas subcarpetas.');
 if(name.length>512||parts.some(x=>x.length>160||/[\u0000-\u001f]/.test(x)))
   throw new Error('El nombre de una textura supera los límites de seguridad.');
 return name;
}
/**
 * Inspect the ZIP central directory BEFORE decompression to reject ZIP bombs,
 * encrypted files, ZIP64, paths escaping the package and excessive sizes.
 */
export function inspectTextureZip(buffer){
 const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(bytes.byteLength>PACKAGE_LIMITS.archiveBytes)
   throw new Error('ZIP supera 250 MB.');
 if(bytes.byteLength<22)throw new Error('ZIP incompleto.');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;
 for(let p=bytes.byteLength-22;p>=Math.max(0,bytes.byteLength-65557);p--){
   if(d.getUint32(p,true)===0x06054b50){end=p;break;}
 }
 if(end<0)throw new Error('No se encontró el directorio central de ZIP.');
 if(d.getUint16(end+4,true)||d.getUint16(end+6,true))
   throw new Error('ZIP multidisco no compatible.');
 const total=d.getUint16(end+10,true);
 const size=d.getUint32(end+12,true),offset=d.getUint32(end+16,true);
 if(total===65535||size===0xffffffff||offset===0xffffffff)
   throw new Error('ZIP64 no compatible; divide el paquete en ZIP más pequeños.');
 if(total>2000)throw new Error('Demasiados archivos en ZIP.');
 if(offset+size>bytes.byteLength)throw new Error('Directorio ZIP fuera de límites.');
 let pos=offset,sum=0;
 const decoder=new TextDecoder('utf-8');
 const entries=[];
 for(let i=0;i<total;i++){
   if(pos+46>bytes.byteLength||d.getUint32(pos,true)!==0x02014b50)
     throw new Error('Directorio ZIP dañado.');
   const flags=d.getUint16(pos+8,true),compression=d.getUint16(pos+10,true);
   const compressed=d.getUint32(pos+20,true),expanded=d.getUint32(pos+24,true);
   const nameLen=d.getUint16(pos+28,true),extraLen=d.getUint16(pos+30,true),commentLen=d.getUint16(pos+32,true);
   if(pos+46+nameLen+extraLen+commentLen>bytes.byteLength)
     throw new Error('Entrada ZIP fuera de límites.');
   const path=decoder.decode(bytes.subarray(pos+46,pos+46+nameLen));
   pos+=46+nameLen+extraLen+commentLen;
   if(flags&1)throw new Error('ZIP protegido con contraseña no compatible.');
   if(![0,8].includes(compression))throw new Error('Compresión ZIP no admitida: '+compression);
   if(path.endsWith('/'))continue;
   safeRelativePath(path);
   if(expanded===0xffffffff||compressed===0xffffffff)
     throw new Error('Entrada ZIP64 no compatible.');
   if(!IMAGE.test(path))continue;
   if(expanded===0||expanded>PACKAGE_LIMITS.perImageBytes)
     throw new Error('Imagen ZIP vacía o superior a 50 MB: '+path);
   sum+=expanded;
   if(sum>PACKAGE_LIMITS.expandedBytes)
     throw new Error('Las imágenes ZIP superan el máximo de 200 MB sin comprimir.');
   entries.push({path,expanded,compressed});
   if(entries.length>PACKAGE_LIMITS.maxImages)
     throw new Error('El ZIP incluye más de 300 imágenes.');
 }
 return {entries,expandedBytes:sum,zipBytes:bytes.byteLength};
}
export async function extractTextureZip(file){
 if(!file || file.size>PACKAGE_LIMITS.archiveBytes)
   throw new Error('El ZIP supera el tamaño máximo de 250 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const info=inspectTextureZip(bytes);
 // Limit included entries and total allocation BEFORE the sync decompressor.
 const allowed=new Set(info.entries.map(x=>x.path));
 const all=unzipSync(bytes,{filter:meta=>allowed.has(meta.name)});
 const output=[];
 for(const item of info.entries){
   const raw=all[item.path];
   if(!raw||raw.length!==item.expanded)
     throw new Error('La textura ZIP no coincide con su tamaño declarado: '+item.path);
   const filename=item.path.split('/').pop();
   const f=new File([raw],filename,{type:filename.toLowerCase().endsWith('.dds')?'application/octet-stream':'image/'+filename.split('.').pop()});
   Object.defineProperty(f,'orbiRelativePath',{value:item.path});
   output.push(f);
 }
 return output;
}
export function validateTexturePackage(files){
 const valid=[],seen=new Set();let total=0;
 for(const file of files||[]){
   const path=safeRelativePath(normalizedPath(file));
   if(!isTextureFile(file))continue;
   if(seen.has(path.toLowerCase()))continue;
   total+=file.size;
   if(total>PACKAGE_LIMITS.expandedBytes)throw new Error('El paquete de texturas supera 200 MB.');
   valid.push(file);seen.add(path.toLowerCase());
   if(valid.length>PACKAGE_LIMITS.maxImages)throw new Error('El paquete tiene más de 300 imágenes.');
 }
 return valid;
}
function entryFile(entry,path){
 return new Promise((resolve,reject)=>{
   entry.file(file=>{
     try{const name=safeRelativePath(path+'/'+file.name);Object.defineProperty(file,'orbiRelativePath',{value:name});resolve(file);}
     catch(e){reject(e);}
   },reject);
 });
}
function readDir(entry){
 return new Promise((resolve,reject)=>{
   const reader=entry.createReader(),out=[];
   const next=()=>reader.readEntries(part=>{
     if(!part.length){resolve(out);return;}
     out.push(...part);
     if(out.length>1200){reject(new Error('La carpeta contiene demasiados elementos.'));return;}
     next();
   },reject);
   next();
 });
}
export async function filesFromDrop(dataTransfer){
 const items=[...(dataTransfer?.items||[])];
 const collected=[];
 async function walk(entry,path,depth){
   if(depth>PACKAGE_LIMITS.maxDepth)throw new Error('La carpeta tiene demasiados niveles.');
   if(entry.isFile){collected.push(await entryFile(entry,path));return;}
   if(!entry.isDirectory)return;
   for(const child of await readDir(entry))await walk(child,path?path+'/'+entry.name:entry.name,depth+1);
 }
 for(const item of items){
   const entry=item.webkitGetAsEntry?.();
   if(entry)await walk(entry,'',0);
 }
 if(!collected.length){
   for(const file of Array.from(dataTransfer?.files||[]))collected.push(file);
 }
 return validateTexturePackage(collected);
}
