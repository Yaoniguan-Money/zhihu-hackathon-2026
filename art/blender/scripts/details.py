import bpy
import math
import random
import json
import bmesh
from mathutils import Vector
import studio as S

M={}
LIDS=[]
MOUTHS=[]

def tag(o,bone='Head'):
    o['deform_bone']=bone
    return o

def sphere(name,co,sc,mat,bone='Head',seg=20,rings=12):
    return tag(S.ellipsoid(name,co,sc,mat,seg,rings),bone)

def line(name,points,r,mat,bone='Head',cyclic=False):
    return tag(S.curve(name,points,r,mat,cyclic),bone)

def cube(name,co,size,mat,bone='Chest',bevel=.012):
    return tag(S.box(name,co,size,mat,bevel),bone)

def panel(name,points,mat,bone='Chest',thickness=.008):
    o=S.mesh(name,points,[tuple(range(len(points)))],mat)
    so=o.modifiers.new('FabricThickness','SOLIDIFY');so.thickness=thickness
    be=o.modifiers.new('SoftFabricEdge','BEVEL');be.width=.008;be.segments=3
    S.apply(o)
    return tag(o,bone)

def bezier(points,t):
    pts=[Vector(p) for p in points]
    while len(pts)>1:
        pts=[a.lerp(b,t) for a,b in zip(pts,pts[1:])]
    return pts[0]

