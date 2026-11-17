"""Convert downloaded LOTR sculpts (OBJ/STL) into game-ready GLB enemies.

Those sculpts are untextured, arbitrary scale, sometimes on a print base, and
100k-300k tris. Each becomes: Y-up, metres, decimated, vertex-coloured, one
flat GLB with the print base stripped.
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.smoothing import filter_laplacian
from fast_simplification import simplify

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "glb"
OUT.mkdir(exist_ok=True)

# name: (file, target height m, target tris, base colour, cavity colour, seed, part)
JOBS = {
    "orc": ("OrcMesh.obj", 1.85, 5200, (0x6b, 0x6f, 0x52), (0x26, 0x28, 0x22), 1, 0),
    "uruk_soldier": ("Uruck_Hai_1.stl", 1.98, 5200, (0x6a, 0x60, 0x50), (0x22, 0x20, 0x1c), 11),
    "uruk_berserker": ("Uruck_Hai_Beserker.stl", 1.95, 5200, (0x6d, 0x58, 0x46), (0x24, 0x1c, 0x16), 12),
    "uruk_archer": ("Uruck_Hai_Crossbow.stl", 1.96, 5200, (0x68, 0x5f, 0x4f), (0x21, 0x1f, 0x1b), 13),
    "uruk_bare": ("Uruck_Hai_No_Mask.stl", 1.97, 5000, (0x6c, 0x66, 0x54), (0x24, 0x22, 0x1c), 14),
    "ram_head": ("battering_uruks.stl", 0.85, 4000, (0x5c, 0x55, 0x48), (0x20, 0x1e, 0x1a), 2, 1, "y"),
    "troll": ("TrollMesh.obj", 3.60, 9000, (0x6a, 0x6a, 0x66), (0x22, 0x22, 0x24), 3, 0),
    "cave_troll": ("Troll1.stl", 4.20, 12000, (0x71, 0x6b, 0x63), (0x20, 0x1e, 0x1c), 4, 0, "y", "noflip"),
    "war_troll": ("Troll2.stl", 4.60, 14000, (0x5e, 0x5b, 0x55), (0x1e, 0x1c, 0x1a), 6, 0),
    "ram_crew": ("battering_uruks.stl", 3.6, 20000, (0x66, 0x5e, 0x4e), (0x22, 0x20, 0x1a), 7, -1, "y"),
    "ringwraith": ("Nazgul-9.stl", 2.10, 7000, (0x2b, 0x2b, 0x30), (0x10, 0x10, 0x13), 5, 0),
}


def load(path: Path) -> trimesh.Trimesh:
    mesh = trimesh.load(path, force="mesh", process=True)
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(list(mesh.geometry.values()))
    return mesh


def stand_up(mesh: trimesh.Trimesh, force_up: str = '', flip_cfg: str = '') -> trimesh.Trimesh:
    """Orient so the model stands: smallest footprint for the up axis, then the
    flip whose top is narrower than its feet (heads are small, stances are wide)."""
    ext = mesh.extents
    if force_up:
        up = 'xyz'.index(force_up)
        if up == 0:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.radians(-90), [0, 0, 1]))
        elif up == 2:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.radians(90), [1, 0, 0]))
    else:
        best, best_area = None, None
        for axis in range(3):
            m = mesh.copy()
            if axis == 0:
                m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(-90), [0, 0, 1]))
            elif axis == 2:
                m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(90), [1, 0, 0]))
            area = m.extents[0] * m.extents[2]
            if best_area is None or area < best_area:
                best, best_area = m, area
        mesh = best

    # resolve the up/down flip: the end with the wider spread of geometry is the feet
    v = mesh.vertices
    lo, hi = v[:, 1].min(), v[:, 1].max()
    band = 0.12 * (hi - lo)
    top = v[v[:, 1] > hi - band]
    bot = v[v[:, 1] < lo + band]
    def spread(p):
        if len(p) <= 8:
            return 0.0
        return float(np.ptp(p[:, 0]) * np.ptp(p[:, 2]))
    apply_flip = flip_cfg == 'flip' or (flip_cfg == '' and spread(top) > spread(bot))
    if apply_flip:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.radians(180), [1, 0, 0]))
    return mesh


def strip_base(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Drop print plinths and backdrop cards: flat slabs that are not the body."""
    parts = mesh.split(only_watertight=False)
    if len(parts) < 2:
        return mesh
    total_h = mesh.extents[1]
    foot = max(mesh.extents[0], mesh.extents[2])
    lo = mesh.bounds[0][1]
    keep = []
    for p in parts:
        e = p.extents
        thin = min(e) < 0.2 * max(e)                      # a sheet, not a limb
        huge = max(e) > 0.7 * total_h
        low = (p.centroid[1] - lo) < 0.25 * total_h
        wide = max(e[0], e[2]) > 0.55 * foot
        if thin and huge:
            continue                                       # backdrop card
        if thin and wide and low:
            continue                                       # plinth
        keep.append(p)
    if not keep:
        return mesh
    return trimesh.util.concatenate(keep)


def cavity(mesh: trimesh.Trimesh) -> np.ndarray:
    """0 = flat, 1 = deep recess, from normal vs smoothed normal."""
    n = mesh.vertex_normals
    smooth = mesh.copy()
    filter_laplacian(smooth, lamb=0.6, iterations=12)
    sn = smooth.vertex_normals
    d = np.clip(1.0 - np.einsum("ij,ij->i", n, sn), 0, 1)
    d = np.power(d, 0.55)
    lo, hi = np.percentile(d, [3, 97])
    return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)


def build(name: str, cfg) -> dict:
    fname, height, tris, base, cave, seed = cfg[:6]
    part = cfg[6] if len(cfg) > 6 else 0
    force_up = cfg[7] if len(cfg) > 7 else ""
    flip_cfg = cfg[8] if len(cfg) > 8 else ""
    rng = np.random.default_rng(seed)

    mesh = load(RAW / fname)
    if part > 0:
        parts = sorted(mesh.split(only_watertight=False), key=lambda p: -len(p.faces))
        mesh = parts[part]
    mesh = stand_up(mesh, force_up, flip_cfg)
    mesh = strip_base(mesh)
    mesh.apply_translation([-mesh.centroid[0], -mesh.bounds[0][1], -mesh.centroid[2]])
    mesh.apply_scale(height / mesh.extents[1])

    if len(mesh.faces) > tris:
        v, f = simplify(mesh.vertices, mesh.faces, target_count=tris, agg=6)
        mesh = trimesh.Trimesh(v, f, process=False)
        trimesh.smoothing.filter_humphrey(mesh, alpha=0.1, beta=0.5, iterations=2)
        mesh.fix_normals()

    c = cavity(mesh)
    base = np.array(base, dtype=float) / 255.0
    cave = np.array(cave, dtype=float) / 255.0
    tint = base[None, :] * (1 - c[:, None]) + cave[None, :] * c[:, None]
    grain = 1.0 + rng.normal(0, 0.045, (len(mesh.vertices), 1))
    rgb = np.clip(tint * grain, 0, 1)
    rgba = np.hstack([rgb, np.ones((len(mesh.vertices), 1))])
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=rgba)

    out = OUT / f"{name}.glb"
    out.write_bytes(mesh.export(file_type="glb"))
    return {
        "name": name,
        "source": fname,
        "tris": int(len(mesh.faces)),
        "height_m": round(float(mesh.extents[1]), 2),
        "bytes": out.stat().st_size,
    }


if __name__ == "__main__":
    only = sys.argv[1:]
    rows = [build(n, c) for n, c in JOBS.items() if not only or n in only]
    print(json.dumps(rows, indent=1))
