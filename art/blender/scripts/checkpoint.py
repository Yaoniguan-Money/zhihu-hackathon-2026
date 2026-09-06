from pathlib import Path
from PIL import Image
import argparse
import hashlib
import json

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'art/blender'
parser=argparse.ArgumentParser();parser.add_argument('slug');parser.add_argument('--note',required=True);args=parser.parse_args()
slug=args.slug
metrics=json.loads((OUT/f'characters/{slug}/metrics.json').read_text())
validation=json.loads((OUT/f'exports/{slug}.validation.json').read_text())
three=json.loads((OUT/f'exports/{slug}.three-validation.json').read_text())
assert validation['checks']=='passed' and three['status']=='passed'
assert validation['sha256']==hashlib.sha256((OUT/f'exports/{slug}.glb').read_bytes()).hexdigest()
images=[]
for sub,names in [('final',['Front','ThreeQuarterFront','Side','ThreeQuarterBack','Back']),('poses',['Blink','TalkMouth','HeadTurn','GestureHand','GestureLean','GestureShrug'])]:
    for n in names:
        p=OUT/f'renders/{slug}/{sub}/{n}.png'
        with Image.open(p) as im:im.load();images.append({'path':p.relative_to(ROOT).as_posix(),'size':list(im.size)})
latest=sorted((OUT/'characters'/slug).glob('v*_rigged.blend'))[-1]
result={'character':metrics['character'],'review_note':args.note,'source_blend':latest.relative_to(ROOT).as_posix(),'glb_sha256':validation['sha256'],'technical_checks':'passed','images':images,'art_review':'completed_with_stylized_simplification'}
(OUT/f'characters/{slug}/review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
stage='ART-CHR-'+slug
handoff=ROOT/'docs/handoffs'/f'2026-09-06-{stage.lower()}.md'
text=f'''# {stage}：{metrics['character']} Blender 角色资产

状态：`complete`  
完成时间：`2026-09-06`  
负责人：`Codex / 3D Character Artist`

## 实际完成

- Reference Setup、Blockout、Face、Hair、Clothing、Accessories、Rig 均有实际 Blender 阶段文件。
- 当前工程：`{latest.relative_to(ROOT).as_posix()}`；GLB：`art/blender/exports/{slug}.glb`。
- 实测 {validation['triangles']} triangles、{metrics['meshes']} 个独立网格、28 骨骼、9 段动作。
- 五向渲染及六种动作极值渲染已解码核验。视觉观察：{args.note}

## 明确未完成

- 未替换现有游戏页面中的程序化人物；前端 B 可消费本次 GLB。
- 未进行移动真机帧率压测；不声称已经完成全项目发布验收。

## 修改文件

- `art/blender/characters/{slug}/` — 阶段工程、指标与检查记录。
- `art/blender/exports/{slug}.*` — GLB 与实际结构/Three.js 检查结果。
- `art/blender/renders/{slug}/` — 四向 Blockout、五向成品、六个动作极值。
- `art/blender/scripts/` — 共享实际 Blender 制作、绑定、导出与定向检查工具。
- `art/blender/DELIVERY.md` — 资产使用和制作说明。

## 权威文档更新

- `docs/art/ASSET_DIRECTION.md` 与 `art/blender/DELIVERY.md` 为本次艺术制作依据和交付说明。
- 无规范变更：CONTRACTS、ENGINEERING_SPEC、ADR、A 侧实施顺序和公开游戏数据未修改。

## 定向验证

- `python art/blender/scripts/inspect_glb.py art/blender/exports/{slug}.glb` — 通过：GLB 容器、内嵌资源、UV、骨骼、动画/morph 通道、三角面预算。
- `node art/blender/scripts/verify_three.mjs art/blender/exports/{slug}.glb` — 通过：实际 GLTFLoader 解析、AnimationMixer 播放、有限数值、归一化权重、口型/眨眼与头部动作。
- `pose_qa.py` — 实际 Blender 动作极值渲染，结果见 review.json。
- `bun run typecheck` — 共享制作阶段运行通过，未改 TS 调用方。
- Standards Review：可读命名、版本保留、原始参考未改；制作与游戏业务隔离。
- Spec Review：独立眼球、衣装、关键配件、统一骨骼和指定视角落实；发丝与织物采用实时卡通概括。

## 已知风险、阻塞与下一步

- GLB 使用骨骼与 morph 混合，前端停止动作时需复位权重；多实例用 SkeletonUtils.clone。
- 接入前端前按公开角色映射选择资产，不把模型节点或装饰内容当作案件数据。

## 最小接手阅读顺序

1. `CONTEXT.md`
2. `art/blender/USER_BRIEF.txt`
3. `docs/art/ASSET_DIRECTION.md`
4. `art/blender/DELIVERY.md`
5. `art/blender/characters/{slug}/review.json`
'''
handoff.write_text(text,encoding='utf-8')
readme=ROOT/'docs/handoffs/README.md'
content=readme.read_text(encoding='utf-8')
row=f'| {stage} Blender 角色 | complete | [{handoff.stem}](./{handoff.name}) |'
if row not in content:readme.write_text(content+'\n'+row+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
