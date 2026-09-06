"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RoleEmotion, RolePublic, RoleStance } from "@/contracts/public";
import { personaForRole, type PersonaLook } from "./personas";
import { HeadBase, Eye, Brow, Mouth, FACE } from "./face";
import { HairAndExtras } from "./hair";
import { Outfit } from "./outfits";

/**
 * 盲盒风角色装配：官方立绘的 3D 还原。
 * 表情来源全部是公开契约字段：emotion / stance / speaking / pressure。
 * 所有动画在 useFrame 内用 ref 完成，不触发 React 重渲染。
 */

const INK = "#3a2721";

// 体格布局：站姿脚底在 y≈0；坐姿放在凳上（凳面 0.44）。
const HIP_STAND = 0.62;
const HIP_SIT = 0.55;
const HEAD_OFFSET = 0.95; // 头中心相对髋部

export type GestureName = "nod" | "shake" | "leanFwd" | "tilt" | "shrug" | "wave";

const STANCE_GESTURE: Record<RoleStance, GestureName> = {
  answer: "nod",
  deny: "shake",
  challenge: "leanFwd",
  clarify: "tilt",
  evade: "shrug",
};

interface EmotionTarget {
  browAngle: number; // 内外压：正=皱眉，负=担心上挑
  browLift: number;
  smile: number; // 1=微笑 0=平嘴 负=撇嘴
  blush: number;
  sweat: number;
  tremble: number;
  sway: number;
}

const EMOTION_TABLE: Record<RoleEmotion, EmotionTarget> = {
  calm: { browAngle: 0, browLift: 0, smile: 0.9, blush: 0.2, sweat: 0, tremble: 0, sway: 1 },
  uneasy: { browAngle: -0.32, browLift: 0.012, smile: 0.25, blush: 0.34, sweat: 0.35, tremble: 0.0016, sway: 1.4 },
  defensive: { browAngle: 0.34, browLift: -0.008, smile: -0.2, blush: 0.28, sweat: 0.3, tremble: 0.0022, sway: 0.5 },
  agitated: { browAngle: 0.5, browLift: -0.014, smile: -0.45, blush: 0.5, sweat: 0.9, tremble: 0.005, sway: 2.2 },
};

export interface CastCharacterProps {
  role: RolePublic;
  look?: PersonaLook;
  position?: [number, number, number];
  rotationY?: number;
  emotion?: RoleEmotion;
  stance?: RoleStance;
  speaking?: boolean;
  pressure?: number;
  /** 每次变化触发一次姿态手势（用 message_id 作种子）。 */
  gestureSeed?: string;
  withStool?: boolean;
  selected?: boolean;
  onClick?: () => void;
  scale?: number;
}

