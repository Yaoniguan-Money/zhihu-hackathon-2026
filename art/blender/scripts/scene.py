import bpy
import sys
import math
import random
import json
import argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import studio as S
from mathutils import Vector

RNG = random.Random(20260906)
parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['structure', 'dressed', 'final'], default='structure')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

DIR = S.OUT / 'scene'
DIR.mkdir(parents=True, exist_ok=True)
ENV_COLLECTIONS = ['ENV_Room', 'ENV_Table', 'ENV_Chairs', 'ENV_EvidenceWall', 'ENV_Bookshelf',
                   'ENV_Window', 'ENV_Lighting', 'ENV_Props', 'ENV_Plants']
# Coplanar sheets z-fight into black patches; stagger each kind's center y by ~3mm.
SHEET_Y = {'Paper': 2.852, 'Map': 2.8495, 'Photo': 2.847, 'Note': 2.8445}
TEXT_Y = 2.8450
IMG_Y = 2.8410
REGION_Y = 2.8435
PIN_Y = 2.8360


def latest(stage):
    files = sorted(DIR.glob('v[0-9][0-9][0-9]_%s.blend' % stage))
    if not files:
        raise RuntimeError('missing staged file for ' + stage)
    return files[-1]

M = {}


def mats():
    palette = {
        'woodFloorA': ('6d4b33', .58), 'woodFloorB': ('5e3f2b', .58), 'woodDark': ('452c1d', .55),
        'woodMid': ('6e4a2f', .55), 'woodLight': ('8a6238', .55), 'wall': ('41444f', .8),
        'cork': ('b28e60', .85), 'paper': ('efe6d0', .75), 'paperWhite': ('f4eee1', .75),
        'noteYellow': ('d9b23f', .7), 'noteBlue': ('7f96ad', .7), 'photoEdge': ('f4efe4', .7),
        'photoImg': ('6a7686', .6), 'photoSepia': ('b09a7a', .6), 'stringRed': ('a33327', .6),
        'textGrey': ('55555c', .7),
        'pinRed': ('b03024', .4), 'brass': ('a98548', .35), 'brassMetal': ('b09050', .3),
        'leatherGreen': ('415c46', .5), 'leatherGM': ('54382a', .45), 'rugOuter': ('2e3a4d', .85),
        'rugInner': ('7a3436', .85), 'rugBorder': ('97794e', .85), 'curtain': ('3a4a66', .75),
        'nightSky': ('131a2c', .9), 'moon': ('e8ecf2', .4), 'city': ('1a2233', .8),
        'shadeGreen': ('2f5233', .45), 'shadeWarm': ('e0c084', .5), 'ceramic': ('e8e2d4', .3),
        'dark': ('2b2b30', .55), 'silver': ('9aa0a6', .35), 'glass': ('b8ccd8', .15),
        'mapTan': ('d8c49a', .7), 'mapGreen': ('8a9a6a', .7), 'mapBlue': ('7a8ba0', .7),
        'radio': ('4a3a30', .5), 'catBlack': ('1c1c22', .5), 'plantGreen': ('4a6b3a', .6),
        'plantDark': ('3a5530', .6), 'potClay': ('7a4a33', .6), 'kraft': ('a8895f', .7),
        'frameGold': ('8f7434', .4), 'clockFace': ('efe8d8', .4), 'manila': ('c9a86a', .7),
    }
    for k, (c, r) in palette.items():
        metal = .8 if k in ('brassMetal', 'silver') else (.6 if k == 'brass' else 0)
        M[k] = S.material('ENV_' + k, c, r, metal)
    for i, c in enumerate(['54404f', '5c6b52', '74504a', '46586a', '6a5a3f', '54423a', '3f4a44', '7a6248']):
        M['book%d' % i] = S.material('ENV_book%d' % i, c, .65)


