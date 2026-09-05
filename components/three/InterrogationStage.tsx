"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Preload } from "@react-three/drei";
import ChibiCharacter from "./characters/ChibiCharacter";
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

const SEAT_RADIUS = 2.6;

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
      camera={{ position: [0, 8.5, 11.5], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true }}
      className={className}
    >
      <color attach="background" args={["#191631"]} />
      <fog attach="fog" args={["#191631", 11, 20]} />
      <ambientLight intensity={0.55} color="#8f8ac2" />
      <hemisphereLight args={["#5d5a8c", "#241f38", 0.5]} />
      <directionalLight position={[6, 7, 4]} intensity={0.35} color="#9fb0ff" />

      <InterrogationRoom />

      {roles.map((state, i) => {
        const { position, rotationY } = seatTransform(i, roles.length);
        return (
          <ChibiCharacter
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
          position={[bubbleSeat[0], 2.0, bubbleSeat[2]]}
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
