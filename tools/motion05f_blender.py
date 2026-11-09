"""MOTION-05F — conservative local Blender FBX route (Blender 4.x/5.x).
Never alters the input file. Output is published only after round-trip checks.
Run: blender -b -t 4 --python tools/motion05f_blender.py -- --input path.fbx --output path.fbx
"""
import argparse
import json
import math
import os
import sys
import traceback
from collections import Counter
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

def args_parse():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--no-upright", action="store_true")
    return p.parse_args(args)

def read_fbx(path):
    import bpy
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    if not hasattr(bpy.ops, "import_scene") or not hasattr(bpy.ops.import_scene, "fbx"):
        raise RuntimeError("This Blender installation does not expose import_scene.fbx.")
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False)
    bpy.context.view_layer.update()

def snapshot():
    import bpy
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not meshes or not armatures:
        raise RuntimeError("Imported FBX has no meshes or armatures.")
    result = {}
    for m in meshes:
        if m.name in result:
            raise RuntimeError("Duplicate mesh name: " + m.name)
        result[m.name] = {
            "vertices": len(m.data.vertices),
            "polygons": len(m.data.polygons),
            "shape_keys": max(0, len(m.data.shape_keys.key_blocks) - 1) if m.data.shape_keys else 0,
            "material_slots": len(m.material_slots),
            "points": [tuple(m.matrix_world @ v.co) for v in m.data.vertices],
        }
    return {"meshes": result, "armatures": {o.name: len(o.data.bones) for o in armatures}}

def human_axis():
    import bpy
    def clean(s):
        import re
        s = re.sub(r"^(mixamorig[0-9]*|bip[0-9]*)[:_. -]*", "", s, flags=re.I)
        return re.sub("[^a-z0-9]", "", s.lower())
    hips = {"hips", "hip", "pelvis", "rootpelvis", "jhips", "jpelvis"}
    heads = {"head", "head01", "head1", "jhead", "headbone"}
    candidates = []
    for arm in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
        for h in arm.data.bones:
            if clean(h.name) not in hips:
                continue
            for head in arm.data.bones:
                if clean(head.name) not in heads:
                    continue
                parent = head.parent
                while parent and parent != h:
                    parent = parent.parent
                if parent == h:
                    start = arm.matrix_world @ h.head_local
                    end = arm.matrix_world @ head.head_local
                    if (end - start).length > 1e-6:
                        candidates.append((arm, h, head, start, end))
    if len(candidates) != 1:
        raise RuntimeError("Cannot uniquely identify connected head/pelvis bones: %d candidates. Refusing an assumed rotation." % len(candidates))
    return candidates[0]

def upright_scene():
    import bpy
    from mathutils import Quaternion
    arm, hips, head, start, end = human_axis()
    up = (end - start).normalized()
    angle = math.degrees(up.angle(Vector((0, 0, 1))))
    rotation = up.rotation_difference(Vector((0, 0, 1)))
    center = (start + end) * 0.5
    transform = Matrix.Translation(center) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-center)
    # Apply the same world transform ONLY to top-level scene objects.
    # This preserves internal armature, skin bindings and static attachments.
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    if not roots:
        raise RuntimeError("No top-level objects were found.")
    for obj in roots:
        obj.matrix_world = transform @ obj.matrix_world
    bpy.context.view_layer.update()
    return {"head": head.name, "pelvis": hips.name, "angle_before": round(angle, 4)}

def remove_animation_data():
    import bpy
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data_clear()
    for arm in bpy.data.armatures:
        if arm.animation_data:
            arm.animation_data_clear()
    for shape in bpy.data.shape_keys:
        if shape.animation_data:
            shape.animation_data_clear()
    # Setting all pose bone basis transforms to identity is NOT a safe generic
    # bind-pose restoration; this first route intentionally avoids that.
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            for bone in obj.pose.bones:
                bone.matrix_basis.identity()
    bpy.context.view_layer.update()

def coverage(a, b):
    if not a or not b:
        return 0.0
    bounds_min = [min(p[i] for p in a) for i in range(3)]
    bounds_max = [max(p[i] for p in a) for i in range(3)]
    diagonal = math.sqrt(sum((bounds_max[i] - bounds_min[i]) ** 2 for i in range(3)))
    tol = max(diagonal * .006, 1e-5)
    # Robust sample: never exceed 20000 reference points; target index full size.
    kd = KDTree(len(b))
    for i, p in enumerate(b):
        kd.insert(Vector(p), i)
    kd.balance()
    stride = max(1, len(a) // 20000)
    probes = a[::stride]
    return sum(kd.find(Vector(p))[2] <= tol for p in probes) / len(probes)

def verify(before, after):
    if before["armatures"] != after["armatures"]:
        raise RuntimeError("Bone counts/names changed during FBX round trip.")
    if set(before["meshes"]) != set(after["meshes"]):
        raise RuntimeError("Mesh names/count changed. Missing=%s Extra=%s" %
                           (sorted(set(before["meshes"]) - set(after["meshes"])),
                            sorted(set(after["meshes"]) - set(before["meshes"]))))
    report = {}
    for name, a in before["meshes"].items():
        b = after["meshes"][name]
        for field in ("vertices", "polygons", "shape_keys"):
            if a[field] != b[field]:
                raise RuntimeError("%s: %s changed %s -> %s" %
                                   (name, field, a[field], b[field]))
        forward = coverage(a["points"], b["points"])
        backward = coverage(b["points"], a["points"])
        report[name] = {"forward": round(forward, 5), "backward": round(backward, 5),
                        "vertices": a["vertices"], "polygons": a["polygons"]}
        if forward < .997 or backward < .992:
            raise RuntimeError("%s: surface coverage %.2f%% / %.2f%%; FBX rejected" %
                               (name, forward * 100, backward * 100))
    return report

def main():
    import bpy
    a = args_parse()
    source = os.path.abspath(a.input)
    target = os.path.abspath(a.output)
    if not os.path.isfile(source) or not source.lower().endswith(".fbx"):
        raise RuntimeError("Input must be an existing FBX.")
    if source.lower() == target.lower() or not target.lower().endswith(".fbx"):
        raise RuntimeError("Output must be a different FBX file.")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    temp = target + ".MOTION05F_UNVERIFIED.fbx"
    report_file = target + ".audit.json"
    if os.path.exists(temp):
        os.remove(temp)
    try:
        read_fbx(source)
        remove_animation_data()
        orientation = {"mode": "keep"} if a.no_upright else upright_scene()
        reference = snapshot()
        bpy.ops.export_scene.fbx(filepath=temp, use_selection=False, add_leaf_bones=False,
                                 bake_anim=False, path_mode="AUTO", use_mesh_modifiers=False)
        read_fbx(temp)
        verified = snapshot()
        audit = verify(reference, verified)
        # Passing geometric round-trip does not certify T/A pose or Mixamo.
        if os.path.exists(target):
            raise RuntimeError("Target already exists; refusing to overwrite: " + target)
        os.replace(temp, target)
        payload = {"status": "CANDIDATE_NOT_MIXAMO_CERTIFIED", "source": source,
                   "output": target, "orientation": orientation, "meshes": audit}
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print("MOTION-05F SUCCESS (candidate only): " + target)
    except Exception as exc:
        if os.path.exists(temp):
            os.remove(temp)
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump({"status": "BLOCKED", "error": str(exc)}, f, indent=2, ensure_ascii=False)
        raise

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
