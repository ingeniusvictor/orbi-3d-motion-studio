#!/usr/bin/env python3
"""Local LUMIA V09 GLB diagnostic: adds a 4-second motion, preserving artwork.
Usage: py -3 tools/create_lumia_v09_test_glb.py "C:\path\LUMIA_V09_CLAUDE_ORGANIC_FUSION_CANDIDATE.glb"
No libraries to install. No file is uploaded or overwritten.
"""
import json
import math
import struct
import sys
from pathlib import Path

BONES = [
    ("V8_Bip001-L-UpperArm", "z", [0, .13, -.08, .09, 0]),
    ("V8_Bip001-R-UpperArm", "z", [0, -.13, .08, -.09, 0]),
    ("V8_Bip001-Spine2", "y", [0, .055, 0, -.055, 0]),
    ("J_Bip_C_Head", "y", [0, -.06, 0, .06, 0]),
    ("V8_Bip001-Neck", "z", [0, .02, 0, -.02, 0]),
]

def mul(a, b):
    x,y,z,w=a
    X,Y,Z,W=b
    return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X,
            w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)

def main(path):
    src=Path(path).expanduser().resolve()
    dest=src.with_name("LUMIA_V09_PRUEBA_ANIMADA_ORBI.glb")
    if dest.exists():
        raise ValueError("La copia ya existe. Conserva o renombra: "+str(dest))
    data=src.read_bytes()
    if len(data)<28 or struct.unpack_from("<4sII",data)!=(b"glTF",2,len(data)):
        raise ValueError("No es GLB 2.0 valido")
    length,kind=struct.unpack_from("<I4s",data,12)
    if kind!=b"JSON": raise ValueError("Falta bloque JSON")
    asset=json.loads(data[20:20+length])
    if asset.get("animations"):
        raise ValueError("Este archivo ya tiene animaciones; no se tocara")
    off=20+length
    binary_len,binary_kind=struct.unpack_from("<I4s",data,off)
    if binary_kind!=b"BIN\0" or off+8+binary_len!=len(data):
        raise ValueError("Bloque BIN inesperado")
    original_bin=data[off+8:]
    new_bin=bytearray(original_bin)
    byname={n.get("name"):i for i,n in enumerate(asset["nodes"])}
    if any(name not in byname for name,_,_ in BONES):
        raise ValueError("Los nombres de huesos no corresponden a LUMIA V09")

    def append_accessor(values,kind,components):
        while len(new_bin)%4:new_bin.append(0)
        offset=len(new_bin)
        payload=struct.pack("<"+"f"*len(values),*values)
        new_bin.extend(payload)
        view=len(asset["bufferViews"])
        asset["bufferViews"].append({"buffer":0,"byteOffset":offset,
                                     "byteLength":len(payload)})
        acc=len(asset["accessors"])
        record={"bufferView":view,"componentType":5126,
                "count":len(values)//components,"type":kind}
        if kind=="SCALAR":
            record["min"]=[min(values)]
            record["max"]=[max(values)]
        asset["accessors"].append(record)
        return acc

    ti=append_accessor([0.,1.,2.,3.,4.],"SCALAR",1)
    samplers,channels=[],[]
    for name,axis,angles in BONES:
        ni=byname[name]
        base=asset["nodes"][ni].get("rotation",[0.,0.,0.,1.])
        values=[]
        for angle in angles:
            sn,cs=math.sin(angle/2),math.cos(angle/2)
            delta=(sn,0,0,cs) if axis=="x" else (
                (0,sn,0,cs) if axis=="y" else (0,0,sn,cs))
            q=mul(base,delta)
            n=math.sqrt(sum(v*v for v in q))
            values.extend(v/n for v in q)
        val=append_accessor(values,"VEC4",4)
        channels.append({"sampler":len(samplers),
                         "target":{"node":ni,"path":"rotation"}})
        samplers.append({"input":ti,"output":val,"interpolation":"LINEAR"})
    asset["animations"]=[{"name":"ORBI_DIAGNOSTICO_4S_MOVIMIENTO_SUAVE_NO_CLAUDE",
                           "samplers":samplers,"channels":channels}]
    while len(new_bin)%4:new_bin.append(0)
    asset["buffers"][0]["byteLength"]=len(new_bin)
    jb=json.dumps(asset,ensure_ascii=False,separators=(",",":")).encode()
    jb+=b" "*(-len(jb)%4)
    output=(struct.pack("<4sII",b"glTF",2,12+8+len(jb)+8+len(new_bin))+
            struct.pack("<I4s",len(jb),b"JSON")+jb+
            struct.pack("<I4s",len(new_bin),b"BIN\0")+new_bin)
    assert output[20+len(jb)+8:][:len(original_bin)]==original_bin
    dest.write_bytes(output)
    print("CREADO:",dest)
    print("ORIGINAL INTACTO:",src)
    print("Esta es una prueba de animacion, no una reparacion del visor.")

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit('Uso: py -3 create_lumia_v09_test_glb.py "ruta_glb_original"')
    main(sys.argv[1])
