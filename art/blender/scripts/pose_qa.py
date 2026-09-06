import bpy
import sys
import json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import studio as S
slug=sys.argv[sys.argv.index('--')+1]
directory=S.OUT/'characters'/slug
files=sorted(directory.glob('v*_rigged.blend'))
bpy.ops.wm.open_mainfile(filepath=str(files[-1]))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
owners=[rig]+[o.data.shape_keys for o in bpy.data.objects if o.type=='MESH' and o.data.shape_keys]
S.ACTIVE=bpy.data.collections['STUDIO_NotExported'];S.PREFIX=''
cam=S.camera('CAM_PoseFace',(0,-5,2.05),(0,0,2.02),1.2)
scene=bpy.context.scene;scene.render.resolution_x=700;scene.render.resolution_y=700;scene.cycles.samples=24
report=[]
for label,frame in [('Blink',12),('TalkMouth',19),('HeadTurn',16),('GestureHand',25),('GestureLean',25),('GestureShrug',19)]:
    for owner in owners:
        if isinstance(owner,bpy.types.Key):
            for key in owner.key_blocks:key.value=0
        if owner.animation_data:
            for track in owner.animation_data.nla_tracks:track.mute=track.name!=label
    scene.frame_set(frame)
    view=cam if label in ['Blink','TalkMouth','HeadTurn'] else bpy.data.objects['CAM_ThreeQuarterFront']
    S.render_views({label:view},S.OUT/'renders'/slug/'poses',24)
    report.append({'clip':label,'frame':frame,'evaluated':True})
(directory/'pose-qa.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('POSE_QA_RENDERED',slug)