export default function CastCharacter({
  role,
  look,
  position = [0, 0, 0],
  rotationY = 0,
  emotion = "calm",
  stance = "answer",
  speaking = false,
  pressure = 20,
  gestureSeed,
  withStool = true,
  selected = false,
  onClick,
  scale = 1,
}: CastCharacterProps) {
  const persona = useMemo(() => look ?? personaForRole(role), [look, role]);
  const sitting = withStool;
  const hipY = sitting ? HIP_SIT : HIP_STAND;
  const headY = hipY + HEAD_OFFSET;

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const browL = useRef<THREE.Group>(null);
  const browR = useRef<THREE.Group>(null);
  const smile = useRef<THREE.Mesh>(null);
  const mouthOpen = useRef<THREE.Mesh>(null);
  const blushL = useRef<THREE.Mesh>(null);
  const blushR = useRef<THREE.Mesh>(null);
  const sweat = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  // 动画状态（逐帧向目标插值）。随机初值延迟到挂载 effect，保证渲染纯度。
  const anim = useRef({
    blink: 0,
    blinkTimer: 2.5,
    mouthOpen: 0,
    browAngle: 0,
    browLift: 0,
    smile: 0.9,
    blush: 0.2,
    sweat: 0,
    lookYaw: 0,
    lookYawTarget: 0,
    lookTimer: 3,
    gesture: null as GestureName | null,
    gestureT: 0,
    lastSeed: gestureSeed,
  });

  const randomizeTimers = useRef(false);
  useEffect(() => {
    if (!randomizeTimers.current) {
      randomizeTimers.current = true;
      anim.current.blinkTimer = 1.5 + Math.random() * 3;
      anim.current.lookTimer = 2 + Math.random() * 3;
    }
  }, []);

  useEffect(() => {
    if (gestureSeed && anim.current.lastSeed !== gestureSeed) {
      anim.current.lastSeed = gestureSeed;
      anim.current.gesture = STANCE_GESTURE[stance];
      anim.current.gestureT = 0;
    }
  }, [gestureSeed, stance]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    const target = EMOTION_TABLE[emotion];
    const lerp = 1 - Math.pow(0.0018, delta); // 帧率无关平滑
    const pressureBoost = Math.max(0, (pressure - 40) / 60);

    // —— 眨眼 ——
    a.blinkTimer -= delta;
    if (a.blinkTimer <= 0) {
      a.blinkTimer = 2.2 + Math.random() * 3.4;
      a.blink = 1;
    }
    a.blink = Math.max(0, a.blink - delta * 7);
    const lid = a.blink > 0 ? Math.sin(Math.min(1, a.blink) * Math.PI) : 0;
    const eyeScaleY = 1 - 0.9 * lid;
    eyeL.current?.scale.setY(eyeScaleY);
    eyeR.current?.scale.setY(eyeScaleY);

    // —— 说话口型 + 头部律动 ——
    const talkMouth = speaking ? 0.25 + Math.abs(Math.sin(t * 9.5)) * 0.75 : 0;
    a.mouthOpen += (talkMouth - a.mouthOpen) * lerp;

    // —— 表情目标 ——
    a.browAngle += (target.browAngle - a.browAngle) * lerp;
    a.browLift += (target.browLift - a.browLift) * lerp;
    const smileTarget = speaking ? Math.max(target.smile, 0.35) : target.smile;
    a.smile += (smileTarget - a.smile) * lerp;
    a.blush += (Math.max(target.blush + pressureBoost * 0.25, target.blush) - a.blush) * lerp;
    a.sweat += (Math.min(1, target.sweat + pressureBoost) - a.sweat) * lerp;

    if (browL.current && browR.current) {
      browL.current.rotation.z = a.browAngle;
      browR.current.rotation.z = -a.browAngle;
      browL.current.position.y = FACE.browY + a.browLift;
      browR.current.position.y = FACE.browY + a.browLift;
    }
    if (smile.current && mouthOpen.current) {
      const s = a.smile;
      const visibleSmile = Math.abs(s) > 0.12 ? 1 - a.mouthOpen * 0.9 : 0;
      smile.current.visible = visibleSmile > 0.05;
      (smile.current.material as THREE.MeshStandardMaterial).opacity = visibleSmile * 0.95;
      smile.current.rotation.z = Math.PI * 1.1 - s * Math.PI;
      smile.current.scale.set(0.85 + s * 0.25, 0.62 * (0.85 + s * 0.25), 1);
      mouthOpen.current.visible = a.mouthOpen > 0.06;
      mouthOpen.current.scale.set(1, Math.max(0.02, a.mouthOpen * 0.95), 0.45);
    }
    for (const b of [blushL.current, blushR.current]) {
      if (b) (b.material as THREE.MeshBasicMaterial).opacity = a.blush * 0.6;
    }
    if (sweat.current) {
      const pop = Math.max(0, a.sweat - 0.25) / 0.75;
      const drip = (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.04;
      sweat.current.visible = pop > 0.03;
      sweat.current.scale.setScalar(Math.max(0.001, pop));
      sweat.current.position.y = 0.24 - drip;
    }

    // —— 头部：待机张望 / 手势 / 说话点头 ——
    a.lookTimer -= delta;
    if (a.lookTimer <= 0) {
      a.lookTimer = 2.6 + Math.random() * 3.4;
      a.lookYawTarget = (Math.random() - 0.5) * (speaking ? 0.16 : 0.4);
    }
    a.lookYaw += (a.lookYawTarget - a.lookYaw) * lerp * 0.5;

    let gNod = 0;
    let gYaw = 0;
    let gTilt = 0;
    let gLean = 0;
    let gArm = 0;
    if (a.gesture) {
      a.gestureT += delta;
      const p = Math.min(1, a.gestureT / 1.15);
      const env = Math.sin(Math.min(1, p) * Math.PI); // 包络
      switch (a.gesture) {
        case "nod":
          gNod = Math.sin(p * Math.PI * 3) * 0.14 * env;
          break;
        case "shake":
          gYaw = Math.sin(p * Math.PI * 4) * 0.3 * env;
          break;
        case "leanFwd":
          gLean = 0.18 * env;
          gArm = 0.5 * env;
          break;
        case "tilt":
          gTilt = 0.3 * env;
          gArm = 0.7 * env;
          break;
        case "shrug":
          gArm = 1.1 * env;
          gTilt = -0.12 * env;
          break;
        case "wave":
          gArm = 1.6 * Math.sin(p * Math.PI * 3) * env;
          break;
      }
      if (p >= 1) a.gesture = null;
    } else if (speaking && Math.random() < delta * 0.25) {
      a.gesture = Math.random() < 0.5 ? "tilt" : "nod";
      a.gestureT = 0;
    }

    const breath = Math.sin(t * (speaking ? 4.6 : 2.1)) * (speaking ? 0.028 : 0.016) * target.sway;
    const sway = Math.sin(t * 1.15) * 0.02 * target.sway;
    const tremble = target.tremble + pressureBoost * 0.004;

    // 双手捧物角色手臂摆幅收小
    const armAmp = persona.holdFront ? 0.3 : 1;
    const armBaseZ = persona.holdFront ? 0.1 : 0.26;
    const armBaseX = persona.holdFront ? -1.18 : -0.32;

    if (head.current) {
      head.current.rotation.y = a.lookYaw + gYaw;
      head.current.rotation.z = gTilt;
      head.current.rotation.x =
        Math.sin(t * (speaking ? 3.1 : 1.6)) * (speaking ? 0.05 : 0.02) + gNod;
      head.current.position.y = headY + breath * 0.6;
    }
    if (body.current) {
      body.current.rotation.z = sway;
      body.current.rotation.x = gLean;
      body.current.position.y = hipY + breath * 0.25;
      body.current.position.x = Math.sin(t * 23) * tremble; // 压力颤抖
    }
    if (armL.current && armR.current) {
      const talkWave = speaking ? Math.sin(t * 5.2) * 0.1 * armAmp : 0;
      armL.current.rotation.z = armBaseZ + gArm * 0.4 * armAmp + talkWave;
      armR.current.rotation.z = -armBaseZ - gArm * 0.4 * armAmp - talkWave * 0.7;
      armL.current.rotation.x = armBaseX - gArm * 0.9 * armAmp;
      armR.current.rotation.x = armBaseX - gArm * 0.9 * armAmp;
    }
    if (ring.current) {
      ring.current.rotation.z += delta * 0.8;
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      ring.current.scale.set(pulse, pulse, 1);
    }
    if (root.current) {
      const selectPop = selected ? 1.05 : 1;
      root.current.scale.setScalar(
        root.current.scale.x + (scale * selectPop - root.current.scale.x) * lerp,
      );
    }
  });

  const interactable = typeof onClick === "function";

  return (
    <group
      ref={root}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      onClick={
        interactable
          ? (e) => {
              e.stopPropagation();
              onClick?.();
            }
          : undefined
      }
      onPointerOver={
        interactable
          ? (e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        interactable
          ? () => {
              document.body.style.cursor = "auto";
            }
          : undefined
      }
    >
      {selected && (
        <mesh ref={ring} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.46, 0.55, 40]} />
          <meshBasicMaterial color="#ffb84d" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {withStool && (
        <group position={[0, 0, -0.06]}>
          {/* 凳面软垫 */}
          <mesh position={[0, 0.435, 0]} castShadow>
            <cylinderGeometry args={[0.27, 0.25, 0.07, 24]} />
            <meshStandardMaterial color="#8a5a34" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.472, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.012, 24]} />
            <meshStandardMaterial color="#a97446" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.05, 0.075, 0.4, 12]} />
            <meshStandardMaterial color="#5f3d22" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.2, 0.22, 0.04, 24]} />
            <meshStandardMaterial color="#5f3d22" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* —— 身体 —— */}
      <group ref={body} position={[0, hipY, 0]}>
        <Outfit look={persona} sitting={sitting} armLRef={armL} armRRef={armR} />
      </group>

      {/* —— 头部 —— */}
      <group ref={head} position={[0, headY, 0]}>
        <HeadBase skin={persona.skin} />

        <Eye side={-1} iris={persona.eye} lash={persona.hairDark} groupRef={eyeL} />
        <Eye side={1} iris={persona.eye} lash={persona.hairDark} groupRef={eyeR} />
        <Brow side={-1} color={persona.hairDark} groupRef={browL} />
        <Brow side={1} color={persona.hairDark} groupRef={browR} />
        <Mouth ink={INK} smileRef={smile} openRef={mouthOpen} />

        {/* 腮红（透明度由情绪驱动） */}
        <mesh ref={blushL} position={[-0.252, FACE.blushY, FACE.blushZ]} rotation={[0, -0.62, 0.12]}>
          <circleGeometry args={[0.048, 18]} />
          <meshBasicMaterial color={persona.blush} transparent opacity={0.2} />
        </mesh>
        <mesh ref={blushR} position={[0.252, FACE.blushY, FACE.blushZ]} rotation={[0, 0.62, -0.12]}>
          <circleGeometry args={[0.048, 18]} />
          <meshBasicMaterial color={persona.blush} transparent opacity={0.2} />
        </mesh>

        {/* 汗滴 */}
        <group ref={sweat} position={[0.27, 0.24, 0.16]} visible={false}>
          <mesh position={[0, 0.015, 0]}>
            <coneGeometry args={[0.02, 0.045, 10]} />
            <meshStandardMaterial color="#9fd8e8" roughness={0.2} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.024, 12, 12]} />
            <meshStandardMaterial color="#9fd8e8" roughness={0.2} transparent opacity={0.95} />
          </mesh>
        </group>

        {/* 耳饰 */}
        {persona.props.includes("earrings") &&
          [-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.415, -0.08, 0.02]}>
              <sphereGeometry args={[0.016, 10, 10]} />
              <meshStandardMaterial color="#e3bc6e" roughness={0.3} metalness={0.8} />
            </mesh>
          ))}

        <HairAndExtras look={persona} />
      </group>
    </group>
  );
}
