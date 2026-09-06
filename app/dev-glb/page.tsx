'use client'
/* eslint-disable react-hooks/set-state-in-effect -- 开发预览页：URL 参数一次性初始化视图状态 */

import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import GlbCharacter from '@/components/three/characters/GlbCharacter'

const CAST = [
  ['shen-qingwu', '沈青梧'],
  ['ji-yunting', '纪云汀'],
  ['a-lan', '阿岚'],
  ['he-xu', '何叙'],
  ['liu-chengyin', '柳成荫'],
] as const

// 预览用最小 RolePublic 形状（GlbCharacter 只读 role_id/persona_key 等展示字段）
function fakeRole(i: number) {
  const keys = ['calm_reporter', 'sharp_analyst', 'uneasy_engineer', 'stern_professor', 'smooth_essayist']
  const names = ['沈青梧', '纪云汀', '阿岚', '何叙', '柳成荫']
  return {
    role_id: `r${i}`,
    persona_key: keys[i],
    display_name: names[i],
    public_bio: '',
    is_ai: true,
    seat: i,
  } as never
}

export default function DevGlbPage() {
  const [slugIdx, setSlugIdx] = useState(0)
  const [sitting, setSitting] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [gestureTick, setGestureTick] = useState(0)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('slug')
    if (s) {
      const i = CAST.findIndex(([slug]) => slug === s)
      if (i >= 0) setSlugIdx(i)
    }
  }, [])
  const [, name] = CAST[slugIdx]
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#141b2e' }}>
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '100vw' }}>
        {CAST.map(([s, n], i) => (
          <button key={s} onClick={() => setSlugIdx(i)} style={slugIdx === i ? on : off}>{n}</button>
        ))}
        <button onClick={() => setSitting(!sitting)} style={off}>{sitting ? '坐姿' : '站姿'}</button>
        <button onClick={() => setSpeaking(!speaking)} style={off}>说话:{speaking ? 'on' : 'off'}</button>
        <button onClick={() => setGestureTick((v) => v + 1)} style={off}>手势</button>
      </div>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.1, 0.9, 2.5], fov: 40, near: 0.05, far: 60 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#141b2e']} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[-3, 5, 4]} intensity={1.5} castShadow />
        <directionalLight position={[3, 2, -3]} intensity={0.5} color="#7f96d0" />
        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            <GlbCharacter
              role={fakeRole(slugIdx)}
              position={[0, 0, 0]}
              rotationY={0}
              speaking={speaking}
              gestureSeed={`g${gestureTick}`}
              stance="answer"
              withStool={sitting}
            />
          </group>
        </Suspense>
        <Grid position={[0, 0, 0]} args={[20, 20]} cellColor="#2a3450" sectionColor="#3a4a6a" fadeDistance={18} />
        <OrbitControls target={[0, sitting ? 0.55 : 1.1, 0]} minDistance={0.8} maxDistance={12} />
      </Canvas>
      <div style={{ position: 'absolute', bottom: 8, left: 10, color: '#9fb0d0', fontSize: 12 }}>当前: {name} · /dev-glb</div>
    </div>
  )
}

const on: React.CSSProperties = { padding: '2px 10px', fontSize: 12, background: '#3a5a9a', color: '#fff', border: 'none', borderRadius: 4 }
const off: React.CSSProperties = { padding: '2px 10px', fontSize: 12, background: '#223', color: '#aac', border: '1px solid #334', borderRadius: 4 }
