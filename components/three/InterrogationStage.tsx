"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, PerformanceMonitor, Preload } from "@react-three/drei";
import * as THREE from "three";
import GlbCharacter from "./characters/GlbCharacter";
import InterrogationRoom from "./scene/InterrogationRoom";
import CameraRig from "./CameraRig";
import SpeechBubble from "./SpeechBubble";
import type { RoleEmotion, RolePublic, RoleStance } from "@/contracts/public";

export interface StageRoleState {
  role: RolePublic;
  emotion?: RoleEmotion;
  stance?: RoleStance;
  speaking?: boolean;
  pressure?: number;
  gestureSeed?: string;
  selected?: boolean;
  onClick?: () => void;
}

interface InterrogationStageProps {
  roles: StageRoleState[];
  bubble?: {
    roleId: string;
    name: string;
    color: string;
    text: string;
    key: string;
    thinking?: boolean;
  } | null;
  focusRoleId?: string | null;
  /** lobby 模式：慢速自动环绕、角色自嗨互动。 */
  variant?: "table" | "lobby";
  className?: string;
}

const SEAT_RADIUS = 2.35;

export function seatTransform(index: number, total: number): {
  position: [number, number, number];
  rotationY: number;
} {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(angle) * SEAT_RADIUS;
  const z = Math.sin(angle) * SEAT_RADIUS;
  const rotationY = Math.atan2(-Math.cos(angle), -Math.sin(angle));
  return { position: [x, 0, z], rotationY };
}

/**
 * WebGL 上下文丢失自愈：GPU 回收上下文时 preventDefault 并重挂 Canvas。
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

export default function InterrogationStage({
  roles,
  bubble,
  focusRoleId,
  variant = "table",
  className,
}: InterrogationStageProps) {
  const focus = useMemo(() => {
    if (!focusRoleId) return null;
    const idx = roles.findIndex((r) => r.role.role_id === focusRoleId);
    if (idx < 0) return null;
    return seatTransform(idx, roles.length).position;
  }, [focusRoleId, roles]);

  const { epoch, wrapRef } = useGlRecovery();
  // 自适应分辨率：帧率下滑先降 dpr（0.9），持续不佳退到 1；恢复则回升
  const [dpr, setDpr] = useState(1.5);

  const bubbleSeat = useMemo(() => {
    if (!bubble) return null;
    const idx = roles.findIndex((r) => r.role.role_id === bubble.roleId);
    if (idx < 0) return null;
    return seatTransform(idx, roles.length).position;
  }, [bubble, roles]);

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        key={epoch}
        shadows
        dpr={dpr}
        performance={{ min: 0.4 }}
        camera={{ position: [0, 7.8, 10.8], fov: 42, near: 0.1, far: 60 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
          // 渲染诊断钩子：QA 脚本（inspect-threejs-canvas.mjs）按此结构读取实时渲染统计
          const w = window as unknown as {
            __THREE_GAME_DIAGNOSTICS__?: { renderer: Record<string, number> };
          };
          w.__THREE_GAME_DIAGNOSTICS__ = {
            renderer: {
              get calls() {
                return gl.info.render.calls;
              },
              get triangles() {
                return gl.info.render.triangles;
              },
              get geometries() {
                return gl.info.memory.geometries;
              },
              get textures() {
                return gl.info.memory.textures;
              },
            },
          };
        }}
      >
      <PerformanceMonitor
        onIncline={() => setDpr(1.75)}
        onDecline={() => setDpr(0.9)}
        onFallback={() => setDpr(1)}
        flipflops={3}
      />
      <color attach="background" args={["#171430"]} />
      <fog attach="fog" args={["#171430", 11, 20]} />

      {/* 基础夜色光：低强度紫灰底，让位给实用灯具的暖光池 */}
      <ambientLight intensity={0.38} color="#9a92c8" />
      <hemisphereLight args={["#565383", "#3a2b26", 0.5]} />
      {/* Key 补光：暖色正面软光（吊灯为主光时的面部填充），保证表情可读 */}
      <directionalLight position={[2.5, 4.5, 6.5]} intensity={0.85} color="#ffe7c4" />
      {/* Rim：窗侧冷色轮廓光，从后侧勾角色肩线 */}
      <directionalLight position={[-4, 5, -6.5]} intensity={0.55} color="#7f9bff" />

      {/* 程序化环境反射（无网络依赖）：暖顶 + 冷左 + 暖右，给金属与头发高光 */}
      <Environment resolution={64} frames={1} background={false}>
        <Lightformer intensity={1.1} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} color="#fff4e0" />
        <Lightformer intensity={0.45} position={[-5, 1, -1]} scale={[6, 3, 1]} rotation-y={Math.PI / 2} color="#8890ff" />
        <Lightformer intensity={0.4} position={[5, 2, 1]} scale={[6, 3, 1]} rotation-y={-Math.PI / 2} color="#ffd9a0" />
      </Environment>

      <InterrogationRoom />

      <Suspense fallback={null}>
        {roles.map((state, i) => {
          const { position, rotationY } = seatTransform(i, roles.length);
          return (
            <GlbCharacter
              key={state.role.role_id}
              role={state.role}
              position={position}
              rotationY={rotationY}
              emotion={state.emotion}
              stance={state.stance}
              speaking={state.speaking}
              pressure={state.pressure}
              gestureSeed={state.gestureSeed}
              selected={state.selected}
              onClick={state.onClick}
            />
          );
        })}
      </Suspense>

      <ContactShadows position={[0, 0.01, 0]} opacity={0.52} scale={12} blur={2.2} far={2.6} color="#0f0c1a" />

      {bubble && bubbleSeat && (
        <SpeechBubble
          position={[bubbleSeat[0] * 0.78, 2.05, bubbleSeat[2] * 0.78]}
          name={bubble.name}
          color={bubble.color}
          text={bubble.text}
          bubbleKey={bubble.key}
          thinking={bubble.thinking}
        />
      )}

      <CameraRig
        focus={focus}
        autoRotate={variant === "lobby"}
        // 大厅右侧有 420px 信息面板：注视点右移，把桌面主体推到画面左侧可视区
        targetBiasX={variant === "lobby" ? 1.35 : 0}
      />

      <Preload all />
      </Canvas>
    </div>
  );
}
