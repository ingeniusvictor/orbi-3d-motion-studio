"""ORBI AUTORIG-01 / CPU-first proof of concept for unrigged GLB humanoids.

PREPARE: blender -b --python tools/autorig01_blender.py -- --mode prepare --input person.glb --output-dir DIR
RIG:     blender -b --python tools/autorig01_blender.py -- --mode rig --workspace DIR/ORBI_AUTORIG_WORKSPACE.blend --output-dir DIR

Neither command modifies the source GLB. Manual marker verification in Blender is
REQUIRED between stages. This is not a neural auto-rigger or Mixamo equivalent.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import traceback
from pathlib import Path

try:
    import bpy
    from mathutils import Vector
except ImportError:
    raise SystemExit("AUTORIG-01 requires Blender's bundled Python (bpy).")

PREFIX = "ORBI_LM_"
BODY_BONES = [
    ("hips", "pelvis", "spine", None),
    ("spine", "spine", "chest", "hips"),
    ("chest", "chest", "neck", "spine"),
    ("neck", "neck", "head", "chest"),
    ("head", "head", "headTop", "neck"),
    ("leftClavicle", "chest", "leftShoulder", "chest"),
    ("leftUpperArm", "leftShoulder", "leftElbow", "leftClavicle"),
    ("leftLowerArm", "leftElbow", "leftWrist", "leftUpperArm"),
    ("leftHand", "leftWrist", "leftHand", "leftLowerArm"),
    ("rightClavicle", "chest", "rightShoulder", "chest"),
    ("rightUpperArm", "rightShoulder", "rightElbow", "rightClavicle"),
    ("rightLowerArm", "rightElbow", "rightWrist", "rightUpperArm"),
    ("rightHand", "rightWrist", "rightHand", "rightLowerArm"),
    ("leftUpperLeg", "leftHip", "leftKnee", "hips"),
    ("leftLowerLeg", "leftKnee", "leftAnkle", "leftUpperLeg"),
    ("leftFoot", "leftAnkle", "leftToe", "leftLowerLeg"),
    ("rightUpperLeg", "rightHip", "rightKnee", "hips"),
    ("rightLowerLeg", "rightKnee", "rightAnkle", "rightUpperLeg"),
    ("rightFoot", "rightAnkle", "rightToe", "rightLowerLeg"),
]

def args():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=("prepare", "rig"), required=True)
    p.add_argument("--input", help="GLB/GLTF input for prepare")
    p.add_argument("--workspace", help="Manually inspected .blend workspace for rig")
    p.add_argument("--output-dir", required=True)
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

def all_bounds(objects):
    points = []
    for obj in objects:
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    require(points, "No se encontraron vértices visibles para calcular límites.")
    mins = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    maxs = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return mins, maxs

def marker_preset():
    file = Path(__file__).resolve().parents[1] / "public" / "autorig01" / "humanoid_tpose.json"
    require(file.is_file(), "No se encuentra el preset de marcadores: " + str(file))
    data = json.loads(file.read_text(encoding="utf-8"))
    require(data.get("schemaVersion") == 1, "Preset de marcadores incompatible.")
    return data["markers"]

def require_output_paths(folder, filenames):
    folder.mkdir(parents=True, exist_ok=True)
    for f in filenames:
        require(not (folder / f).exists(),
                "Salida existente (no se sobrescribe): " + str(folder / f))

def origin_inventory():
    objects = meshes()
    require(objects, "El GLB no contiene mallas.")
    require(not any(o.type == "ARMATURE" for o in bpy.context.scene.objects),
            "Ya hay armature en el modelo: AUTORIG-01 admite únicamente un personaje sin rig.")
    require(not any(o.animation_data and o.animation_data.action for o in bpy.context.scene.objects),
            "El modelo contiene acciones: no se reemplazarán animaciones existentes.")
    require(all(len(o.data.vertices) >= 3 for o in objects), "Hay una malla vacía.")
    require(all(not any(m.type == "ARMATURE" for m in o.modifiers) for o in objects),
            "La malla ya posee un modificador Armature.")
    mins, maxs = all_bounds(objects)
    size = maxs - mins
    require(all(math.isfinite(v) for v in (*mins, *maxs)) and
            min(size.x, size.y, size.z) > 1e-5,
            "El GLB tiene geometría plana/degenerada o transformaciones inválidas.")
    require(size.z > max(size.x, size.y) * .85,
            "El personaje no parece vertical en Z de Blender. Oriéntalo antes de riggear.")
    return objects, mins, maxs

def count_shapes(obj):
    keys = obj.data.shape_keys
    return max(0, len(keys.key_blocks) - 1) if keys else 0

def inventory(objects):
    mins, maxs = all_bounds(objects)
    return {
        "meshCount": len(objects),
        "vertices": sum(len(o.data.vertices) for o in objects),
        "polygons": sum(len(o.data.polygons) for o in objects),
        "shapeKeys": sum(count_shapes(o) for o in objects),
        "materials": sum(len(o.material_slots) for o in objects),
        "boundsMin": [float(v) for v in mins],
        "boundsMax": [float(v) for v in maxs],
        "meshes": {o.name: {"vertices":len(o.data.vertices),
                             "polygons":len(o.data.polygons),
                             "shapes":count_shapes(o),
                             "materials":len(o.material_slots)} for o in objects},
    }

def set_active(obj):
    bpy.context.view_layer.objects.active = obj

def prepare(input_file, out):
    require(input_file and input_file.is_file() and input_file.suffix.lower() in (".glb", ".gltf"),
            "Selecciona un GLB/GLTF existente.")
    # External .gltf assets can be referenced; prefer GLB for a self-contained source.
    folder = out
    workspace = folder / "ORBI_AUTORIG_WORKSPACE.blend"
    report = folder / "AUTORIG_PREPARE_AUDIT.json"
    require_output_paths(folder, (workspace.name, report.name))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_file))
    bpy.context.view_layer.update()
    objects, mins, maxs = origin_inventory()
    before = inventory(objects)
    size = maxs - mins
    landmark_data = marker_preset()
    require(len(landmark_data) == len(set(landmark_data)), "Marcadores duplicados.")
    for name, xyz in landmark_data.items():
        require(len(xyz) == 3 and all(0 <= float(v) <= 1 for v in xyz),
                "Coordenada normalizada inválida: " + name)
        ob = bpy.data.objects.new(PREFIX + name, None)
        ob.empty_display_type = "SPHERE"
        ob.empty_display_size = max(size.z * .012, 0.003)
        ob.location = mins + Vector(tuple(size[i] * float(xyz[i]) for i in range(3)))
        bpy.context.scene.collection.objects.link(ob)
        ob["orbi_autorig_landmark"] = name
    bpy.context.scene["orbi_autorig_stage"] = "MARKERS_PENDING_USER_REVIEW"
    bpy.context.scene["orbi_autorig_source"] = str(input_file)
    bpy.context.scene["orbi_autorig_sha256"] = sha256(input_file)
    bpy.context.scene["orbi_autorig_mesh_count"] = len(objects)
    bpy.ops.wm.save_as_mainfile(filepath=str(workspace))
    result = {"status":"MARKERS_PENDING_USER_REVIEW", "source":str(input_file),
              "sha256":bpy.context.scene["orbi_autorig_sha256"],
              "workspace":str(workspace), "geometry":before,
              "markers":len(landmark_data),
              "warning":"Marcadores estimados por proporción. Deben colocarse sobre las articulaciones reales en Blender antes de generar el rig."}
    report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print("AUTORIG-01 PREPARE OK (not rigged): " + str(workspace))

def read_markers():
    m = {}
    for ob in bpy.context.scene.objects:
        if ob.type == "EMPTY" and ob.get("orbi_autorig_landmark") and ob.name.startswith(PREFIX):
            key = ob.get("orbi_autorig_landmark")
            require(key not in m, "Marcador duplicado: " + key)
            m[key] = ob.matrix_world.translation.copy()
    wanted = {item for _, a, b, _ in BODY_BONES for item in (a,b)}
    require(set(m) >= wanted, "Faltan marcadores: " + ", ".join(sorted(wanted-set(m))))
    return m

def marker_geometry_check(m, bounds):
    mins,maxs = bounds
    height=(maxs-mins).z
    for name,p in m.items():
        require(all(math.isfinite(v) for v in p), "Marcador no finito: "+name)
        require(mins.x-height*.20 <= p.x <= maxs.x+height*.20 and
                mins.z-height*.03 <= p.z <= maxs.z+height*.08,
                "Marcador fuera del personaje: "+name)
    for a,b in (("headTop","head"),("head","neck"),("neck","chest"),
                ("chest","spine"),("spine","pelvis"),
                ("leftHip","leftKnee"),("leftKnee","leftAnkle"),
                ("rightHip","rightKnee"),("rightKnee","rightAnkle")):
        require(m[a].z > m[b].z + height*.006,
                "Marcadores invertidos o demasiado juntos: "+a+" / "+b)
    for side,sign in (("left",-1),("right",1)):
        for role in ("Shoulder","Elbow","Wrist","Hand"):
            require((m[side+role].x - m["pelvis"].x)*sign > height*.012,
                    "El marcador "+side+role+" está en el lado incorrecto de la pelvis.")
        chain=[side+"Shoulder",side+"Elbow",side+"Wrist",side+"Hand"]
        require(all((m[chain[i+1]].x-m[chain[i]].x)*sign > height*.012
                    for i in range(len(chain)-1)),
                "El brazo "+side+" no tiene el orden lateral de una T-Pose.")
        require(max(m[k].z for k in chain)-min(m[k].z for k in chain) < height*.14,
                "El brazo "+side+" no está suficientemente horizontal: ajusta a T-Pose.")
    for name,head,tail,parent in BODY_BONES:
        require((m[tail]-m[head]).length > height*.009,
                "Hueso de longitud casi nula: "+name)

def rig_from_markers(m):
    arm_data = bpy.data.armatures.new("ORBI_Humanoid19_ArmatureData")
    arm = bpy.data.objects.new("ORBI_Humanoid19", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True);set_active(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for name,head,tail,parent in BODY_BONES:
        bone=arm_data.edit_bones.new(name)
        bone.head=m[head]
        bone.tail=m[tail]
        bone.use_deform=True
        edit[name]=bone
    for name,head,tail,parent in BODY_BONES:
        if parent:
            edit[name].parent=edit[parent]
            # Connections are not forced; shoulder and hips may not touch
            # and forcing connect would silently change supplied landmarks.
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm

def apply_auto_skin(mesh_objects, arm):
    for obj in mesh_objects:
        require(obj.parent is None or obj.parent.type != "ARMATURE",
                "El personaje ya tiene un esqueleto: "+obj.name)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True);arm.select_set(True);set_active(arm)
        result=bpy.ops.object.parent_set(type="ARMATURE_AUTO",keep_transform=True)
        require("FINISHED" in result, "Blender rechazó el skinning automático: "+obj.name)
    bpy.context.view_layer.update()

def weight_audit(mesh_objects, arm):
    names={b.name for b in arm.data.bones}
    report={}
    for mesh in mesh_objects:
        require(any(mod.type=="ARMATURE" and mod.object==arm for mod in mesh.modifiers),
                "Malla sin modificador Armature: "+mesh.name)
        groups={g.index:g.name for g in mesh.vertex_groups}
        weighted=0
        for v in mesh.data.vertices:
            total=sum(item.weight for item in v.groups if groups.get(item.group) in names)
            if total > .00001:
                weighted+=1
        count=len(mesh.data.vertices)
        ratio=weighted/max(count,1)
        report[mesh.name]={"vertices":count,"weighted":weighted,
                            "coverage":round(ratio,6)}
        require(ratio >= .995,
                "%s: solo %.2f%% de vértices con peso corporal; bloqueado."
                %(mesh.name,ratio*100))
    return report

def compare_audits(before, after, expected_bones, label):
    require(before["meshCount"]==after["meshCount"],
            label+": cambió la cantidad de mallas.")
    require(after["armatureBones"]==expected_bones,
            label+": perdió huesos del humanoide.")
    require(after["skinnedMeshes"]==before["meshCount"],
            label+": no todas las mallas quedaron skinned.")
    # glTF/FBX can split UV seam vertices, so comparing raw vertex counts
    # exactly would produce false positives. Compare bounds and mesh count.
    pmin,pmax=before["boundsMin"],before["boundsMax"]
    qmin,qmax=after["boundsMin"],after["boundsMax"]
    height=max(pmax[2]-pmin[2], 0.001)
    max_delta=max(abs(v-w) for v,w in zip(pmin+pmax,qmin+qmax))
    require(max_delta <= height*.012,
            label+": diferencia espacial %.5f sobre altura %.5f."%(max_delta,height))
    return {"label":label,"maxBoundsDelta":round(max_delta,7),
            "meshCount":after["meshCount"],"bones":after["armatureBones"]}

def loaded_audit():
    mm=meshes()
    require(mm,"La exportación reimportada no contiene mallas.")
    info=inventory(mm)
    arms=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    info["armatureBones"]=sum(len(a.data.bones) for a in arms)
    info["skinnedMeshes"]=sum(any(mod.type=="ARMATURE" for mod in ob.modifiers)
                              for ob in mm)
    return info

def clear_and_import(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    if path.suffix.lower()==".glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        bpy.ops.import_scene.fbx(filepath=str(path),use_anim=False)
    bpy.context.view_layer.update()

def rig(workspace, out):
    require(workspace and workspace.is_file() and workspace.suffix.lower()==".blend",
            "El workspace .blend editado no existe.")
    folder=out
    paths={name:folder/name for name in (
        "ORBI_AUTORIG_RIGGED.blend","ORBI_AUTORIG_RIGGED.glb",
        "ORBI_AUTORIG_RIGGED.fbx","ORBI_AUTORIG_AUDIT.json")}
    require_output_paths(folder,paths.keys())
    bpy.ops.wm.open_mainfile(filepath=str(workspace))
    scene=bpy.context.scene
    require(scene.get("orbi_autorig_stage")=="MARKERS_PENDING_USER_REVIEW",
            "El proyecto no es el workspace preparado por AUTORIG-01.")
    source=Path(scene["orbi_autorig_source"])
    require(source.is_file(),"La fuente original ya no existe.")
    source_hash=sha256(source)
    require(source_hash==scene["orbi_autorig_sha256"],
            "Cambió el hash del GLB original: cancelar para evitar mezclar versiones.")
    mesh_objects,mins,maxs=origin_inventory()
    before=inventory(mesh_objects)
    m=read_markers()
    marker_geometry_check(m,(mins,maxs))
    arm=rig_from_markers(m)
    apply_auto_skin(mesh_objects,arm)
    weights=weight_audit(mesh_objects,arm)
    bpy.context.view_layer.update()
    after=inventory(mesh_objects)
    # Check that automatic parenting did not move/sculpt source geometry.
    base={"boundsMin":before["boundsMin"],"boundsMax":before["boundsMax"],
          "meshCount":before["meshCount"]}
    after_loaded={**after,"armatureBones":len(arm.data.bones),
                  "skinnedMeshes":len(mesh_objects)}
    compare_audits(base,after_loaded,len(BODY_BONES),"Skinning")
    require(before["polygons"]==after["polygons"] and
            before["shapeKeys"]==after["shapeKeys"],
            "Skinning cambió la topología o las shape keys.")
    # Markers excluded from exported assets. Do NOT remove them from editable master.
    scene["orbi_autorig_stage"]="RIGGED_CANDIDATE"
    temp={name:folder/(name+".AUTORIG_UNVERIFIED") for name in paths}
    # Blender's exporters need the expected file extension to pick format.
    t_blend=folder/"ORBI_AUTORIG_RIGGED_UNVERIFIED.blend"
    t_glb=folder/"ORBI_AUTORIG_RIGGED_UNVERIFIED.glb"
    t_fbx=folder/"ORBI_AUTORIG_RIGGED_UNVERIFIED.fbx"
    try:
        bpy.ops.wm.save_as_mainfile(filepath=str(t_blend))
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        for mesh in mesh_objects: mesh.select_set(True)
        set_active(arm)
        bpy.ops.export_scene.gltf(filepath=str(t_glb),export_format="GLB",
                                  use_selection=True,export_animations=False,
                                  export_skins=True)
        bpy.ops.export_scene.fbx(filepath=str(t_fbx),use_selection=True,
                                 add_leaf_bones=False,bake_anim=False,
                                 path_mode="COPY",embed_textures=True)
        exports=[]
        for path in (t_glb,t_fbx):
            require(path.is_file() and path.stat().st_size>4096,
                    "El exportador no produjo contenido válido: "+str(path))
            clear_and_import(path)
            check=loaded_audit()
            exports.append(compare_audits(base,check,len(BODY_BONES),path.suffix[1:].upper()))
        require(sha256(source)==source_hash,"El archivo fuente cambió durante la operación.")
        for temp_path in (t_blend,t_glb,t_fbx):
            target=folder/temp_path.name.replace("_UNVERIFIED","")
            require(not target.exists(),"Existe ya la salida: "+str(target))
            os.replace(temp_path,target)
        payload={"status":"CANDIDATE_REQUIRES_VISUAL_QA",
                 "source":str(source),"sourceSha256":source_hash,
                 "workspace":str(workspace),"rigBoneCount":len(BODY_BONES),
                 "weights":weights,"before":before,"after":after,
                 "roundTrips":exports,
                 "warnings":[
                     "Los pesos automáticos deben revisarse visualmente (hombros, codos, cadera, rodillas, rostro).",
                     "El esqueleto de 19 huesos no posee dedos ni rig facial.",
                     "No se ha certificado compatibilidad con Mixamo ni retargeting." ]}
        paths["ORBI_AUTORIG_AUDIT.json"].write_text(
            json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
        print("AUTORIG-01 RIG SUCCESS (visual QA still required): "+str(out))
    except Exception:
        for temp_path in (t_blend,t_glb,t_fbx):
            try: temp_path.unlink(missing_ok=True)
            except OSError: pass
        raise

def main():
    a=args()
    out=Path(a.output_dir).expanduser().resolve()
    audit=out/("AUTORIG_PREPARE_FAILURE.json" if a.mode=="prepare" else "ORBI_AUTORIG_FAILURE.json")
    try:
        if a.mode=="prepare":
            prepare(Path(a.input).expanduser().resolve() if a.input else None,out)
        else:
            rig(Path(a.workspace).expanduser().resolve() if a.workspace else None,out)
    except Exception as e:
        out.mkdir(parents=True,exist_ok=True)
        audit.write_text(json.dumps({"status":"BLOCKED","phase":a.mode,"error":str(e)},
                                    ensure_ascii=False,indent=2),encoding="utf-8")
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