def cyl(name, r, depth, loc, mat, verts=28, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    o = S.place(bpy.context.object, name, mat)
    o.rotation_euler = rot
    S.apply(o)
    return S.smooth(o)


def bookrow(prefix, y0, y1, z, x, depth, seed=0):
    rng = random.Random(20260906 + seed)
    y = y0
    i = 0
    while y < y1 - .06:
        bw = rng.uniform(.035, .07)
        if y + bw > y1 - .02:
            break
        bh = rng.uniform(.24, .34)
        o = S.box('%s_%02d' % (prefix, i), (x, y + bw / 2, z + bh / 2), (depth, bw, bh), M['book%d' % (i % 8)], .006)
        if rng.random() < .16:
            o.rotation_euler.x = rng.uniform(.06, .14)
        y += bw + .006
        i += 1


def sheet(name, x, z, w, h, mat, rot=0, thick=.007, y=None):
    if y is None:
        y = SHEET_Y['Paper']
    o = S.box(name, (x, y, z), (w, thick, h), mat, .002)
    o.rotation_euler.y = rot
    S.apply(o)
    return o


def textlines(prefix, x, z, w, n=3, y=TEXT_Y):
    for j in range(n):
        S.box('%s_%d' % (prefix, j), (x - w * .08, y, z + .045 - j * .026), (w * .6, .003, .007), M['textGrey'], 0)


def pin(name, pos, mat):
    return S.ellipsoid(name, pos, (.011, .011, .013), mat, 12, 8)


def curtain(name, x, ybase, zbase, w, h, mat, folds=2.6):
    nx, nz = 11, 7
    verts, faces = [], []
    for i in range(nx):
        t = i / (nx - 1)
        for j in range(nz):
            v = j / (nz - 1)
            verts.append((x + .025 * math.sin(t * math.pi * folds),
                          ybase + t * w,
                          zbase + v * h + .05 * math.sin(t * math.pi * folds * 2) * (1 - v) * .6))
    for i in range(nx - 1):
        for j in range(nz - 1):
            faces.append((i * nz + j, i * nz + j + 1, (i + 1) * nz + j + 1, (i + 1) * nz + j))
    o = S.mesh(name, verts, faces, mat)
    sol = o.modifiers.new('CurtainThickness', 'SOLIDIFY')
    sol.thickness = .015
    S.apply(o)
    return o


def plant(name, loc, scale=1.0, leaves=7):
    x0, y0, z0 = loc
    S.lathe(name + '_Pot', [(.0, .14 * scale, .14 * scale), (.06, .17 * scale, .17 * scale), (.30 * scale, .23 * scale, .23 * scale)], M['potClay'], 20, center=(x0, y0, z0))
    rng = random.Random(abs(hash(name)) % 9999)
    for j in range(leaves):
        a = math.tau * j / leaves + rng.uniform(-.2, .2)
        lean = rng.uniform(.35, .7)
        tipr = (.20 + rng.uniform(0, .14)) * scale
        tip = Vector((x0 + math.sin(a) * math.sin(lean) * tipr * 1.6, y0 + math.cos(a) * math.sin(lean) * tipr * 1.6, z0 + .30 * scale + math.cos(lean) * tipr * 2.2))
        base = Vector((x0 + math.sin(a) * .03, y0 + math.cos(a) * .03, z0 + .27 * scale))
        S.tube(name + '_Stem_%02d' % j, [tuple(base), tuple(base.lerp(tip, .5)), tuple(tip)], [.012 * scale, .008 * scale, .004], M['plantDark'], 8)
        leaf = S.ellipsoid(name + '_Leaf_%02d' % j, tuple(tip + Vector((0, 0, .02))), (.09 * scale, .055 * scale, .13 * scale), M['plantGreen'], 14, 10)
        leaf.rotation_euler = (lean * .9 * math.cos(a), lean * .9 * -math.sin(a), 0)
        S.apply(leaf)


def banker_lamp(name, loc, scale=1.0):
    x, y, z = loc
    cyl(name + '_Base', .085 * scale, .025 * scale, (x, y, z + .012 * scale), M['brassMetal'])
    cyl(name + '_Stem', .012 * scale, .24 * scale, (x, y, z + .14 * scale), M['brassMetal'])
    S.lathe(name + '_Shade', [(.02 * scale, .05 * scale, .05 * scale), (.09 * scale, .13 * scale, .13 * scale), (.16 * scale, .165 * scale, .165 * scale)], M['shadeGreen'], 22, center=(x, y, z + .24 * scale))
    S.smooth(bpy.data.objects[name + '_Shade'])


def structure():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    mats()
    env = S.collection('ENVIRONMENT')
    for name in ENV_COLLECTIONS:
        S.collection(name, env)
    room = bpy.data.collections['ENV_Room']
    chairs = bpy.data.collections['ENV_Chairs']
    S.ACTIVE = room
    # Floor: planks along X with alternating tone on a base slab.
    S.box('ENV_Floor_Base', (0, 0, -.055), (7.4, 5.8, .1), M['woodDark'], 0)
    for i in range(14):
        y = -2.8 + .4 * i + .2
        S.box('ENV_Floor_Plank_%02d' % i, (0, y, .002), (7.38, .394, .012), M['woodFloorA' if i % 2 == 0 else 'woodFloorB'], 0)
    cyl('ENV_Rug_Outer', 2.62, .014, (0, 0, .010), M['rugOuter'], 48)
    cyl('ENV_Rug_Border', 2.46, .012, (0, 0, .016), M['rugBorder'], 48)
    cyl('ENV_Rug_Field', 2.28, .012, (0, 0, .020), M['rugInner'], 48)
    cyl('ENV_Rug_Medallion', .8, .012, (0, 0, .022), M['rugOuter'], 32)
    # Walls: back, left, right with a window opening (y .55..2.6, z .95..2.7).
    S.box('ENV_Wall_Back', (0, 2.95, 1.65), (7.4, .1, 3.3), M['wall'], 0)
    S.box('ENV_Wall_Left', (-3.7, 0, 1.65), (.1, 6.0, 3.3), M['wall'], 0)
    S.box('ENV_Wall_Right_Low', (3.7, .475, .475), (.1, 5.35, .95), M['wall'], 0)
    S.box('ENV_Wall_Right_High', (3.7, .475, 3.0), (.1, 5.35, .6), M['wall'], 0)
    S.box('ENV_Wall_Right_Front', (3.7, -2.575, 1.65), (.1, .75, 3.3), M['wall'], 0)
    S.box('ENV_Wall_Right_Back', (3.7, 2.775, 1.65), (.1, .45, 3.3), M['wall'], 0)
    for name, loc, size in [('Back', (0, 2.885, .06), (7.4, .03, .12)), ('Left', (-3.635, 0, .06), (.03, 6.0, .12)), ('Right', (3.635, -2.3, .06), (.03, 2.6, .12))]:
        S.box('ENV_Baseboard_' + name, loc, size, M['woodDark'], 0)
    # Round meeting table: pedestal base like the reference.
    cyl('ENV_Table_Top', 1.5, .07, (0, 0, 1.115), M['woodMid'], 64)
    cyl('ENV_Table_Edge', 1.52, .045, (0, 0, 1.085), M['woodDark'], 64)
    cyl('ENV_Table_Pedestal', .3, .95, (0, 0, .56), M['woodDark'], 32)
    cyl('ENV_Table_Foot', .62, .09, (0, 0, .045), M['woodDark'], 32)

    def chair(prefix, a, radius=2.08, gm=False):
        x, y = radius * math.cos(a), radius * math.sin(a)
        rotz = math.atan2(-math.cos(a), math.sin(a))
        S.ACTIVE = chairs
        w, dep = (.66, .6) if gm else (.54, .5)
        seatz = .88
        cush = M['leatherGM'] if gm else M['leatherGreen']
        S.box(prefix + '_Seat', (0, 0, seatz), (w, dep, .07), M['woodMid'], .012)
        S.box(prefix + '_Cushion', (0, .005, seatz + .052), (w - .05, dep - .05, .05), cush, .02)
        backh = 2.28 if gm else 1.62
        for sign in (-1, 1):
            cyl(prefix + '_BackPost_' + ('L' if sign > 0 else 'R'), .028 if gm else .024, backh - seatz, (sign * (w / 2 - .04), dep / 2 - .035, (seatz + backh) / 2), M['woodDark'], 12)
        back = S.box(prefix + '_BackPanel', (0, dep / 2 - .03, (seatz + backh) / 2 + .06), (w - .06, .06, backh - seatz - .18), cush, .028)
        back.rotation_euler.x = .07
        if gm:
            for i in range(-1, 2):
                for j in range(-1, 2):
                    S.ellipsoid(prefix + '_Tuft_%d_%d' % (i, j), (i * .17, dep / 2 - .075, 1.72 + j * .19), (.018, .012, .016), M['woodDark'], 12, 8)
            for sign in (-1, 1):
                S.box(prefix + '_Arm_' + ('L' if sign > 0 else 'R'), (sign * (w / 2 - .03), 0, 1.13), (.05, dep - .1, .05), M['woodDark'], .012)
                cyl(prefix + '_ArmPost_' + ('L' if sign > 0 else 'R'), .022, .25, (sign * (w / 2 - .03), dep / 2 - .09, 1.005), M['woodDark'], 10)
        for ix in (-1, 1):
            for iy in (-1, 1):
                cyl(prefix + '_Leg_%d_%d' % (ix, iy), .03, seatz - .035, (ix * (w / 2 - .07), iy * (dep / 2 - .07), (seatz - .035) / 2), M['woodDark'], 12)
        return (prefix, x, y, rotz)

    placements = [chair('ENV_Chair_GM', math.pi / 2, gm=True)]
    for i, a in enumerate([math.pi * 5 / 6, math.pi * 7 / 6, math.pi * 3 / 2, math.pi * 11 / 6, math.pi / 6], 1):
        placements.append(chair('ENV_Chair_%02d' % i, a))
    for prefix, x, y, rotz in placements:
        for o in [o for o in chairs.objects if o.name.startswith(prefix + '_')]:
            o.rotation_euler.z = rotz
            o.location = (o.location.x + x, o.location.y + y, o.location.z)
    S.ACTIVE = room

    # ---- Window (right wall) ----
    S.ACTIVE = bpy.data.collections['ENV_Window']
    S.box('ENV_Window_Sill', (3.66, 1.575, .93), (.34, 2.25, .05), M['woodLight'], .008)
    S.box('ENV_Window_Frame_Top', (3.68, 1.575, 2.745), (.14, 2.25, .09), M['woodLight'], .008)
    S.box('ENV_Window_Frame_Bottom', (3.68, 1.575, .975), (.14, 2.25, .09), M['woodLight'], .008)
    S.box('ENV_Window_Frame_Left', (3.68, .59, 1.86), (.14, .08, 1.8), M['woodLight'], .008)
    S.box('ENV_Window_Frame_Right', (3.68, 2.56, 1.86), (.14, .08, 1.8), M['woodLight'], .008)
    S.box('ENV_Window_Mullion_V', (3.68, 1.575, 1.86), (.06, .05, 1.7), M['woodLight'], .006)
    S.box('ENV_Window_Mullion_H', (3.68, 1.575, 1.86), (.06, 2.1, .05), M['woodLight'], .006)
    S.box('ENV_Window_NightSky', (4.75, 1.575, 2.0), (.04, 7.5, 4.4), M['nightSky'], 0)
    cyl('ENV_Window_Moon', .30, .03, (4.6, 2.35, 2.62), M['moon'], 32, rot=(0, math.pi / 2, 0))
    for i in range(6):
        h = .5 + (i % 3) * .3
        S.box('ENV_Window_City_%02d' % i, (4.55, -.4 + i * .78, .45 + h / 2), (.06, .5, h), M['city'], 0)
    curtain('ENV_Window_Curtain_L', 3.5, .62, .95, .8, 1.85, M['curtain'])
    curtain('ENV_Window_Curtain_R', 3.5, 1.78, .95, .8, 1.85, M['curtain'])
    cyl('ENV_Window_Rod', .022, 2.5, (3.52, 1.58, 2.92), M['brassMetal'], 14, rot=(math.pi / 2, 0, 0))
    # Cat silhouette on the sill.
    S.ellipsoid('ENV_Cat_Body', (3.62, .95, 1.06), (.075, .13, .10), M['catBlack'])
    S.ellipsoid('ENV_Cat_Head', (3.62, 1.055, 1.19), (.052, .05, .055), M['catBlack'])
    for sign in (-1, 1):
        S.tube('ENV_Cat_Ear_' + ('L' if sign > 0 else 'R'), [(3.62 + sign * .02, 1.06, 1.235), (3.62 + sign * .03, 1.058, 1.27)], [.018, .004], M['catBlack'], 8)
    S.tube('ENV_Cat_Tail', [(3.62, .84, 1.0), (3.60, .78, 1.05), (3.60, .78, 1.13)], [.014, .011, .006], M['catBlack'], 8)

    # ---- Bookshelf (left wall) ----
    S.ACTIVE = bpy.data.collections['ENV_Bookshelf']
    sx = -3.42
    y0, y1 = -1.75, 1.35
    S.box('ENV_Bookshelf_Back', (sx + .21, (y0 + y1) / 2, 1.45), (.04, y1 - y0, 2.9), M['woodDark'], 0)
    for i, yy in enumerate([y0 + .03, y1 - .03]):
        S.box('ENV_Bookshelf_Side_%d' % i, (sx, yy, 1.45), (.46, .05, 2.9), M['woodMid'], .008)
    S.box('ENV_Bookshelf_Top', (sx, (y0 + y1) / 2, 2.925), (.52, y1 - y0 + .06, .06), M['woodMid'], .008)
    S.box('ENV_Bookshelf_Bottom', (sx, (y0 + y1) / 2, .04), (.46, y1 - y0, .08), M['woodMid'], 0)
    for i, z in enumerate([.52, 1.06, 1.60, 2.14]):
        S.box('ENV_Bookshelf_Shelf_%d' % i, (sx, (y0 + y1) / 2, z), (.44, y1 - y0 - .02, .035), M['woodMid'], .005)
    bookrow('ENV_Book_Shelf0', y0 + .1, y1 - .3, .08, sx, .34, seed=1)
    bookrow('ENV_Book_Shelf1', y0 + .1, y1 - .1, 1.08, sx, .34, seed=2)
    bookrow('ENV_Book_Shelf3', y0 + .3, y1 - .2, 2.16, sx, .34, seed=4)
    for j in range(3):
        S.box('ENV_Book_Stack_%d' % j, (sx, y1 - .5, 1.64 + j * .045), (.3, .22, .04), M[['woodDark', 'dark', 'kraft'][j]], .004)
    S.box('ENV_Shelf_Box_0', (sx, y0 + .35, 2.37), (.36, .5, .42), M['kraft'], .012)
    S.box('ENV_Shelf_Box_1', (sx, y0 + .95, 2.37), (.36, .42, .42), M['kraft'], .012)
    S.box('ENV_Shelf_Frame_Photo', (sx, y1 - .45, 2.30), (.05, .26, .2), M['frameGold'], .006)
    S.box('ENV_Shelf_Frame_PhotoImg', (sx + .03, y1 - .45, 2.30), (.02, .2, .14), M['photoSepia'], 0)
    # Globe on shelf 2.
    cyl('ENV_Bookshelf_Globe_Base', .09, .03, (sx, y1 - .45, 1.645), M['woodDark'], 16)
    S.ellipsoid('ENV_Bookshelf_Globe', (sx, y1 - .45, 1.83), (.16, .16, .16), M['mapTan'], 24, 16)
    S.curve('ENV_Bookshelf_Globe_Arc', [(sx, y1 - .64, 1.83), (sx, y1 - .56, 1.99), (sx, y1 - .45, 2.03), (sx, y1 - .34, 1.99), (sx, y1 - .26, 1.83)], .012, M['brassMetal'])
    # Small lit table lamp on shelf 2.
    lampy = (y0 + y1) / 2 - .35
    cyl('ENV_ShelfLamp_Base', .07, .02, (sx, lampy, 1.63), M['brass'], 16)
    cyl('ENV_ShelfLamp_Stem', .012, .22, (sx, lampy, 1.74), M['brass'], 10)
    S.lathe('ENV_ShelfLamp_Shade', [(.0, .045, .045), (.07, .10, .10), (.13, .13, .13)], M['shadeWarm'], 18, center=(sx, lampy, 1.85))

    # ---- Wall clock (back wall, left of the board) ----
    cyl('ENV_Clock_Rim', .31, .06, (-2.9, 2.87, 2.62), M['woodDark'], 36, rot=(math.pi / 2, 0, 0))
    cyl('ENV_Clock_Face', .27, .04, (-2.9, 2.83, 2.62), M['clockFace'], 36, rot=(math.pi / 2, 0, 0))
    S.box('ENV_Clock_Hand_H', (-2.83, 2.806, 2.62), (.14, .012, .018), M['dark'], 0)
    S.box('ENV_Clock_Hand_V', (-2.9, 2.806, 2.54), (.014, .012, .17), M['dark'], 0)
    cyl('ENV_Clock_Pin', .018, .012, (-2.9, 2.80, 2.62), M['brassMetal'], 10, rot=(math.pi / 2, 0, 0))

    # ---- Coat rack (left wall, front of the shelf) ----
    cx, cy = -3.05, 1.85
    cyl('ENV_CoatRack_Pole', .026, 1.9, (cx, cy, .95), M['woodDark'], 14)
    for i in range(3):
        a = math.tau * i / 3
        leg = S.box('ENV_CoatRack_Foot_%d' % i, (cx + math.sin(a) * .16, cy + math.cos(a) * .16, .05), (.05, .34, .03), M['woodDark'], .008)
        leg.rotation_euler.z = -a
    for i in range(4):
        a = math.tau * i / 4 + .4
        S.tube('ENV_CoatRack_Hook_%d' % i, [(cx + math.sin(a) * .045, cy + math.cos(a) * .045, 1.82), (cx + math.sin(a) * .12, cy + math.cos(a) * .12, 1.78), (cx + math.sin(a) * .14, cy + math.cos(a) * .14, 1.70)], [.012, .011, .009], M['woodDark'], 8)
    coat = S.box('ENV_CoatRack_Coat', (cx + .1, cy - .08, 1.38), (.3, .1, .85), M['dark'], .025)
    coat.rotation_euler.y = .12
    S.box('ENV_CoatRack_Coat2', (cx - .02, cy - .12, 1.45), (.24, .09, .7), M['leatherGM'], .02)
    cyl('ENV_CoatRack_HatBrim', .15, .02, (cx, cy, 1.9), M['woodDark'], 20)
    S.ellipsoid('ENV_CoatRack_HatTop', (cx, cy, 1.96), (.09, .09, .07), M['woodDark'])

    # ---- Drawer cabinet left of the board ----
    S.box('ENV_DrawerCab_Body', (-2.85, 2.6, .44), (.95, .5, .88), M['woodMid'], .01)
    for i in range(2):
        for j in range(2):
            S.box('ENV_DrawerCab_Front_%d_%d' % (i, j), (-2.85 - .23 + i * .46, 2.345, .24 + j * .4), (.4, .02, .34), M['woodLight'], .006)
            cyl('ENV_DrawerCab_Knob_%d_%d' % (i, j), .014, .03, (-2.85 - .23 + i * .46, 2.325, .24 + j * .4 + .12), M['brassMetal'], 10)

    # ---- Side cabinet + radio (right wall, in front of the window) ----
    S.box('ENV_SideCab_Body', (3.42, -.75, .48), (.52, 1.7, .96), M['woodMid'], .01)
    for j in (-1, 1):
        S.box('ENV_SideCab_Door_%d' % (j > 0), (3.155, -.75 + j * .42, .48), (.02, .78, .86), M['woodLight'], .008)
        cyl('ENV_SideCab_Knob_%d' % (j > 0), .015, .035, (3.135, -.75 + j * .09, .5), M['brassMetal'], 10, rot=(0, math.pi / 2, 0))
    S.box('ENV_Radio_Body', (3.42, -1.15, 1.09), (.5, .3, .22), M['radio'], .012)
    cyl('ENV_Radio_Dial', .06, .04, (3.16, -1.0, 1.09), M['kraft'], 16, rot=(0, math.pi / 2, 0))
    for j in range(4):
        S.box('ENV_Radio_Grill_%d' % j, (3.165, -1.32 + j * .09, 1.09), (.012, .07, .14), M['dark'], 0)
    for j in range(3):
        S.box('ENV_SideCab_Books_%d' % j, (3.42, -.25, 1.01 + j * .05), (.26, .3, .045), M[['woodDark', 'dark', 'kraft'][j]], .004)

    # ---- File cabinet + banker lamp (right-front corner) ----
    S.box('ENV_FileCab_Body', (3.28, -2.35, .675), (.6, .78, 1.35), M['dark'], .012)
    for j in range(3):
        S.box('ENV_FileCab_Drawer_%d' % j, (2.975, -2.35, .22 + j * .42), (.02, .66, .34), M['silver'], .006)
        S.box('ENV_FileCab_Label_%d' % j, (2.955, -2.35, .32 + j * .42), (.005, .16, .08), M['paper'], 0)
        cyl('ENV_FileCab_Knob_%d' % j, .012, .03, (2.945, -2.35, .24 + j * .42), M['brassMetal'], 10, rot=(0, math.pi / 2, 0))
    banker_lamp('ENV_BankerLamp', (3.28, -2.15, 1.35), 1.15)

    # ---- Pendant fixture over the table ----
    S.ACTIVE = bpy.data.collections['ENV_Lighting']
    cyl('ENV_Pendant_Cord', .012, 1.0, (0, 0, 3.11), M['dark'], 8)
    shade = S.lathe('ENV_Pendant_Shade', [(2.80, .10, .10), (2.74, .34, .34), (2.60, .54, .54), (2.53, .56, .56)], M['shadeGreen'], 28)
    S.smooth(shade)
    inner = S.lathe('ENV_Pendant_Shade_Inner', [(2.795, .10, .10), (2.735, .33, .33), (2.60, .50, .50)], M['shadeWarm'], 28)
    S.smooth(inner)
    cyl('ENV_Pendant_Rim', .565, .03, (0, 0, 2.53), M['brass'], 28)
    S.ellipsoid('ENV_Pendant_Bulb', (0, 0, 2.50), (.07, .07, .09), M['shadeWarm'], 16, 12)
    S.save(DIR / 'v001_structure.blend')


def dressed():
    bpy.ops.wm.open_mainfile(filepath=str(latest('structure')))
    mats()
    env = bpy.data.collections['ENVIRONMENT']
    S.ACTIVE = bpy.data.collections['ENV_EvidenceWall']
    bw, bh, bz = 4.7, 2.05, 1.88
    S.box('ENV_EvidenceBoard_Cork', (0, 2.885, bz), (bw - .3, .05, bh - .24), M['cork'], 0)
    S.box('ENV_EvidenceBoard_Frame_Top', (0, 2.885, bz + bh / 2 - .055), (bw, .08, .11), M['woodDark'], .008)
    S.box('ENV_EvidenceBoard_Frame_Bottom', (0, 2.885, bz - bh / 2 + .055), (bw, .08, .11), M['woodDark'], .008)
    S.box('ENV_EvidenceBoard_Frame_Left', (-bw / 2 + .055, 2.885, bz), (.11, .08, bh - .1), M['woodDark'], .008)
    S.box('ENV_EvidenceBoard_Frame_Right', (bw / 2 - .055, 2.885, bz), (.11, .08, bh - .1), M['woodDark'], .008)
    pins = []
    rng = random.Random(20260906)

    def place(kind, i, x, z, w, h, rot, mat, lines=0, img=False):
        sheet('EV_%s_%02d' % (kind, i), x, z, w, h, mat, rot, y=SHEET_Y[kind] + (i % 5) * .0009)
        if lines:
            textlines('EV_%s_%02d_Text' % (kind, i), x, z + h * .18, w, lines, y=TEXT_Y - (i % 4) * .0006)
        if img:
            S.box('EV_%s_%02d_Img' % (kind, i), (x, IMG_Y, z - h * .08), (w - .05, .004, h * .52), M['photoImg'] if i % 2 else M['photoSepia'], 0)
        pinpos = (x + math.sin(rot) * h * .45, PIN_Y, z + h / 2 + .012)
        pin('EV_%s_%02d_Pin' % (kind, i), pinpos, M['pinRed'] if i % 3 else M['brass'])
        pins.append(pinpos)

    paperpos = [(-1.9, 2.15), (-1.25, 2.28), (-.62, 2.05), (.05, 2.3), (.72, 2.1), (1.4, 2.25), (2.0, 2.0), (-2.0, 1.55), (-.9, 1.6), (-.15, 1.62), (.5, 1.55), (1.2, 1.7), (1.85, 1.5), (-1.55, 1.15), (-.45, 1.20), (.85, 1.12), (1.65, 1.18)]
    for i, (x, z) in enumerate(paperpos):
        place('Paper', i, x, z, .30, .4, rng.uniform(-.09, .09), M['paper'] if i % 3 else M['paperWhite'], lines=3 if i % 2 else 4)
    for i, (x, z) in enumerate([(-2.0, 2.35), (-1.0, 2.32), (.35, 1.95), (1.05, 2.35), (1.95, 2.35), (-2.0, 1.72), (.15, 1.22), (1.95, 1.15)]):
        place('Photo', i, x, z, .26, .2, rng.uniform(-.16, .16), M['photoEdge'], img=True)
    for i, (x, z) in enumerate([(-1.6, 2.55), (-.3, 2.55), (1.0, 2.55), (1.75, 2.5), (-1.2, 1.35), (.3, 1.4), (1.35, 1.35), (-2.05, 1.35), (2.05, 1.85), (-2.05, 2.5)]):
        place('Note', i, x, z, .15, .15, rng.uniform(-.3, .3), [M['noteYellow'], M['noteBlue'], M['paperWhite']][i % 3])
    for i, (x, z) in enumerate([(-.85, 2.02), (.9, 1.9)]):
        rot = rng.uniform(-.06, .06)
        sheet('EV_Map_%02d' % i, x, z, .5, .38, M['mapTan'], rot, y=SHEET_Y['Map'])
        for j in range(4):
            dx = -.14 + (j % 2) * .2
            dz = -.07 + (j // 2) * .14
            S.box('EV_Map_%02d_Region_%d' % (i, j),
                  (x + dx * math.cos(rot) + dz * math.sin(rot), REGION_Y, z - dx * math.sin(rot) + dz * math.cos(rot)),
                  (.16, .004, .1), [M['mapGreen'], M['mapBlue']][j % 2], 0)
        pin('EV_Map_%02d_Pin' % i, (x, PIN_Y, z + .2), M['pinRed'])
        pins.append((x, PIN_Y, z + .2))
    for k, (a, b) in enumerate([(0, 8), (1, 4), (2, 9), (3, 5), (6, 12), (7, 13), (10, 15), (11, 16), (8, 13), (4, 11), (9, 14), (5, 12)]):
        pa, pb = pins[a], pins[b]
        mid = tuple((Vector(pa) + Vector(pb)) / 2 + Vector((0, -.05, -.03)))
        S.curve('EV_String_%02d' % k, [pa, mid, pb], .0045, M['stringRed'])
    # ---- Table dressing ----
    S.ACTIVE = bpy.data.collections['ENV_Props']
    mapsheet = S.box('PROP_Map_Main', (0, .05, 1.155), (1.5, 1.05, .006), M['mapTan'], 0)
    mapsheet.rotation_euler.z = .12
    for j in range(5):
        reg = S.box('PROP_Map_Region_%d' % j, (-.5 + j * .26, .05 + (j % 2) * .22 - .1, 1.161), (.2, .3, .004), [M['mapGreen'], M['mapBlue']][j % 2], 0)
        reg.rotation_euler.z = .12
    for j in range(4):
        m = S.box('PROP_Map_Fold_%d' % j, (-.6 + j * .4, .05, 1.159), (.008, 1.0, .005), M['dark'], 0)
        m.rotation_euler.z = .12
    for i, (x, y) in enumerate([(-1.05, -.55), (-.6, .75), (.95, .68), (1.15, -.45)]):
        cyl('PROP_Mug_%02d_Body' % i, .052, .115, (x, y, 1.207), M['ceramic'], 18)
        S.curve('PROP_Mug_%02d_Band' % i, [(x - .053, y, 1.24), (x, y - .056, 1.24), (x + .053, y, 1.24)], .008, M['dark'])
        S.curve('PROP_Mug_%02d_Handle' % i, [(x + .048, y, 1.21), (x + .085, y, 1.23), (x + .085, y, 1.17), (x + .05, y, 1.19)], .007, M['ceramic'])
    S.box('PROP_Recorder_Body', (-.35, -.85, 1.16), (.3, .18, .065), M['dark'], .012)
    cyl('PROP_Recorder_Mic', .028, .03, (-.35, -.95, 1.20), M['silver'], 14)
    for j in range(4):
        cyl('PROP_Recorder_Button_%d' % j, .011, .012, (-.46 + j * .07, -.76, 1.196), M['pinRed'] if j == 0 else M['silver'], 10)
    S.curve('PROP_Magnifier_LensRing', [(-.62, .28, 1.2), (-.55, .38, 1.245), (-.42, .40, 1.22), (-.36, .31, 1.175), (-.42, .22, 1.16), (-.55, .2, 1.17), (-.62, .28, 1.2)], .012, M['brassMetal'])
    lens = S.ellipsoid('PROP_Magnifier_Lens', (-.495, .30, 1.166), (.105, .105, .006), M['glass'], 24, 12)
    S.tube('PROP_Magnifier_Handle', [(-.38, .19, 1.16), (-.30, .10, 1.15), (-.24, .03, 1.148)], [.014, .012, .01], M['woodDark'], 10)
    cyl('PROP_PenCup', .05, .11, (.75, -.8, 1.205), M['dark'], 14)
    for j in range(5):
        S.tube('PROP_Pen_%d' % j, [(.74 - .02 + j * .011, -.81 + (j % 2) * .02, 1.21), (.73 + j * .013, -.80 + (j % 3) * .015, 1.30)], [.005, .004], [M['pinRed'], M['noteBlue'], M['dark']][j % 3], 6)
    for i, (x, y, c) in enumerate([(.35, .95, 'noteBlue'), (1.3, .2, 'dark'), (-.95, .3, 'plantDark')]):
        nb = S.box('PROP_Notebook_%d' % i, (x, y, 1.165), (.28, .2, .03), M[c], .006)
        nb.rotation_euler.z = rng.uniform(-.4, .4)
        S.box('PROP_Notebook_%d_Strap' % i, (x, y, 1.182), (.03, .2, .006), M['dark'], 0)
    for i, (x, y) in enumerate([(-1.45, .05), (.15, -.55)]):
        fol = S.box('PROP_Folder_%d' % i, (x, y, 1.16), (.33, .25, .016), M['manila'], .005)
        rot = rng.uniform(-.5, .5)
        fol.rotation_euler.z = rot
        tape = S.box('PROP_Folder_%d_Tie' % i, (x, y, 1.17), (.34, .03, .004), M['dark'], 0)
        tape.rotation_euler.z = rot
    for i in range(4):
        p = S.box('PROP_PaperStack_%d' % i, (-.15, .55, 1.16 + i * .004), (.21, .3, .004), M['paperWhite'], 0)
        p.rotation_euler.z = .1 * i - .15
    for i, (x, y) in enumerate([(-1.6, -.7), (.5, .45)]):
        ph = S.box('PROP_TablePhoto_%d' % i, (x, y, 1.158), (.18, .13, .005), M['photoEdge'], 0)
        ph.rotation_euler.z = rng.uniform(-.3, .3)
    cyl('PROP_Tin', .05, .04, (1.6, .85, 1.17), M['silver'], 14)
    # ---- Plants ----
    S.ACTIVE = bpy.data.collections['ENV_Plants']
    plant('ENV_Plant_Floor_Right', (2.9, 2.35, .02), 1.2, leaves=8)
    plant('ENV_Plant_Cab_Small', (-2.85, 2.6, .88), .7, leaves=5)
    plant('ENV_Plant_Shelf_Trailing', (-3.42, 1.1, 2.95), .6, leaves=5)
    S.save(DIR / 'v002_dressed.blend')


def final():
    bpy.ops.wm.open_mainfile(filepath=str(latest('dressed')))
    lights = S.collection('RENDER_Lights_NotExported')
    cams = S.collection('CAMERAS_NotExported')
    S.ACTIVE = lights

    def plight(name, loc, energy, color, radius=.15):
        d = bpy.data.lights.new(name, 'POINT')
        d.energy = energy
        d.color = color
        d.shadow_soft_size = radius
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        S.place(o, name)
        o.location = loc
        return o

    plight('RL_Pendant_Warm', (0, 0, 2.38), 400, (1, .72, .45), .32)
    S.area('RL_Moon_Cool', (4.5, 1.6, 2.3), (0, 1.4, 1.2), 320, (.55, .70, 1), 2.4)
    plight('RL_Moon_Disc', (4.35, 2.2, 2.5), 30, (.8, .88, 1), .1)
    plight('RL_Banker_Green', (3.28, -2.15, 1.62), 32, (.45, 1, .6), .08)
    plight('RL_ShelfLamp_Warm', (-3.38, -.35, 1.45), 32, (1, .78, .5), .08)
    S.area('RL_Fill_Front', (0, -5.2, 3.1), (0, .5, 1.0), 100, (.75, .78, .9), 3.5)
    S.area('RL_Ambient_Top', (0, 0, 3.25), (0, 0, 0), 60, (.85, .82, .78), 5.0)
    world = bpy.data.worlds.new('ENV_World_Night')
    bpy.context.scene.world = world
    world.color = (.014, .016, .026)
    S.ACTIVE = cams
    views = {
        'FrontWide': S.camera('CAM_Scene_FrontWide', (0, -6.3, 2.6), (0, .4, 1.45), lens=42),
        'LeftThreeQuarter': S.camera('CAM_Scene_LeftThreeQuarter', (-2.95, -3.95, 2.5), (.5, .9, 1.3), lens=38),
        'RightThreeQuarter': S.camera('CAM_Scene_RightThreeQuarter', (2.95, -3.95, 2.5), (-.5, .9, 1.3), lens=38),
        'Topish': S.camera('CAM_Scene_Topish', (0, -2.4, 7.2), (0, .4, .9), lens=46),
        'TableCloseup': S.camera('CAM_Scene_TableCloseup', (2.2, -2.4, 2.1), (-.1, .1, 1.15), lens=48),
        'EvidenceWallCloseup': S.camera('CAM_Scene_EvidenceWallCloseup', (0, -1.9, 2.1), (0, 2.9, 1.95), lens=44),
    }
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    scene.camera = views['FrontWide']
    S.save(DIR / 'v003_final.blend')
    env = bpy.data.collections['ENVIRONMENT']
    export_objects = []
    for name in ENV_COLLECTIONS:
        export_objects.extend(bpy.data.collections[name].objects)
    for o in export_objects:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if o.type == 'MESH' and not o.data.uv_layers:
            S.uv(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in export_objects:
        o.select_set(True)
    path = S.OUT / 'exports' / 'detective-room.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_cameras=False, export_lights=False)
    meshes = [o for o in export_objects if o.type == 'MESH']
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    stats = {'scene': 'detective-room', 'triangles': triangles, 'meshes': len(meshes), 'collections': ENV_COLLECTIONS, 'export': str(path.relative_to(S.ROOT)), 'uv_complete': all(bool(o.data.uv_layers) for o in meshes), 'status': 'awaiting_visual_QA'}
    (DIR / 'metrics.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    print('SCENE_METRICS', json.dumps({k: v for k, v in stats.items() if k != 'collections'}), flush=True)
    S.render_views(views, S.OUT / 'renders' / 'detective-room', 48)


if args.phase == 'structure':
    structure()
elif args.phase == 'dressed':
    dressed()
else:
    final()
