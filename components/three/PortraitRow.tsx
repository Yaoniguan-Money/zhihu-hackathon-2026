"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import GlbCharacter from "./characters/GlbCharacter";
import type { RolePublic } from "@/contracts/public";

/**
 * WebGL 上下文丢失自愈：GPU 进程回收上下文时（长会话/多页面导航后偶发），
 * 在原生 canvas 的 webglcontextlost 事件里 preventDefault 并整树重挂 Canvas。
 */
function useGlRecovery() {
  const [epoch, setEpoch] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      setEpoch((n) => n + 1);
    };
    el.addEventListener("webglcontextlost", onLost, true);
    return () => el.removeEventListener("webglcontextlost", onLost, true);
  }, []);
  return { epoch, wrapRef };
}

interface PortraitRowProps {
  roles: RolePublic[];
  selectedId?: string | null;
  onSelect?: (roleId: string) => void;
  /** 每个角色的附加覆盖（如嫌疑标签）。 */
  className?: string;
}

/** 名牌纹理：纸质名牌 + 角色名。 */
function nameplateTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efe6d0";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "#1a1626";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = "#1a1626";
  g.font = "900 26px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name.length > 7 ? `${name.slice(0, 7)}…` : name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 入场：延迟弹起 + 就位（back-out 过冲）。 */
function RiseIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const el = state.clock.elapsedTime - delay;
    if (!group.current) return;
    if (el <= 0) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const t = Math.min(1, el / 0.7);
    const s = t * t * (2.6 - 1.6 * t); // ease-out-back 近似
    group.current.position.y = (1 - t) * -0.55;
    group.current.scale.setScalar(0.82 + 0.18 * s);
  });
  return <group ref={group}>{children}</group>;
}

/** 圆形地台：木盘 + 黄铜圈。 */
function Pedestal() {
  return (
    <group position={[0, 0.015, 0]}>
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[0.34, 0.3, 0.05, 26]} />
        <meshStandardMaterial color="#5f3d22" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.028, 0]}>
        <torusGeometry args={[0.325, 0.012, 8, 26]} />
        <meshStandardMaterial color="#b08850" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** 排成一排的盲盒角色立柱（单 Canvas，档案页与指控页共用）。 */
export default function PortraitRow({ roles, selectedId, onSelect, className }: PortraitRowProps) {
  const gap = 1.05;
  const width = Math.max(roles.length * gap, 2.4);
  const plates = useMemo(
    () => roles.map((r) => nameplateTexture(r.display_name)),
    [roles],
  );
  const { epoch, wrapRef } = useGlRecovery();

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        key={epoch}
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.28, width * 0.72 + 1.35], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
      >
        <ambientLight intensity={0.42} color="#c4bfe0" />
        <directionalLight position={[3, 6, 5]} intensity={0.9} color="#ffdcae" castShadow />
        <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#8f9bff" />
        <directionalLight position={[0, 2.5, 6]} intensity={0.4} color="#fff6e8" />
        <Environment resolution={64} frames={1} background={false}>
          <Lightformer intensity={0.6} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} color="#fff4e0" />
          <Lightformer intensity={0.3} position={[-5, 1, 0]} scale={[6, 3, 1]} rotation-y={Math.PI / 2} color="#cfd4ff" />
        </Environment>
        <group position={[0, 0, 0]}>
          {roles.map((role, i) => (
            <RiseIn key={role.role_id} delay={0.15 + i * 0.12}>
              <group position={[(i - (roles.length - 1) / 2) * gap, 0, 0]}>
                <GlbCharacter
                  role={role}
                  position={[0, 0.04, 0]}
                  rotationY={((i % 2 === 0 ? 1 : -1) * Math.PI) / 14}
                  withStool={false}
                  selected={selectedId === role.role_id}
                  onClick={onSelect ? () => onSelect(role.role_id) : undefined}
                  scale={0.92}
                />
                <Pedestal />
                {/* 名牌：斜立在角色脚前 */}
                <group position={[0, 0.16, 0.42]} rotation={[-0.3, 0, 0]}>
                  <mesh>
                    <planeGeometry args={[0.46, 0.115]} />
                    <meshBasicMaterial map={plates[i]} toneMapped={false} />
                  </mesh>
                </group>
              </group>
            </RiseIn>
          ))}
        </group>
        <ContactShadows position={[0, 0.005, 0]} opacity={0.42} scale={width + 1} blur={2.2} far={2} color="#120f1e" />
      </Canvas>
    </div>
  );
}