def integrated_eye_sockets(head):
    """Replace the socket surface with connected deformation rings, sharing boundary vertices."""
    global LIDS
    for o in list(LIDS):
        if 'Lid_' in o.name:
            LIDS.remove(o)
            bpy.data.objects.remove(o,do_unlink=True)
    vertices=[tuple(v.co) for v in head.data.vertices]
    faces=[]
    for p in head.data.polygons:
        center=sum((head.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        x,y,z=center
        cut=y<-.03 and ((abs(x)-.163)/.145)**2+((z-2.085)/.123)**2<1
        if not cut:faces.append(tuple(p.vertices))
    edgecount={}
    for f in faces:
        for a,b in zip(f,f[1:]+f[:1]):
            edge=tuple(sorted((a,b)));edgecount[edge]=edgecount.get(edge,0)+1
    affected=[]
    for sign in [-1,1]:
        cx=sign*.163;cy=-.218;cz=2.085
        boundary=set()
        for (a,b),count in edgecount.items():
            if count!=1:continue
            mid=(Vector(vertices[a])+Vector(vertices[b]))/2
            if mid.y<-.04 and mid.x*sign>0 and abs(mid.x-cx)<.18 and abs(mid.z-cz)<.17:boundary.update([a,b])
        ring=sorted(boundary,key=lambda i:math.atan2((vertices[i][2]-cz)/.123,(vertices[i][0]-cx)/.145))
        if len(ring)<12:raise RuntimeError('Eye socket boundary was not found')
        for index in ring:
            old=Vector(vertices[index]);a=math.atan2((old.z-cz)/.123,(old.x-cx)/.145)
            x=cx+.145*math.cos(a);z=cz+.123*math.sin(a)
            originalz=2.065+(z-2.065)/(.69 if z<2.065 else 1)
            sine=math.sqrt(max(.001,1-((2.065-originalz)/.397)**2))
            width=.407*sine
            if z<2:width*=.79+.21*(z-1.791)/.209
            y=-.324*sine*math.sqrt(max(.001,1-(x/width)**2))
            y+=.029*math.exp(-((abs(x)-.162)/.12)**2-((z-2.075)/.12)**2)
            y-=.011*math.exp(-((abs(x)-.20)/.13)**2-((z-1.94)/.09)**2)
            vertices[index]=(x,y,z)
        previous=ring
        count=len(ring)
        for step in range(1,6):
            t=step/5
            current=[]
            for original in ring:
                outer=Vector(vertices[original])
                a=math.atan2((outer.z-cz)/.123,(outer.x-cx)/.145)
                ix=.108*math.cos(a);iz=(.074 if math.sin(a)>0 else .057)*math.sin(a)
                iy=cy-.104*math.sqrt(max(.02,1-(ix/.119)**2-(iz/.107)**2))-.003
                inner=Vector((cx+ix,iy,cz+iz))
                point=outer.lerp(inner,t)
                q=((point.x-cx)/.119)**2+((point.z-cz)/.107)**2
                if q<1:point.y=min(point.y,cy-.104*math.sqrt(1-q)-.004)
                index=len(vertices);vertices.append(tuple(point));current.append(index)
                affected.append((index,t,cz))
            for j in range(count):
                k=(j+1)%count
                faces.append((previous[k],current[k],current[j],previous[j]))
            previous=current
    mesh=bpy.data.meshes.new(head.name+'_IntegratedSockets')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    head.data=mesh;mesh.materials.append(M['skin'])
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    S.smooth(head)
    head.shape_key_add(name='Basis');key=head.shape_key_add(name='Blink')
    for index,t,cz in affected:
        v=key.data[index]
        v.co.z=cz+(v.co.z-cz)*(1-t)
        v.co.y=v.co.y*(1-t)-.331*t
        cx=.163 if v.co.x>=0 else -.163
        q=((v.co.x-cx)/.119)**2+((v.co.z-cz)/.107)**2
        if q<1:v.co.y=min(v.co.y,-.218-.104*math.sqrt(1-q)-.009)
    LIDS.append(head)
    # Bake the same subdivision topology for basis and blink so both Blender and GLB match.
    modifier=head.modifiers.new('FaceSurfaceRefinement','SUBSURF');modifier.levels=1
    key.value=0
    deps=bpy.context.evaluated_depsgraph_get();deps.update()
    refined=bpy.data.meshes.new_from_object(head.evaluated_get(deps),depsgraph=deps)
    key.value=1;deps.update()
    evaluated=head.evaluated_get(deps);posed=evaluated.to_mesh()
    blink_positions=[tuple(v.co) for v in posed.vertices];evaluated.to_mesh_clear()
    key.value=0;head.modifiers.remove(modifier)
    head.shape_key_clear();head.data=refined
    head.shape_key_add(name='Basis');refinedkey=head.shape_key_add(name='Blink')
    for v,co in zip(refinedkey.data,blink_positions):v.co=co

def lock(name,controls,width,depth,mat,ridges=True):
    pts=[bezier(controls,i/16) for i in range(17)]
    radii=[max(.001,width*(math.sin(math.pi*(i/16)*.88+.22)**.7)*(1-i/16)**.25) for i in range(17)]
    radii[-1]=.001
    o=tag(S.tube(name,pts,radii,mat,10,depth/width))
    if ridges:
        for j,offset in enumerate([-.22]):
            ridge=[]
            for i in range(1,16,2):
                tangent=(pts[i+1]-pts[i-1]).normalized()
                u=tangent.cross(Vector((0,1,0))).normalized()
                v=tangent.cross(u).normalized()
                if v.y>0:v=-v
                ridge.append(tuple(pts[i]+u*radii[i]*offset+v*(radii[i]*depth/width*.94)))
            line(name+'_Ridge_'+str(j),ridge,.0015,M['hairHi'])
    return o

def face(C):
    # A dense ring-based public head surface, rounded cheeks and a narrowed jaw.
    profile=[]
    for i in range(41):
        phi=math.pi*(i+.08)/40.16
        z=2.065-.397*math.cos(phi)
        if z<2.065:z=2.065+(z-2.065)*.69
        w=.407*math.sin(phi)
        if z<2.00:w*=.79+.21*(z-1.791)/.209
        profile.append((z,max(.001,w),max(.001,.324*math.sin(phi))))
    head=tag(S.lathe('Face',profile,M['skin'],64))
    for v in head.data.vertices:
        x,y,z=v.co
        if y<0:
            eye_indent=.029*math.exp(-((abs(x)-.162)/.12)**2-((z-2.075)/.12)**2)
            v.co.y+=eye_indent
            # Slight cheek fullness; avoid a spherical mask around the mouth.
            v.co.y-=.011*math.exp(-((abs(x)-.20)/.13)**2-((z-1.94)/.09)**2)
    sphere('Neck',(0,0,1.69),(.083,.083,.145),M['skin'],'Neck')
    for side,sign in [('L',1),('R',-1)]:
        sphere('Ear_'+side,(sign*.377,-.005,2.015),(.073,.052,.103),M['skin'])
        sphere('EarConcha_'+side,(sign*.397,-.045,2.018),(.040,.012,.065),M['ear'])
        sphere('EarTragus_'+side,(sign*.38,-.055,2.00),(.018,.015,.034),M['skin'])
        cx=sign*.163;cy=-.218;cz=2.085
        sphere('EyeBall_'+side,(cx,cy,cz),(.119,.104,.107),M['white'],'Eye_'+side,40,24)
        # Concentric, domed iris rings retain actual depth and warm radial color.
        vs=[];fs=[]
        for radius in [0,.035,.040,.072,.080]:
            for j in range(48):
                a=j*math.tau/48
                x=radius*math.cos(a);z=radius*math.sin(a)
                y=cy-.104*math.sqrt(max(.01,1-(x/.119)**2-(z/.107)**2))-.0018
                vs.append((cx+x,y,cz+z))
        for k in range(4):
            for j in range(48):
                fs.append(((k+1)*48+j,(k+1)*48+(j+1)%48,k*48+(j+1)%48,k*48+j))
        iris=tag(S.mesh('Iris_'+side,vs,fs,M['pupil']),'Eye_'+side)
        for mat in [M['iris'],M['irisHi'],M['irisDark']]:iris.data.materials.append(mat)
        for p in iris.data.polygons:
            ring=p.index//48
            p.material_index=0 if ring==0 else (3 if ring==3 else (1+(p.index%5==0)))
        sphere('Catchlight_'+side,(cx-.028,cy-.105,cz+.039),(.015,.006,.015),M['white'],'Eye_'+side,16,10)
        sphere('CatchlightSmall_'+side,(cx+.023,cy-.105,cz-.026),(.006,.003,.006),M['white'],'Eye_'+side,12,8)
        # Two annular quad patches: the open almond is the inner boundary.
        for upper in [True,False]:
            vs=[];fs=[]
            for ring in range(5):
                f=ring/4
                for j in range(33):
                    a=(j/32*math.pi)*(1 if upper else -1)
                    ix=.111*math.cos(a); iz=(.079 if upper else .065)*math.sin(a)
                    ox=.158*math.cos(a); oz=.133*math.sin(a)
                    iy=cy-.104*math.sqrt(max(.025,1-(ix/.119)**2-(iz/.107)**2))-.003
                    x=ix*(1-f)+ox*f;z=iz*(1-f)+oz*f
                    oy=-.325*math.sqrt(max(.08,1-((cx+ox)/.407)**2-((cz+oz-2.065)/.34)**2))+.006
                    vs.append((cx+x,iy*(1-f)+oy*f,cz+z))
            for ring in range(4):
                for j in range(32):
                    a=ring*33+j
                    fs.append((a+33,a+34,a+1,a) if upper else (a,a+1,a+34,a+33))
            lid=tag(S.mesh(('UpperLid_' if upper else 'LowerLid_')+side,vs,fs,M['skin']))
            lid.shape_key_add(name='Basis')
            key=lid.shape_key_add(name='Blink')
            for i,v in enumerate(key.data):
                f=i//33/4
                v.co.z=cz+(v.co.z-cz)*f
                v.co.y=v.co.y*f+(-.331)*(1-f)
            LIDS.append(lid)
            # Lash strip is a separate thin quad ribbon with the same blink shape.
            coords=[];quads=[]
            for j in range(33):
                a=j/32*math.pi*(1 if upper else -1)
                x=.111*math.cos(a);z=(.079 if upper else .065)*math.sin(a)
                y=cy-.104*math.sqrt(max(.025,1-(x/.119)**2-(z/.107)**2))-.005
                thick=(.007 if upper else .0025)*math.sin(math.pi*j/32)**.4+.001
                coords.extend([(cx+x,y,cz+z),(cx+x,y-.001,cz+z+thick*(1 if upper else -1))])
                if j<32:quads.append((2*j,2*j+1,2*j+3,2*j+2))
            lash=tag(S.mesh(('UpperLash_' if upper else 'LowerLash_')+side,coords,quads,M['lash']))
            lash.shape_key_add(name='Basis');key=lash.shape_key_add(name='Blink')
            for i,v in enumerate(key.data):
                v.co.z=cz+(.003 if i%2 else 0)
                v.co.y=-.333
            LIDS.append(lash)
        # Brows shaped as flattened clumps, distinct from the hair cap.
        browz=2.235
        pts=[(cx-sign*.096,-.304,browz-.012),(cx-sign*.042,-.339,browz+.012),(cx+sign*.04,-.307,browz+.007),(cx+sign*.1,-.272,browz-.023)]
        o=tag(S.tube('Brow_'+side,pts,[.004,.014,.012,.002],M['hair'],10,.36))
    sphere('NoseBridge',(0,-.318,2.039),(.019,.022,.047),M['skin'])
    sphere('NoseTip',(0,-.338,2.009),(.028,.031,.025),M['skin'])
    for s in [-1,1]:sphere('Nostril_'+str(s),(s*.015,-.357,1.997),(.006,.004,.003),M['ear'],seg=12,rings=8)
    # A four-ring lip mesh, with an actual dark inner surface behind the aperture.
    vs=[];fs=[]
    for ring in range(4):
        rx=[.064,.058,.049,.044][ring];rz=[.013,.014,.006,.0035][ring]
        for j in range(40):
            a=j*math.tau/40;x=rx*math.cos(a)
            z=1.934+rz*math.sin(a)+.006*(abs(x)/.064)**2
            vs.append((x,-.310-[0,.012,.014,.008][ring],z))
    for k in range(3):
        for j in range(40):fs.append((k*40+j,k*40+(j+1)%40,(k+1)*40+(j+1)%40,(k+1)*40+j))
    lips=tag(S.mesh('Lips',vs,fs,M['lip']))
    lips.shape_key_add(name='Basis');key=lips.shape_key_add(name='MouthOpen')
    for i,v in enumerate(key.data):
        a=(i%40)*math.tau/40
        v.co.z+=.022*math.sin(a)-.009
        v.co.y-=.005
    MOUTHS.append(lips)
    cavity=sphere('MouthCavity',(0,-.313,1.934),(.046,.010,.006),M['mouth'])
    cavity.shape_key_add(name='Basis');key=cavity.shape_key_add(name='MouthOpen')
    for v in key.data:v.co.z=(v.co.z)*4-.009
    MOUTHS.append(cavity)
    lips.location.y+=.027
    cavity.location.y+=.027
    integrated_eye_sockets(head)

def hair(C):
    style=C['style']
    # Variable lower boundary: high forehead, low occiput. This is an open cap.
    vs=[];fs=[];cols=64;rows=18
    for i in range(rows):
        t=i/(rows-1)
        for j in range(cols):
            a=j*math.tau/cols
            front=max(0,math.cos(a))
            limit=1.94 if style in ['short','silver'] else (2.18 if style=='bob_short' else 2.26)
            theta=(limit-(limit-1.22)*front**.35)*t+.015
            vs.append((.421*math.sin(theta)*math.sin(a),.015-.346*math.sin(theta)*math.cos(a),2.087+.42*math.cos(theta)))
    for i in range(rows-1):
        for j in range(cols):fs.append(((i+1)*cols+j,(i+1)*cols+(j+1)%cols,i*cols+(j+1)%cols,i*cols+j))
    tag(S.mesh('Hair_BaseCap',vs,fs,M['hair']))
    # The mass consists of overlapping broad tapered clumps, all with real thickness.
    count=20 if style!='curly' else 24
    for j in range(count):
        a=.64+(math.tau-1.28)*j/(count-1)
        isshort=style in ['short','silver']
        endz=1.805 if not isshort else 1.93
        if style=='bob_short':endz+=.035
        if style=='curly':endz=1.70+.04*math.sin(j*2)
        x=math.sin(a);y=-math.cos(a)
        pts=[(.08*x,.015+.08*y,2.48),(.43*x,.03+.36*y,2.4),(.485*x,.04+.375*y,2.08),(.39*x,.045+.29*y,endz+.04*math.sin(j))]
        if style=='curly':
            crown=Vector((.10*x,.035+.10*y,2.47))
            mid=Vector((.53*x,.045+.40*y,2.10))
            end=Vector((.45*x,.04+.30*y,endz))
            out=Vector((mid.x,.02+mid.y,0)).normalized()
            def curlp(t):
                base=crown.lerp(mid,t/.5) if t<=.5 else mid.lerp(end,(t-.5)/.5)
                return tuple(base+out*.05*math.sin(t*math.tau*1.25+j*.8)*(.2+.8*t))
            pts=[curlp(i/8) for i in range(9)]
        lock('Hair_BackClump_%02d'%j,pts,.075 if isshort else .083,.036,M['hair'] if j%4 else M['hairHi'],j%2==0)
    # Sweeping fringe fans out from the right part to the left temple.
    for j in range(7):
        f=j/6
        start=(.145+.04*f,-.075,2.475-.018*f)
        end=(-.34+.43*f,-.26-.09*f,2.10+.15*f)
        if style=='silver':end=(-.36+.49*f,-.27-.035*f,2.26+.10*f)
        if style=='short':end=(-.40+.47*f,-.26-.10*f,2.19+.10*f)
        pts=[start,(-.06,-.255,2.475),(-.37+.28*f,-.325,2.30),end]
        lock('Hair_FrontBang_%02d'%j,pts,.073,.027,M['hair'] if j%3 else M['hairHi'])
    for j in range(4):
        f=j/3
        pts=[(.14,-.07,2.475),(.37+.07*f,-.21,2.47),(.44+.04*f,-.30,2.15),(.32+.06*f,-.23,1.84+.10*f)]
        if style in ['short','silver']:
            pts[-1]=(.40+.055*f,-.18,2.04+.05*f)
        lock('Hair_SideLock_%02d'%j,pts,.062,.03,M['hair'])
    if style=='short':
        for j in range(8):
            sign=-1 if j%2 else 1;f=j/8
            lock('Hair_Accent_%02d'%j,[(sign*.1,.025,2.42),(sign*.35,.04,2.53),(sign*(.40+.08*f),-.04,2.39),(sign*(.49+.035*f),-.08,2.35+.1*math.sin(j))],.055,.024,M['hairHi'],False)
    if style=='silver':
        # Continuous jaw shell keeps the beard reading as one mass; clumps only style the surface.
        arc=[]
        for j in range(11):
            a=math.pi*(.06+.88*j/10)
            arc.append((.315*math.cos(a),-.198-.075*math.sin(a),2.00-.19*math.sin(a)))
        tag(S.tube('Beard_Base',arc,[.030,.036,.038,.040,.044,.044,.040,.038,.036,.030,.024],M['hairHi'],14,.82),'Head')
        sphere('Beard_Chin',(0,-.24,1.845),(.115,.085,.055),M['hairHi'])
        for j in range(10):
            a=math.pi*(.10+.80*j/9)
            x=.315*math.cos(a);y=-.198-.075*math.sin(a);z=2.00-.19*math.sin(a)
            lock('Beard_Clump_%02d'%j,[(x,y+.028,z+.050),(x*.985,y-.005,z+.018),(x*.94,y+.004,z-.026)],.030,.014,M['hairHi'] if j%2 else M['hair'],False)
        for sign in [-1,1]:
            lock('Moustache_'+str(sign),[(0,-.343,1.965),(sign*.035,-.346,1.976),(sign*.075,-.322,1.95),(sign*.085,-.312,1.916)],.021,.012,M['hairHi'],False)
    if style=='curly':
        cap=sphere('Beret_Crown',(-.06,.02,2.45),(.44,.345,.12),M['beret'],seg=40,rings=20)
        cap.rotation_euler.y=-.20
        line('Beret_Seam',[(.38*math.sin(a)-.04,.29*math.cos(a),2.42+.055*math.sin(a)) for a in [i*math.tau/16 for i in range(16)]],.011,M['beret'],cyclic=True)
        line('Beret_Stem',[(-.19,.03,2.53),(-.21,.03,2.60)],.012,M['beret'])

def clothing(C):
    hoodie=C['style']=='short'
    torso=tag(S.lathe('Body_Torso',[(1.04,.15,.11),(1.1,.20,.14),(1.2,.20,.125),(1.32,.195,.132),(1.46,.24,.145),(1.55,.25,.13),(1.61,.20,.10),(1.655,.09,.077)],M['shirt'],40),'Spine_02')
    torso['weight_mode']='torso'
    pelvis=sphere('Body_Pelvis',(0,0,1.095),(.206,.129,.144),M['pants'],'Pelvis')
    for sign,side in [(-1,'R'),(1,'L')]:
        # Continuous rings include both sides of knee and elbow, avoiding rigid segments.
        points=[(sign*.115,0,1.13),(sign*.12,0,1.09),(sign*.13,0,.93),(sign*.141,0,.75),(sign*.143,0,.70),(sign*.145,0,.66),(sign*.147,0,.62),(sign*.151,0,.46),(sign*.155,0,.275),(sign*.155,0,.255)]
        rr=[.103,.114,.110,.093,.091,.09,.091,.092,.078,.077]
        if hoodie:rr=[r*(1.05+.09*math.sin(i)) for i,r in enumerate(rr)]
        leg=tag(S.tube('Pants_'+side,points,rr,M['pants'],24,.88),'UpperLeg_'+side)
        leg['weight_mode']='leg_'+side
        cuff=tag(S.tube('Pants_Cuff_'+side,[(sign*.155,0,.255),(sign*.155,0,.27),(sign*.155,0,.31),(sign*.155,0,.32)],[.084,.087,.087,.083],M['pants'],24,.9),'LowerLeg_'+side)
        sphere('Ankle_'+side,(sign*.155,0,.215),(.058,.06,.07),M['skin'],'Foot_'+side)
        # Sole and upper have a flat grounded bottom and a full toe box.
        cube('Shoe_Sole_'+side,(sign*.155,-.058,.034),(.17,.285,.049),M['sole'],'Foot_'+side,.024)
        sphere('Shoe_Upper_'+side,(sign*.155,-.056,.089),(.086,.146,.060),M['shoe'],'Foot_'+side,32,16)
        sphere('Shoe_Instep_'+side,(sign*.155,.016,.119),(.07,.075,.072),M['shoe'],'Foot_'+side)
        if not hoodie:
            cube('Shoe_Heel_'+side,(sign*.155,.045,.040),(.14,.09,.075),M['shoe'],'Foot_'+side,.008)
            line('Shoe_VampSeam_'+side,[(sign*.155-.066,-.015,.108),(sign*.155-.06,-.14,.118),(sign*.155,-.18,.12),(sign*.155+.06,-.14,.118),(sign*.155+.066,-.015,.108)],.002,M['stitch'],'Foot_'+side)
            line('Shoe_Bit_'+side,[(sign*.155-.038,-.073,.145),(sign*.155+.038,-.073,.145)],.006,M['gold'],'Foot_'+side)
        else:
            cube('Sneaker_ToeOverlay_'+side,(sign*.155,-.17,.075),(.14,.055,.044),M['coat'],'Foot_'+side,.016)
            for j in range(4):line('Shoe_Lace_'+side+str(j),[(sign*.155-.036,-.075+j*.023,.145),(sign*.155+.035,-.063+j*.023,.145)],.0035,M['shirt'],'Foot_'+side)
            cube('CargoPocket_'+side,(sign*.245,-.017,.84),(.065,.15,.18),M['pants'],'UpperLeg_'+side,.016)
            cube('CargoTag_'+side,(sign*.281,-.03,.80),(.005,.04,.045),M['gold'],'UpperLeg_'+side,.002)
        shoulder=Vector((sign*.225,0,1.565));elbow=Vector((sign*.36,-.013,1.34));wrist=Vector((sign*.42,-.065,1.135))
        pts=[shoulder.lerp(elbow,t) for t in [0,.12,.45,.82,.94,1]]+[elbow.lerp(wrist,t) for t in [.10,.30,.65,1]]
        rr=[.105,.109,.105,.088,.087,.087,.085,.080,.07,.063]
        if hoodie:rr=[r*1.16 for r in rr]
        sleeve=tag(S.tube('Sleeve_'+side,pts,rr,M['coat'],24),'UpperArm_'+side)
        sleeve['weight_mode']='arm_'+side
        sphere('ShoulderCap_'+side,tuple(shoulder),(.108,.103,.113),M['coat'],'UpperArm_'+side)
        direction=(wrist-elbow).normalized()
        tag(S.tube('Cuff_'+side,[wrist-direction*.06,wrist-direction*.048,wrist,wrist+direction*.007],[.072,.074,.069,.064],M['shirt'] if not hoodie else M['coat'],24),'ForeArm_'+side)
        palm=wrist+direction*.069
        hand=sphere('Hand_Palm_'+side,tuple(palm),(.050,.031,.064),M['skin'],'Hand_'+side,24,16)
        # Four fingers and opposed thumb; small gaps retain a readable natural hand.
        for j in range(4):
            x=palm.x+(j-1.5)*.021; length=[.054,.068,.064,.047][j]
            z=palm.z-.034
            tag(S.tube('Hand_Finger_'+side+str(j),[(x,palm.y,z),(x,palm.y-.003,z-.019),(x,palm.y-.013,z-length*.75),(x,palm.y-.024,z-length)],[.012,.012,.010,.004],M['skin'],10),'Hand_'+side)
        tag(S.tube('Hand_Thumb_'+side,[(palm.x-sign*.038,palm.y,palm.z+.01),(palm.x-sign*.065,palm.y-.007,palm.z-.012),(palm.x-sign*.071,palm.y-.024,palm.z-.035)],[.019,.015,.006],M['skin'],12),'Hand_'+side)
    if hoodie:
        hoodieobj=tag(S.lathe('Hoodie',[(1.075,.21,.145),(1.10,.238,.162),(1.21,.245,.167),(1.39,.234,.164),(1.51,.26,.156),(1.59,.235,.134),(1.635,.115,.094)],M['coat'],40),'Chest')
        hoodieobj['weight_mode']='torso'
        sphere('Hood_Back',(0,.12,1.555),(.19,.13,.16),M['coat'],'Chest')
        line('Hood_Rim',[(-.17,-.045,1.60),(-.12,-.07,1.68),(0,.055,1.71),(.12,-.07,1.68),(.17,-.045,1.60)],.026,M['yellow'],'Chest')
        for sign in [-1,1]:line('Hood_Drawstring_'+str(sign),[(sign*.09,-.126,1.61),(sign*.12,-.167,1.48),(sign*.125,-.18,1.36)],.006,M['yellow'],'Chest')
        cube('Hoodie_Pocket',(0,-.164,1.23),(.30,.025,.125),M['coat'],'Spine_01',.024)
    else:
        bottom=.71 if C['style']!='bob_short' else .89
        profile=[(bottom,.31,.185),(bottom+.025,.308,.184),(.95,.278,.17),(1.11,.239,.154),(1.21,.219,.148),(1.32,.226,.151),(1.46,.259,.169),(1.56,.26,.147),(1.61,.211,.112)]
        coat=tag(S.lathe('Coat',profile,M['coat'],48,start=.42,end=math.tau-.42),'Chest')
        coat['weight_mode']='coat'
        coat.data.materials.append(M['lining'])
        sol=coat.modifiers.new('LinedFabricThickness','SOLIDIFY');sol.thickness=.014;sol.material_offset=1
        S.apply(coat)
        for sign,side in [(-1,'R'),(1,'L')]:
            panel('Coat_Lapel_'+side,[(sign*.085,-.128,1.63),(sign*.224,-.132,1.56),(sign*.146,-.186,1.43),(sign*.186,-.176,1.37),(sign*.071,-.181,1.26),(sign*.108,-.166,1.48)],M['coat'])
            panel('Shirt_Collar_'+side,[(sign*.02,-.089,1.66),(sign*.084,-.089,1.68),(sign*.141,-.128,1.60),(sign*.091,-.157,1.535)],M['shirt'])
            line('Coat_Edge_'+side,[(sign*.085,-.145,1.49),(sign*.092,-.145,1.20),(sign*.125,-.178,bottom+.018)],.004,M['lining'],'Chest')
            pocket=cube('Coat_Pocket_'+side,(sign*.217,-.117,1.095),(.105,.025,.035),M['coat'],'Spine_01',.007)
            pocket.rotation_euler.y=sign*.14
        cube('Coat_BackBelt',(0,.171,1.195),(.365,.017,.044),M['coat'],'Spine_01',.005)
        for sign in [-1,1]:sphere('BackBelt_Button_'+str(sign),(sign*.135,.187,1.195),(.015,.008,.015),M['gold'],'Spine_01',16,10)
    # Waist belt, placket and real separate fasteners.
    belt=tag(S.lathe('WaistBelt',[(1.125,.208,.144),(1.166,.208,.144)],M['leather'],40),'Pelvis')
    line('Belt_Buckle',[(-.04,-.157,1.125),(.04,-.157,1.125),(.04,-.157,1.17),(-.04,-.157,1.17)],.006,M['gold'],'Pelvis',True)
    if not hoodie:
        for j in range(4):sphere('Shirt_Button_'+str(j),(0,-.143,1.23+j*.073),(.006,.006,.006),M['gold'],'Chest',12,8)
        for sign in [-1,1]:
            for j in range(3):sphere('Coat_Button_'+str(sign)+'_'+str(j),(sign*(.142+.016*j),-.165,1.17-j*.13),(.014,.006,.014),M['gold'],'Spine_01',16,10)

def accessories(C):
    style=C['style']
    if style in ['bob_short','silver']:
        for sign,side in [(-1,'R'),(1,'L')]:
            pts=[]
            for j in range(16):
                a=j*math.tau/16
                pts.append((sign*.163+.133*math.cos(a),-.350+.018*abs(math.cos(a)),2.081+.103*math.sin(a)))
            line('Glasses_Frame_'+side,pts,.006,M['gold'] if style=='silver' else M['leather'],cyclic=True)
            line('Glasses_Temple_'+side,[(sign*.294,-.342,2.10),(sign*.37,-.20,2.12),(sign*.396,-.01,2.10)],.006,M['leather'])
        line('Glasses_Bridge',[(-.03,-.348,2.09),(0,-.358,2.107),(.03,-.348,2.09)],.005,M['gold'])
    if style=='bob_short':
        line('Necklace',[(-.07,-.088,1.66),(-.04,-.122,1.575),(0,-.15,1.535),(.04,-.122,1.575),(.07,-.088,1.66)],.0025,M['gold'],'Chest')
        sphere('Pendant',(0,-.157,1.536),(.014,.008,.02),M['iris'],'Chest')
    if style in ['bob','short']:
        line('Lanyard',[(-.065,-.093,1.66),(-.12,-.17,1.49),(0,-.21,1.28),(.12,-.17,1.49),(.065,-.093,1.66)],.008,M['leather'],'Chest')
        cube('Badge_Case',(0,-.217,1.265),(.115,.019,.15),M['leather'],'Chest',.008)
        cube('Badge_Card',(0,-.230,1.265),(.095,.006,.128),M['paper'],'Chest',.003)
        cube('Badge_Photo',(0,-.235,1.282),(.062,.003,.066),M['coat'],'Chest',.002)
        sphere('Badge_PhotoHead',(0,-.239,1.292),(.018,.002,.020),M['skin'],'Chest',16,10)
        cube('Badge_Clip',(0,-.234,1.345),(.023,.009,.028),M['gold'],'Chest',.003)
        # Readable small label is independent geometry, not a hidden texture dependency.
        d=bpy.data.curves.new('Badge_Label','FONT');d.body='PRESS' if style=='bob' else 'DEV';d.align_x='CENTER';d.size=.018;d.extrude=.0002
        o=bpy.data.objects.new('Badge_Label',d);bpy.context.scene.collection.objects.link(o);S.place(o,'Badge_Label');o.location=(0,-.238,1.217);o.rotation_euler=(math.pi/2,0,0)
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.data.materials.append(M['leather']);tag(o,'Chest')
    # Prop is strapped beside the left forearm in the neutral pose, attachable to Hand_L.
    tablet=style in ['short','bob_short']
    prop=cube('Tablet' if tablet else 'Notebook',(.315,-.155,1.30),(.19,.045,.29),M['device'] if tablet else M['leather'],'ForeArm_L',.015)
    if tablet:
        cube('Tablet_Screen',(.315,-.181,1.30),(.161,.004,.248),M['screen'],'ForeArm_L',.009)
        sphere('Tablet_Camera',(.315,-.186,1.427),(.004,.002,.004),M['gold'],'ForeArm_L',12,8)
    else:
        cube('Notebook_Pages',(.315,-.156,1.30),(.172,.032,.273),M['paper'],'ForeArm_L',.002)
        cube('Notebook_Cover',(.315,-.18,1.30),(.191,.008,.289),M['leather'],'ForeArm_L',.005)
        line('Notebook_GoldRule',[(.237,-.186,1.424),(.394,-.186,1.424),(.394,-.186,1.177),(.237,-.186,1.177)],.0015,M['gold'],'ForeArm_L',True)
        for j in range(2):
            cube('Document_'+str(j),(.31+j*.015,-.152+j*.008,1.459+j*.015),(.143,.006,.085),M['paper'],'ForeArm_L',.001)
        if style=='bob':
            for j in range(13):line('Notebook_Spiral_'+str(j),[(.218,-.155,1.19+j*.018),(.214,-.186,1.19+j*.018),(.232,-.188,1.19+j*.018)],.002,M['gold'],'ForeArm_L')
    if style=='short':
        cube('Backpack',(0,.232,1.32),(.35,.21,.48),M['leather'],'Spine_02',.065)
        cube('Backpack_FrontPocket',(0,.352,1.26),(.275,.060,.25),M['leather'],'Spine_02',.037)
        for sign in [-1,1]:
            line('Backpack_ShoulderStrap_'+str(sign),[(sign*.15,.23,1.52),(sign*.18,.03,1.63),(sign*.17,-.143,1.51),(sign*.18,-.15,1.23),(sign*.15,.20,1.15)],.019,M['leather'],'Chest')
            cube('Backpack_ZipPull_'+str(sign),(sign*.125,.389,1.375),(.019,.012,.042),M['yellow'],'Spine_02',.003)
        line('Backpack_Handle',[(-.07,.25,1.54),(0,.25,1.61),(.07,.25,1.54)],.012,M['leather'],'Chest')
    elif style in ['bob','curly']:
        cube('Bag',(-.34,.035,1.04),(.19,.15,.245),M['leather'],'Pelvis',.029)
        cube('Bag_Flap',(-.34,-.05,1.105),(.194,.027,.125),M['leather'],'Pelvis',.017)
        line('Bag_ShoulderStrap',[(-.34,.10,1.16),(-.23,.13,1.55),(-.20,.015,1.642),(-.22,-.153,1.53),(-.34,-.031,1.15)],.014,M['leather'],'Chest')
        line('Bag_Buckle',[(-.36,-.069,1.055),(-.32,-.069,1.055),(-.32,-.069,1.09),(-.36,-.069,1.09)],.004,M['gold'],'Pelvis',True)
        line('Bag_Stitch',[(-.419,-.068,1.15),(-.419,-.068,.951),(-.261,-.068,.951),(-.261,-.068,1.15)],.0018,M['stitch'],'Pelvis')
    if style in ['silver','curly']:
        scarfmat=M['wine'] if style=='silver' else M['scarf']
        line('Scarf_Neck',[(-.10,-.06,1.65),(-.11,.075,1.69),(0,.11,1.70),(.11,.075,1.69),(.12,-.09,1.61),(0,-.135,1.62),(-.10,-.06,1.65)],.046,scarfmat,'Neck')
        for sign,side in [(-1,'R'),(1,'L')]:
            zbottom=.98 if sign==1 else 1.07
            scarf=panel('Scarf_Tail_'+side,[(sign*.09,-.158,1.63),(sign*.17,-.169,1.60),(sign*.225,-.204,zbottom),(sign*.139,-.214,zbottom)],scarfmat,'Scarf_'+side,.015)
            if style=='curly':
                for j in range(7):
                    f=j/7;z=1.58-(1.58-zbottom)*f;x=sign*(.13+.055*f)
                    line('Scarf_Check_'+side+str(j),[(x-.037,-.221,z),(x+.037,-.221,z)],.004,M['yellow'],'Scarf_'+side)
            for j in range(9):
                x=sign*.139+sign*.086*j/8
                line('Scarf_Fringe_'+side+str(j),[(x,-.213,zbottom),(x+sign*.012,-.22,zbottom-.052)],.0035,scarfmat,'Scarf_'+side)
        if style=='silver':
            for sign in [-1,1]:sphere('BowTie_Wing_'+str(sign),(sign*.036,-.17,1.573),(.043,.019,.034),M['wine'],'Chest')
            sphere('BowTie_Knot',(0,-.181,1.573),(.017,.016,.021),M['wine'],'Chest')
            line('WatchChain',[(.06,-.151,1.29),(.11,-.16,1.19),(.175,-.15,1.27)],.0027,M['gold'],'Spine_01')
        else:
            for sign in [-1,1]:
                line('Earring_Ring_'+str(sign),[(sign*.367+.014*math.sin(a),-.061,1.935+.022*math.cos(a)) for a in [j*math.tau/12 for j in range(12)]],.003,M['gold'],cyclic=True)
                sphere('Earring_Coin_'+str(sign),(sign*.367,-.062,1.908),(.016,.005,.020),M['gold'])
            line('Pen',[(-.41,-.109,1.05),(-.435,-.109,1.22)],.006,M['leather'],'Hand_R')
            sphere('Pen_Nib',(-.438,-.109,1.237),(.004,.004,.018),M['gold'],'Hand_R')
    cube('WatchStrap',(-.414,-.05,1.15),(.10,.065,.028),M['leather'],'ForeArm_R',.009)
    cube('WatchFace',(-.414,-.088,1.15),(.044,.014,.036),M['gold'],'ForeArm_R',.006)

def build(C,slug,directory,char,views):
    global M,LIDS,MOUTHS
    LIDS=[];MOUTHS=[]
    colors={'skin':'f0c4a7','ear':'cb8a78','white':'fff7ed','pupil':'201717','iris':C['eye'],'irisHi':'a4784f','irisDark':'35241e','lash':'39251f','lip':'c47b69','mouth':'482625','hair':C['hair'],'hairHi':C['hairlight'],'coat':C['coat'],'shirt':C['shirt'],'pants':C['pants'],'shoe':C['shoe'],'lining':C['shirt'],'sole':'252329','gold':'a98548','leather':'352b27','stitch':'a59177','paper':'eee5cf','yellow':'d6a447','device':'828286','screen':'222e35','wine':'7e2630','scarf':'554337','beret':'543a32'}
    for k,c in colors.items():
        rough=.72 if k in ['coat','shirt','pants','lining','wine','scarf','beret','sole'] else (.43 if k in ['hair','hairHi','shoe','leather','iris'] else .49)
        M[k]=S.material(C['name']+'_'+k,c,rough,.72 if k=='gold' else 0,.07 if k=='skin' else 0)
    face(C)
    for o in list(char.objects):
        if 'Catchlight' in o.name:bpy.data.objects.remove(o,do_unlink=True)
    S.save(directory/'v003_face.blend')
    hair(C);S.save(directory/'v004_hair.blend')
    clothing(C);S.save(directory/'v005_clothing.blend')
    accessories(C);S.save(directory/'v006_accessories.blend')
    for o in char.objects:
        if o.type=='MESH' and o.get('deform_bone') in ['Head','Eye_L','Eye_R']:
            o.location.z-=.06
    import rigging
    rigging.finish(C,slug,directory,char,LIDS,MOUTHS)
    S.save(directory/'v007_rigged.blend')
    S.render_views(views,S.OUT/'renders'/slug/'final',32)
