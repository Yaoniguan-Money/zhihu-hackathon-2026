from pathlib import Path
import struct
import json
import math
import hashlib
import argparse

def inspect(path):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    n,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    doc=json.loads(data[20:20+n])
    assert not any(b.get('uri') for b in doc['buffers']), 'External buffer dependency'
    assert not any(i.get('uri') for i in doc.get('images',[])), 'External image dependency'
    nodes=doc.get('nodes',[])
    assert not any('camera' in n for n in nodes)
    assert not any(n.get('name','').startswith(('REF_','CAM_','STUDIO_')) for n in nodes)
    tri=0;skinned=0;morphs=0
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            assert p.get('mode',4)==4
            count=doc['accessors'][p['indices']]['count'] if 'indices' in p else doc['accessors'][p['attributes']['POSITION']]['count']
            tri+=count//3
            skinned+=int('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'])
            morphs+=len(p.get('targets',[]))
            assert 'TEXCOORD_0' in p['attributes'], 'Mesh missing UV'
    clips={a.get('name',''): {'channels':len(a['channels']),'paths':sorted(set(c['target']['path'] for c in a['channels'])),'duration':max(doc['accessors'][s['input']].get('max',[0])[0] for s in a['samplers'])} for a in doc.get('animations',[])}
    is_character=path.stem!='detective-room'
    if is_character:
        assert doc.get('skins'), 'Missing skeleton'
        for a in ['Idle','Blink','HeadTurn','TalkMouth','Nod','ShakeHead']:
            assert a in clips,(a,list(clips))
        assert 'weights' in clips['Blink']['paths'] and 'weights' in clips['TalkMouth']['paths']
        assert 30000<=tri<=80000, f'Character triangle budget failed: {tri}'
    return {'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tri,'nodes':len(nodes),'mesh_count':len(doc.get('meshes',[])),'materials':len(doc.get('materials',[])),'skins':len(doc.get('skins',[])),'skinned_primitives':skinned,'morph_targets':morphs,'animations':clips,'embedded_resources':True,'checks':'passed'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('files',nargs='+');args=parser.parse_args()
    for name in args.files:
        path=Path(name);result=inspect(path)
        path.with_suffix('.validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result,indent=2))
