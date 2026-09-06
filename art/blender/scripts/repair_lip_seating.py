import bpy
import sys
import math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import studio as S
slug=sys.argv[sys.argv.index('--')+1]
directory=S.OUT/'characters'/slug
bpy.ops.wm.open_mainfile(filepath=str(sorted(directory.glob('v*_rigged.blend'))[-1]))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
char=rig.users_collection[0]
scale=1.015 if slug=='ji-yunting' else 1
for o in char.objects:
    if '--animation-only' not in sys.argv and o.name.endswith(('_Lips','_MouthCavity')):
        for key in o.data.shape_keys.key_blocks:
            for v in key.data:v.co.y+=.027*scale
head=rig.pose.bones['Head']
for label,length,amplitude,axis in [('HeadTurn',61,.34,1),('ShakeHead',49,.23,1),('GestureLean',49,.09,2)]:
    track=next(t for t in rig.animation_data.nla_tracks if t.name==label)
    rig.animation_data.action=track.strips[0].action
    for f in [1,1+(length-1)//4,1+(length-1)//2,1+3*(length-1)//4,length]:
        t=(f-1)/(length-1)
        head.rotation_euler=(0,0,0)
        head.rotation_euler[axis]=amplitude*math.sin(t*(math.pi if label=='GestureLean' else math.tau))
        head.keyframe_insert(data_path='rotation_euler',frame=f,group='Head')
    rig.animation_data.action=None
head.rotation_euler=(0,0,0)
bpy.ops.object.select_all(action='DESELECT')
for o in char.objects:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.scene.frame_set(1)
bpy.ops.export_scene.gltf(filepath=str(S.OUT/'exports'/f'{slug}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_skins=True,export_morph=True,export_morph_animation=True,export_cameras=False,export_lights=False,export_extras=True,export_force_sampling=True)
S.save(directory/'v007_rigged.blend')
views={label:bpy.data.objects['CAM_'+label] for label in ['Front','ThreeQuarterFront','Side','ThreeQuarterBack','Back']}
if '--animation-only' not in sys.argv:S.render_views(views,S.OUT/'renders'/slug/'final',32)
