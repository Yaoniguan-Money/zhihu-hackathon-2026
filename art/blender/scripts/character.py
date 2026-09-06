import bpy
import sys
import math
import json
import argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import studio as S
from mathutils import Vector

CONFIG={
 'shen-qingwu':dict(name='ShenQingwu',hair='624335',hairlight='825e48',coat='45656b',shirt='eee6d6',pants='456169',shoe='302927',height=1,style='bob',eye='63432c'),
 'ji-yunting':dict(name='JiYunting',hair='342d32',hairlight='504047',coat='36364f',shirt='b8a2d0',pants='3d3b54',shoe='26222b',height=1.015,style='bob_short',eye='56403b'),
 'a-lan':dict(name='Alan',hair='8c4830',hairlight='aa6242',coat='c6503d',shirt='efe4cc',pants='39373b',shoe='e7ddc8',height=.97,style='short',eye='65432c'),
 'he-xu':dict(name='HeXu',hair='b3aca4',hairlight='d6cec4',coat='605044',shirt='ede3d1',pants='504238',shoe='32251e',height=1.045,style='silver',eye='5b3d28'),
 'liu-chengyin':dict(name='LiuChengyin',hair='56334f',hairlight='80516f',coat='bd8d33',shirt='48372b',pants='554033',shoe='332620',height=.99,style='curly',eye='593648')}
parser=argparse.ArgumentParser()
parser.add_argument('--character',choices=CONFIG,default='shen-qingwu')
parser.add_argument('--phase',choices=['blockout','detail'],default='blockout')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
C=CONFIG[args.character]
DIR=S.OUT/'characters'/args.character
DIR.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
master=S.collection('CHARACTERS')
char=S.collection(C['name'],master)
S.ACTIVE=char
S.PREFIX='CHR_'+C['name']+'_'

def tag(o,bone='Head'):
    o['deform_bone']=bone
    return o

def reference_setup():
    ref=S.collection('REFERENCES_NotExported')
    for label,pos,rot in [('Front',(0,.65,1.25),(math.pi/2,0,0)),('Side',(.8,0,1.25),(math.pi/2,0,math.pi/2)),('Back',(0,-.65,1.25),(math.pi/2,0,math.pi))]:
        o=bpy.data.objects.new('REF_'+C['name']+'_'+label,None)
        ref.objects.link(o)
        o.empty_display_type='IMAGE'
        o.data=bpy.data.images.load(str(S.OUT/'references'/f'{args.character}_{label}.png'))
        o.data.pack()
        o.empty_display_size=2.62
        o.location=pos
        o.rotation_euler=rot
        o.color=(1,1,1,.35)
        o.empty_image_depth='BACK'
        o.hide_render=True
    ref.hide_viewport=True
    ref.hide_render=True
    o=bpy.data.objects.new('REF_Height_2p50m',None)
    ref.objects.link(o)
    o.empty_display_type='SINGLE_ARROW'
    o.empty_display_size=2.5
    S.save(DIR/'v001_reference.blend')

def blockout():
    skin=S.material('BLOCK_Skin','cfb8a2')
    cloth=S.material('BLOCK_Cloth',C['coat'])
    hair=S.material('BLOCK_Hair',C['hair'])
    for name,co,sc,ma in [
      ('Head',(0,0,2.065),(.405,.326,.4),skin),('Neck',(0,0,1.675),(.088,.09,.13),skin),
      ('Torso',(0,0,1.435),(.235,.145,.27),cloth),('Pelvis',(0,0,1.09),(.216,.142,.145),cloth),
      ('HairVolume',(0,.065,2.15),(.45,.35,.37),hair)]:
        S.ellipsoid('BLOCK_'+name,co,sc,ma)
    if C['style']=='curly':
        S.ellipsoid('BLOCK_CurlVolume',(0,.10,2.02),(.49,.37,.34),hair)
        cap=S.ellipsoid('BLOCK_Beret',(-.05,0,2.44),(.44,.34,.12),hair)
        cap.rotation_euler.y=-.20
    if C['style']=='short':
        for sign in [-1,1]:
            S.tube('BLOCK_HairAccent_'+str(sign),[(sign*.20,0,2.39),(sign*.36,0,2.47),(sign*.5,0,2.40)],[.1,.07,.005],hair)
    for sign,side in [(-1,'R'),(1,'L')]:
        shoulder=(sign*.22,0,1.58);elbow=(sign*.39,-.008,1.31);wrist=(sign*.47,-.018,1.08)
        S.tube('BLOCK_UpperArm_'+side,[shoulder,elbow],[.107,.081],cloth)
        S.tube('BLOCK_Forearm_'+side,[elbow,wrist],[.08,.052],cloth)
        S.ellipsoid('BLOCK_Hand_'+side,(sign*.483,-.021,1.015),(.063,.037,.089),skin)
        S.tube('BLOCK_Thigh_'+side,[(sign*.12,0,1.1),(sign*.14,0,.67)],[.113,.096],cloth)
        S.tube('BLOCK_Shin_'+side,[(sign*.14,0,.67),(sign*.155,0,.2)],[.096,.075],cloth)
        S.ellipsoid('BLOCK_Foot_'+side,(sign*.155,-.06,.095),(.094,.168,.087),hair)
    if args.character!='a-lan':
        S.lathe('BLOCK_CoatVolume',[(.68,.32,.19),(1.17,.23,.15),(1.52,.255,.17),(1.63,.20,.13)],cloth,32,start=.4,end=2*math.pi-.4)
    views=S.studio()
    S.save(DIR/'v002_blockout.blend')
    if args.phase=='blockout':
        views.pop('ThreeQuarterBack')
        S.render_views(views,S.OUT/'renders'/args.character/'blockout',16)
    return views

if args.phase=='blockout':
    reference_setup()
    views=blockout()
else:
    bpy.ops.wm.open_mainfile(filepath=str(DIR/'v002_blockout.blend'))
    char=bpy.data.collections[C['name']]
    S.ACTIVE=char
    S.PREFIX='CHR_'+C['name']+'_'
    for o in list(char.objects):
        if '_BLOCK_' in o.name:
            bpy.data.objects.remove(o,do_unlink=True)
    views={label:bpy.data.objects['CAM_'+label] for label in ['Front','ThreeQuarterFront','Side','ThreeQuarterBack','Back']}
    import details
    details.build(C,args.character,DIR,char,views)
