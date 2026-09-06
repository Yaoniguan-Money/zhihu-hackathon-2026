"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, Preload } from "@react-three/drei";
import CastCharacter from "./characters/CastCharacter";
import InterrogationRoom from "./scene/InterrogationRoom";
import CameraRig from "./CameraRig";
import SpeechBubble from "./SpeechBubble";
import { personaForRole } from "./characters/personas";
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

  const bubbleSeat = useMemo(() => {
    if (!bubble) return null;
    const idx = roles.findIndex((r) => r.role.role_id === bubble.roleId);
    if (idx < 0) return null;
    return seatTransform(idx, roles.length).position;
  }, [bubble, roles]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 7.8, 10.8], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true }}
      className={className}
    >
      <color attach="background" args={["#171430"]} />
      <fog attach="fog" args={["#171430", 11, 20]} />

      {/* 基础夜色光 */}
      <ambientLight intensity={0.5} color="#8f8ac2" />
      <hemisphereLight args={["#5d5a8c", "#2a2038", 0.55]} />
      {/* 面部补光：暖色正面软光，保证表情可读 */}
      <directionalLight position={[2.5, 4.5, 6.5]} intensity={0.9} color="#ffe7c4" />
      {/* 窗侧冷色轮廓光 */}
      <directionalLight position={[-4, 3, -5]} intensity={0.35} color="#7f9bff" />

      {/* 程序化环境反射（无网络依赖） */}
      <Environment resolution={64} frames={1} background={false}>
        <Lightformer intensity={0.7} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} color="#fff4e0" />
        <Lightformer intensity={0.35} position={[-5, 1, -1]} scale={[6, 3, 1]} rotation-y={Math.PI / 2} color="#8890ff" />
        <Lightformer intensity={0.3} position={[5, 2, 1]} scale={[6, 3, 1]} rotation-y={-Math.PI / 2} color="#ffd9a0" />
      </Environment>

      <InterrogationRoom />

      {roles.map((state, i) => {
        const { position, rotationY } = seatTransform(i, roles.length);
        return (
          <CastCharacter
            key={state.role.role_id}
            role={state.role}
            look={personaForRole(state.role)}
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

      <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={12} blur={2.4} far={2.4} color="#120f1e" />

      {bubble && bubbleSeat && (
        <SpeechBubble
          position={[bubbleSeat[0], 2.35, bubbleSeat[2]]}
          name={bubble.name}
          color={bubble.color}
          text={bubble.text}
          bubbleKey={bubble.key}
          thinking={bubble.thinking}
        />
      )}

      <CameraRig focus={focus} autoRotate={variant === "lobby"} />

      <Preload all />
    </Canvas>
  );
}
