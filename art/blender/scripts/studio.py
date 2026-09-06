import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art/blender'
ACTIVE = None
PREFIX = ''

def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent.children if parent else bpy.context.scene.collection.children).link(c)
    return c

def place(obj, name, mat=None):
    obj.name = PREFIX + name
    if obj.data:
        obj.data.name = obj.name + '_Geometry'
    if ACTIVE:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        ACTIVE.objects.link(obj)
    if mat and obj.type == 'MESH':
        obj.data.materials.append(mat)
    return obj

def material(name, color, rough=.5, metal=0, subsurface=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    def linear(v):
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    rgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)] if isinstance(color, str) else color
    c = tuple(linear(v) for v in rgb)
    m.diffuse_color = (*c, 1)
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*c, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Subsurface Weight'].default_value = subsurface
    return m

def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def apply(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def mesh(name, verts, faces, mat=None):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    place(o, name, mat)
    return smooth(o)

def uv(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')

def ellipsoid(name, center, scale, mat, seg=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=center)
    o = place(bpy.context.object, name, mat)
    o.scale = scale
    apply(o)
    return smooth(o)

def box(name, center, size, mat, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = place(bpy.context.object, name, mat)
    o.scale = size
    apply(o)
    if bevel:
        b = o.modifiers.new('RoundedEdges', 'BEVEL')
        b.width = bevel
        b.segments = 3
        apply(o)
    return o

def tube(name, points, radii, mat, sides=12, flatten=1):
    verts, faces = [], []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        tangent = (pts[min(i+1,len(pts)-1)] - pts[max(0,i-1)]).normalized()
        reference = Vector((0, 1, 0)) if abs(tangent.y) < .9 else Vector((1, 0, 0))
        u = tangent.cross(reference).normalized()
        v = tangent.cross(u).normalized()
        radius = radii[i] if isinstance(radii, list) else radii
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            verts.append(tuple(p + radius * (u * math.cos(angle) + v * math.sin(angle) * flatten)))
    for i in range(len(pts)-1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j+1) % sides
            faces.append((a, b, b+sides, a+sides))
    faces += [tuple(reversed(range(sides))), tuple((len(pts)-1)*sides+j for j in range(sides))]
    return mesh(name, verts, faces, mat)

def curve(name, points, radius, mat, cyclic=False):
    d = bpy.data.curves.new(name, 'CURVE')
    d.dimensions = '3D'
    d.resolution_u = 3
    d.bevel_depth = radius
    d.bevel_resolution = 1
    sp = d.splines.new('BEZIER')
    sp.bezier_points.add(len(points)-1)
    for p, co in zip(sp.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
        if cyclic and len(points)==4:
            p.handle_left_type = p.handle_right_type = 'VECTOR'
    sp.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    place(o, name)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    if mat:
        o.data.materials.append(mat)
    return smooth(o)

def lathe(name, profile, mat, segments=40, center=(0,0,0), start=0, end=2*math.pi):
    vs, fs = [], []
    closed = abs(end-start-2*math.pi)<.001
    cols = segments if closed else segments+1
    for z, rx, ry in profile:
        for j in range(cols):
            a = start+(end-start)*j/segments
            vs.append((center[0]+rx*math.sin(a),center[1]-ry*math.cos(a),center[2]+z))
    for i in range(len(profile)-1):
        for j in range(segments):
            k=(j+1)%cols
            fs.append((i*cols+j,i*cols+k,(i+1)*cols+k,(i+1)*cols+j))
    return mesh(name,vs,fs,mat)

def camera(name, position, target, ortho=None, lens=55):
    d=bpy.data.cameras.new(name)
    o=bpy.data.objects.new(name,d)
    bpy.context.scene.collection.objects.link(o)
    place(o,name)
    o.location=position
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    d.lens=lens
    if ortho:
        d.type='ORTHO'
        d.ortho_scale=ortho
    return o

def area(name, position, target, energy, color, size):
    d=bpy.data.lights.new(name,'AREA')
    d.energy=energy
    d.color=color
    d.shape='DISK'
    d.size=size
    o=bpy.data.objects.new(name,d)
    bpy.context.scene.collection.objects.link(o)
    place(o,name)
    o.location=position
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

def studio():
    global ACTIVE, PREFIX
    old, oldp=ACTIVE,PREFIX
    PREFIX=''
    ACTIVE=collection('STUDIO_NotExported')
    backdrop=material('Studio_WarmGrey','c2bcb5',.85)
    box('STUDIO_Floor',(0,0,-.075),(200,200,.1),backdrop,0)
    area('STUDIO_Key',(-3,-4,5),(0,0,1.3),450,(1,.87,.76),4)
    area('STUDIO_Fill',(3,-2,3),(0,0,1.5),280,(.77,.86,1),3)
    area('STUDIO_Rim',(1,3,4),(0,0,1.6),500,(1,.82,.65),3)
    scene=bpy.context.scene
    if scene.world is None:
        scene.world=bpy.data.worlds.new('StudioWorld')
    scene.world.color=(.18,.18,.18)
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=800
    scene.render.resolution_y=1000
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'
    views={}
    for label, angle in [('Front',0),('ThreeQuarterFront',45),('Side',90),('ThreeQuarterBack',135),('Back',180)]:
        a=math.radians(angle)
        views[label]=camera('CAM_'+label,(5*math.sin(a),-5*math.cos(a),1.4),(0,0,1.28),2.95)
    scene.camera=views['ThreeQuarterFront']
    ACTIVE,PREFIX=old,oldp
    return views

def render_views(views, directory, samples=24):
    directory.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene
    scene.cycles.samples=samples
    for label, cam in views.items():
        scene.camera=cam
        scene.render.filepath=str(directory/(label+'.png'))
        bpy.ops.render.render(write_still=True)

def save(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():
        versions=[int(p.name[1:4]) for p in path.parent.glob('v[0-9][0-9][0-9]_*.blend')]
        path=path.with_name('v%03d_'%(max(versions)+1)+path.name.split('_',1)[1])
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print('SAVED_STAGE',path,flush=True)
