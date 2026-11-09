"""AUTORIG-01 distance-based fallback weights; Blender-independent geometry.

This is a conservative *candidate* generator, not production-quality skinning.
All weights are finite, normalized, nonnegative, and capped to four influences.
"""
import math

def _as_point(value):
    coords = tuple(float(v) for v in value)
    if len(coords) != 3 or not all(math.isfinite(v) for v in coords):
        raise ValueError("Point must contain exactly three finite coordinates.")
    return coords

def _distance_squared(point, start, end):
    ab = tuple(end[i] - start[i] for i in range(3))
    length_sq = sum(x*x for x in ab)
    if length_sq <= 1e-18:
        raise ValueError("Zero-length bone segment.")
    ap = tuple(point[i] - start[i] for i in range(3))
    t = max(0.0, min(1.0, sum(ap[i]*ab[i] for i in range(3))/length_sq))
    return sum((point[i] - start[i] - t*ab[i])**2 for i in range(3))

def segment_weights(point, segments, *, softness=0.025, max_influences=4):
    """Compute blend weights from segment distance in world units.

    segments: iterable of (unique_bone_name, head_xyz, tail_xyz).
    softness: >0; should scale with subject height, e.g. height*0.016.
    Bone locations must already be in the same coordinates as the vertex.
    """
    point = _as_point(point)
    if not math.isfinite(softness) or softness <= 0:
        raise ValueError("Softness must be finite and positive.")
    if not isinstance(max_influences, int) or not 1 <= max_influences <= 4:
        raise ValueError("Influence limit must be 1, 2, 3, or 4.")
    candidates = []
    names = set()
    for name, raw_start, raw_end in segments:
        if not isinstance(name, str) or not name or name in names:
            raise ValueError("Bone identifiers must be unique and nonempty.")
        names.add(name)
        d2 = _distance_squared(point,_as_point(raw_start),_as_point(raw_end))
        candidates.append((d2,name))
    if not candidates:
        raise ValueError("No bones supplied for weighting.")
    candidates.sort(key=lambda pair: (pair[0], pair[1]))
    selected = candidates[:max_influences]
    # 1 / distance^4, regularized to keep joints smooth. Rescale by the
    # closest segment to avoid numerical overflow for very small subjects.
    best = selected[0][0] + softness*softness
    raw = [(name, (best/(d2 + softness*softness))**2) for d2,name in selected]
    raw = [(name,w) for name,w in raw if w >= 0.001]
    total = sum(w for _,w in raw)
    if not math.isfinite(total) or total <= 0:
        raise ValueError("Weights could not be normalized.")
    return {name:weight/total for name,weight in raw}
