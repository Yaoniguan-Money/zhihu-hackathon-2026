import bpy
import math
import json
from mathutils import Vector
import studio as S

def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def add_track(owner,action,label,length):
    track=owner.animation_data.nla_tracks.new()
    track.name=label
    strip=track.strips.new(label,1,action)
    strip.frame_end=length
    strip.blend_type='REPLACE'
    strip.extrapolation='NOTHING'
    owner.animation_data.action=None

def finish(C,slug,directory,char,lids,mouths):
    scale=C['height']
    # Group pieces that share one rigid attachment. Clothing and removable props stay separate.
    def join_group(objects,name):
        if len(objects)<2:return
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        bpy.context.object.name='CHR_'+C['name']+'_'+name
    for marker,label in [('Hair_BackClump','Hair_Back'),('Hair_FrontBang','Hair_Bangs'),('Hair_SideLock','Hair_Sides'),('Hair_Accent','Hair_Accents'),('Notebook_Spiral','Notebook_SpiralBinding'),('Beard_Clump','Beard')]:
        join_group([o for o in char.objects if o.type=='MESH' and marker in o.name],label)
    for side in ['L','R']:
        join_group([o for o in char.objects if o.type=='MESH' and ('Hand_Palm_'+side in o.name or 'Hand_Finger_'+side in o.name or 'Hand_Thumb_'+side in o.name)],'Hand_'+side)
    meshes=[o for o in char.objects if o.type=='MESH']
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        o.scale=(scale,scale,scale)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        if not o.data.uv_layers:S.uv(o)
    arm=bpy.data.armatures.new(C['name']+'_Skeleton')
    rig=bpy.data.objects.new('CHR_'+C['name']+'_Rig',arm)
    char.objects.link(rig)
    rig.show_in_front=True
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(n,h,t,parent=None):
        b=arm.edit_bones.new(n);b.head=Vector(h)*scale;b.tail=Vector(t)*scale
        if parent:b.parent=arm.edit_bones[parent]
        return b
    bone('Root',(0,0,0),(0,0,.16))
    bone('Pelvis',(0,0,1.06),(0,0,1.20),'Root')
    bone('Spine_01',(0,0,1.20),(0,0,1.36),'Pelvis')
    bone('Spine_02',(0,0,1.36),(0,0,1.49),'Spine_01')
    bone('Chest',(0,0,1.49),(0,0,1.62),'Spine_02')
    bone('Neck',(0,0,1.62),(0,0,1.78),'Chest')
    bone('Head',(0,0,1.78),(0,0,2.25),'Neck')
    bone('Jaw',(0,-.04,1.99),(0,-.23,1.91),'Head')
    for sign,side in [(-1,'R'),(1,'L')]:
        bone('Clavicle_'+side,(sign*.035,0,1.565),(sign*.225,0,1.565),'Chest')
        bone('UpperArm_'+side,(sign*.225,0,1.565),(sign*.36,-.013,1.34),'Clavicle_'+side)
        bone('ForeArm_'+side,(sign*.36,-.013,1.34),(sign*.42,-.065,1.135),'UpperArm_'+side)
        bone('Hand_'+side,(sign*.42,-.065,1.135),(sign*.455,-.09,1.02),'ForeArm_'+side)
        bone('UpperLeg_'+side,(sign*.115,0,1.1),(sign*.145,0,.67),'Pelvis')
        bone('LowerLeg_'+side,(sign*.145,0,.67),(sign*.155,0,.20),'UpperLeg_'+side)
        bone('Foot_'+side,(sign*.155,0,.20),(sign*.155,-.17,.08),'LowerLeg_'+side)
        bone('Eye_'+side,(sign*.163,-.218,2.025),(sign*.163,-.34,2.025),'Head')
        bone('Coat_'+side,(sign*.14,0,1.19),(sign*.21,0,.76),'Pelvis')
        bone('Scarf_'+side,(sign*.13,-.16,1.60),(sign*.18,-.20,1.02),'Chest')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:
        mode=o.get('weight_mode','')
        base=o.get('deform_bone','Head')
        groups={}
        def weight(index,name,value):
            if value<.00001:return
            if name not in groups:groups[name]=o.vertex_groups.new(name=name)
            groups[name].add([index],value,'REPLACE')
        for v in o.data.vertices:
            x,y,z=v.co/scale
            weights={base:1}
            if mode.startswith('arm_'):
                side=mode[-1];w=smoothstep(1.27,1.40,z)
                weights={'ForeArm_'+side:1-w,'UpperArm_'+side:w}
            elif mode.startswith('leg_'):
                side=mode[-1];w=smoothstep(.60,.75,z)
                weights={'LowerLeg_'+side:1-w,'UpperLeg_'+side:w}
            elif mode in ['torso','coat']:
                if z<1.23:
                    w=smoothstep(1.12,1.25,z)
                    low=('Coat_'+('L' if x>=0 else 'R')) if mode=='coat' else 'Pelvis'
                    weights={low:1-w,'Spine_01':w}
                elif z<1.40:
                    w=smoothstep(1.25,1.40,z);weights={'Spine_01':1-w,'Spine_02':w}
                else:
                    w=smoothstep(1.40,1.54,z);weights={'Spine_02':1-w,'Chest':w}
            for name,value in weights.items():weight(v.index,name,value)
        mod=o.modifiers.new('CharacterSkin','ARMATURE');mod.object=rig
        o.parent=rig
        o['asset_role']='character_geometry'
    for p in rig.pose.bones:p.rotation_mode='XYZ'
    actions=[('Idle',73),('Blink',25),('HeadTurn',61),('TalkMouth',49),('Nod',37),('ShakeHead',49),('GestureLean',49),('GestureShrug',37),('GestureHand',49)]
    for label,length in actions:
        rig.animation_data_create()
        action=bpy.data.actions.new(C['name']+'_'+label)
        rig.animation_data.action=action
        for f in [1,1+(length-1)//4,1+(length-1)//2,1+3*(length-1)//4,length]:
            t=(f-1)/(length-1);wave=math.sin(t*math.tau)
            for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
            if label=='Idle':
                rig.pose.bones['Chest'].rotation_euler.x=.012*wave
                rig.pose.bones['Neck'].rotation_euler.z=.015*wave
            elif label=='HeadTurn':
                rig.pose.bones['Head'].rotation_euler.y=.34*wave
                for side in ['L','R']:rig.pose.bones['Eye_'+side].rotation_euler.z=.16*wave
            elif label=='Nod':rig.pose.bones['Head'].rotation_euler.x=.18*wave
            elif label=='ShakeHead':rig.pose.bones['Head'].rotation_euler.y=.23*wave
            elif label=='TalkMouth':rig.pose.bones['Head'].rotation_euler.x=.018*wave
            elif label=='GestureLean':
                rig.pose.bones['Spine_01'].rotation_euler.x=.08*math.sin(t*math.pi)
                rig.pose.bones['Spine_02'].rotation_euler.x=.09*math.sin(t*math.pi)
                rig.pose.bones['Head'].rotation_euler.z=.09*math.sin(t*math.pi)
            elif label=='GestureShrug':
                for side,sign in [('L',1),('R',-1)]:rig.pose.bones['Clavicle_'+side].rotation_euler.z=sign*.12*math.sin(t*math.pi)
            elif label=='GestureHand':
                rig.pose.bones['UpperArm_R'].rotation_euler.x=-.35*math.sin(t*math.pi)
                rig.pose.bones['ForeArm_R'].rotation_euler.x=-.60*math.sin(t*math.pi)
            for p in rig.pose.bones:p.keyframe_insert(data_path='rotation_euler',frame=f,group=p.name)
        add_track(rig,action,label,length)
    for o in lids+mouths:
        keyname='Blink' if o in lids else 'MouthOpen'
        label='Blink' if o in lids else 'TalkMouth'
        length=25 if o in lids else 49
        keys=o.data.shape_keys
        keys.animation_data_create();action=bpy.data.actions.new(o.name+'_'+label);keys.animation_data.action=action
        frames=[(1,0),(9,0),(12,1),(14,1),(18,0),(25,0)] if o in lids else [(1,0),(7,.8),(13,.15),(19,1),(25,.1),(31,.7),(37,.15),(43,.9),(49,0)]
        for f,value in frames:
            keys.key_blocks[keyname].value=value
            keys.key_blocks[keyname].keyframe_insert(data_path='value',frame=f)
        add_track(keys,action,label,length)
        keys.key_blocks[keyname].value=0
    # Keep the project in a neutral rest presentation. Export evaluates each NLA track independently.
    for p in rig.pose.bones:p.rotation_euler=(0,0,0)
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.fps=24
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes+[rig]:o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    path=S.OUT/'exports'/f'{slug}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',export_skins=True,export_morph=True,export_morph_animation=True,export_cameras=False,export_lights=False,export_extras=True,export_force_sampling=True)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    height=max(v.co.z for o in meshes for v in o.data.vertices)-min(v.co.z for o in meshes for v in o.data.vertices)
    stats={'character':C['name'],'triangles':triangles,'meshes':len(meshes),'bones':list(arm.bones.keys()),'animation_clips':[a[0] for a in actions],'shape_keys':{o.name:[k.name for k in o.data.shape_keys.key_blocks] for o in lids+mouths},'export':str(path.relative_to(S.ROOT)),'height_m':height,'uv_complete':all(bool(o.data.uv_layers) for o in meshes),'status':'awaiting_visual_QA'}
    (directory/'metrics.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
    print('CHARACTER_METRICS',json.dumps({k:v for k,v in stats.items() if k not in ['shape_keys','bones']}),flush=True)
