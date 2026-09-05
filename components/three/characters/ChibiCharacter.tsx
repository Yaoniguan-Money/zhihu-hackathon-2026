"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import type { RoleEmotion, RolePublic, RoleStance } from "@/contracts/public";
import { personaForRole, type PersonaLook } from "./personas";

/**
 * 程序化 Q 版卡通角色：球体/胶囊装配 + Toon 着色 + 表情驱动。
 * 表情来源全部是公开契约字段：emotion / stance / speaking / pressure。
 * 所有动画在 useFrame 内用 ref 完成，不触发 React 重渲染。
 */

// 三阶明暗渐变图（模块级共享，所有 Toon 材质复用）。
let gradientMap: THREE.DataTexture | null = null;
function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    const steps = [0.45, 0.68, 0.88, 1].map((v) => Math.round(v * 255));
    gradientMap = new THREE.DataTexture(
      new Uint8Array(steps),
      steps.length,
      1,
      THREE.RedFormat,
    );
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

function ToonMaterial({
  color,
  opacity,
}: {
  color: string | THREE.Color;
  opacity?: number;
}) {
  return (
    <meshToonMaterial
      color={color}
      gradientMap={getGradientMap()}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  );
}

const INK = "#33283d";

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
  sway: number; // 身体摇摆幅度
}

const EMOTION_TABLE: Record<RoleEmotion, EmotionTarget> = {
  calm: { browAngle: 0, browLift: 0, smile: 0.9, blush: 0.2, sweat: 0, tremble: 0, sway: 1 },
  uneasy: { browAngle: -0.32, browLift: 0.012, smile: 0.25, blush: 0.34, sweat: 0.35, tremble: 0.0016, sway: 1.4 },
  defensive: { browAngle: 0.34, browLift: -0.008, smile: -0.2, blush: 0.28, sweat: 0.3, tremble: 0.0022, sway: 0.5 },
  agitated: { browAngle: 0.5, browLift: -0.014, smile: -0.45, blush: 0.5, sweat: 0.9, tremble: 0.005, sway: 2.2 },
};

export interface ChibiCharacterProps {
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

export default function ChibiCharacter({
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
}: ChibiCharacterProps) {
  const persona = useMemo(() => look ?? personaForRole(role), [look, role]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const browL = useRef<THREE.Mesh>(null);
  const browR = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const mouthOpen = useRef<THREE.Mesh>(null);
  const blushL = useRef<THREE.Mesh>(null);
  const blushR = useRef<THREE.Mesh>(null);
  const sweat = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  // 动画状态（逐帧向目标插值）。
  const anim = useRef({
    blink: 0,
    blinkTimer: 1.5 + Math.random() * 3,
    mouthOpen: 0,
    browAngle: 0,
    browLift: 0,
    smile: 0.9,
    blush: 0.2,
    sweat: 0,
    lookYaw: 0,
    lookYawTarget: 0,
    lookTimer: 2 + Math.random() * 3,
    gesture: null as GestureName | null,
    gestureT: 0,
    lastSeed: gestureSeed,
  });

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
    const eyeScaleY = 1 - 0.92 * lid;
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
      browL.current.rotation.z = -a.browAngle;
      browR.current.rotation.z = a.browAngle;
      browL.current.position.y = 0.115 + a.browLift;
      browR.current.position.y = 0.115 + a.browLift;
    }
    if (smile.current && mouthOpen.current) {
      const s = a.smile;
      const visibleSmile = Math.abs(s) > 0.12 ? 1 - a.mouthOpen * 0.9 : 0;
      smile.current.visible = visibleSmile > 0.05;
      (smile.current.material as THREE.MeshToonMaterial).opacity = visibleSmile;
      smile.current.rotation.z = Math.PI * 1.1 - s * Math.PI; // 正=底弧微笑，负=顶弧撇嘴
      smile.current.scale.setScalar(0.85 + s * 0.25);
      mouthOpen.current.visible = a.mouthOpen > 0.06;
      mouthOpen.current.scale.set(1, Math.max(0.02, a.mouthOpen * 0.95), 0.5);
    }
    for (const b of [blushL.current, blushR.current]) {
      if (b) (b.material as THREE.MeshToonMaterial).opacity = a.blush * 0.75;
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
          gLean = 0.22 * env;
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

    if (head.current) {
      head.current.rotation.y = a.lookYaw + gYaw;
      head.current.rotation.z = gTilt;
      head.current.rotation.x =
        Math.sin(t * (speaking ? 3.1 : 1.6)) * (speaking ? 0.05 : 0.02) + gNod;
      head.current.position.y = 1.06 + breath * 0.6;
    }
    if (body.current) {
      body.current.rotation.z = sway;
      body.current.rotation.x = gLean;
      body.current.position.y = 0.62 + breath * 0.25;
      body.current.position.x = Math.sin(t * 23) * tremble; // 压力颤抖
    }
    if (armL.current && armR.current) {
      const baseZ = 0.38 + gArm * 0.4;
      const talkWave = speaking ? Math.sin(t * 5.2) * 0.14 : 0;
      armL.current.rotation.z = baseZ + talkWave;
      armR.current.rotation.z = -baseZ - talkWave * 0.7;
      armL.current.rotation.x = -0.5 - gArm * 0.9;
      armR.current.rotation.x = -0.5 - gArm * 0.9;
    }
    if (ring.current) {
      ring.current.rotation.z += delta * 0.8;
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      ring.current.scale.set(pulse, pulse, 1);
    }
    if (root.current) {
      const selectPop = selected ? 1.06 : 1;
      root.current.scale.setScalar(
        root.current.scale.x + (scale * selectPop - root.current.scale.x) * lerp,
      );
    }
  });

  const interactable = typeof onClick === "function";
  const ink = INK;

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
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#ffb84d" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {withStool && (
        <group position={[0, 0, -0.08]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.24, 0.07, 24]} />
            <ToonMaterial color="#a9713f" />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.36, 12]} />
            <ToonMaterial color="#7c4f2a" />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.18, 0.2, 0.045, 24]} />
            <ToonMaterial color="#7c4f2a" />
          </mesh>
        </group>
      )}

      {/* —— 身体 —— */}
      <group ref={body} position={[0, 0.62, 0]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.2, 0.24, 8, 20]} />
          <ToonMaterial color={persona.outfit} />
          <Outlines thickness={0.012} color={ink} />
        </mesh>
        {/* 衣领 */}
        <mesh position={[0, 0.24, 0.02]} rotation={[0.25, 0, 0]}>
          <torusGeometry args={[0.13, 0.035, 10, 24]} />
          <ToonMaterial color={persona.outfitAccent} />
        </mesh>
        {persona.accessory === "press-card" && (
          <group position={[0.09, 0.06, 0.2]}>
            <mesh>
              <boxGeometry args={[0.09, 0.07, 0.012]} />
              <ToonMaterial color="#fdf8ec" />
            </mesh>
            <mesh position={[0, 0.016, 0.008]}>
              <boxGeometry args={[0.06, 0.014, 0.004]} />
              <ToonMaterial color="#d94f3d" />
            </mesh>
          </group>
        )}
        {persona.accessory === "bowtie" && (
          <group position={[0, 0.2, 0.19]}>
            <mesh rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.06, 0.06, 0.03]} />
              <ToonMaterial color={persona.outfitAccent} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]} position={[0.055, 0, 0]}>
              <boxGeometry args={[0.06, 0.06, 0.03]} />
              <ToonMaterial color={persona.outfitAccent} />
            </mesh>
            <mesh position={[-0.055, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
              <boxGeometry args={[0.06, 0.06, 0.03]} />
              <ToonMaterial color={persona.outfitAccent} />
            </mesh>
          </group>
        )}
        {persona.accessory === "scarf" && (
          <group position={[0, 0.14, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.17, 0.055, 10, 24]} />
              <ToonMaterial color={persona.outfitAccent} />
            </mesh>
            <mesh position={[0.08, -0.14, 0.12]} rotation={[0.2, 0.3, 0.1]}>
              <boxGeometry args={[0.09, 0.22, 0.035]} />
              <ToonMaterial color={persona.outfitAccent} />
            </mesh>
          </group>
        )}
        {persona.accessory === "necklace" && (
          <mesh position={[0, 0.16, 0.14]} rotation={[0.5, 0, 0]}>
            <torusGeometry args={[0.14, 0.012, 8, 24]} />
            <ToonMaterial color="#f2c94c" />
          </mesh>
        )}
        {persona.accessory === "lanyard" && (
          <group>
            <mesh position={[0.05, 0.1, 0.17]} rotation={[0, 0, 0.5]}>
              <boxGeometry args={[0.015, 0.22, 0.008]} />
              <ToonMaterial color="#4a4a5c" />
            </mesh>
            <mesh position={[-0.05, 0.1, 0.17]} rotation={[0, 0, -0.5]}>
              <boxGeometry args={[0.015, 0.22, 0.008]} />
              <ToonMaterial color="#4a4a5c" />
            </mesh>
            <mesh position={[0, -0.04, 0.2]}>
              <boxGeometry args={[0.11, 0.08, 0.012]} />
              <ToonMaterial color="#fdf8ec" />
            </mesh>
          </group>
        )}

        {/* —— 手臂 —— */}
        <group ref={armL} position={[-0.22, 0.16, 0.02]}>
          <mesh position={[0, -0.09, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.13, 6, 12]} />
            <ToonMaterial color={persona.outfit} />
          </mesh>
          <mesh position={[0, -0.21, 0]}>
            <sphereGeometry args={[0.06, 14, 14]} />
            <ToonMaterial color={persona.skin} />
          </mesh>
        </group>
        <group ref={armR} position={[0.22, 0.16, 0.02]}>
          <mesh position={[0, -0.09, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.13, 6, 12]} />
            <ToonMaterial color={persona.outfit} />
          </mesh>
          <mesh position={[0, -0.21, 0]}>
            <sphereGeometry args={[0.06, 14, 14]} />
            <ToonMaterial color={persona.skin} />
          </mesh>
        </group>
      </group>

      {/* —— 头部 —— */}
      <group ref={head} position={[0, 1.06, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 32, 32]} />
          <ToonMaterial color={persona.skin} />
          <Outlines thickness={0.014} color={ink} />
        </mesh>
        {/* 耳朵 */}
        <mesh position={[-0.3, -0.02, 0]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <ToonMaterial color={persona.skin} />
        </mesh>
        <mesh position={[0.3, -0.02, 0]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <ToonMaterial color={persona.skin} />
        </mesh>
        {/* 鼻子 */}
        <mesh position={[0, -0.045, 0.324]}>
          <sphereGeometry args={[0.016, 10, 10]} />
          <ToonMaterial color="#e8a87c" />
        </mesh>

        {/* 眼睛 */}
        <group ref={eyeL} position={[-0.115, 0.02, 0.305]}>
          <mesh scale={[1, 1.18, 0.65]}>
            <sphereGeometry args={[0.075, 18, 18]} />
            <meshStandardMaterial color="#ffffff" roughness={0.35} />
          </mesh>
          <mesh position={[0.008, -0.006, 0.048]}>
            <sphereGeometry args={[0.042, 14, 14]} />
            <meshStandardMaterial color="#33283d" roughness={0.2} />
          </mesh>
          <mesh position={[0.024, 0.022, 0.07]}>
            <sphereGeometry args={[0.013, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
        <group ref={eyeR} position={[0.115, 0.02, 0.305]}>
          <mesh scale={[1, 1.18, 0.65]}>
            <sphereGeometry args={[0.075, 18, 18]} />
            <meshStandardMaterial color="#ffffff" roughness={0.35} />
          </mesh>
          <mesh position={[-0.008, -0.006, 0.048]}>
            <sphereGeometry args={[0.042, 14, 14]} />
            <meshStandardMaterial color="#33283d" roughness={0.2} />
          </mesh>
          <mesh position={[0.024, 0.022, 0.07]}>
            <sphereGeometry args={[0.013, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>

        {/* 眉毛 */}
        <mesh ref={browL} position={[-0.115, 0.118, 0.284]}>
          <boxGeometry args={[0.085, 0.017, 0.02]} />
          <ToonMaterial color={persona.hair} />
        </mesh>
        <mesh ref={browR} position={[0.115, 0.118, 0.284]}>
          <boxGeometry args={[0.085, 0.017, 0.02]} />
          <ToonMaterial color={persona.hair} />
        </mesh>

        {/* 眼镜 */}
        {persona.glasses && (
          <group position={[0, 0.02, 0.318]}>
            <mesh position={[-0.115, 0, 0]}>
              <torusGeometry args={[0.062, 0.009, 8, 24]} />
              <ToonMaterial color="#3a3145" />
            </mesh>
            <mesh position={[0.115, 0, 0]}>
              <torusGeometry args={[0.062, 0.009, 8, 24]} />
              <ToonMaterial color="#3a3145" />
            </mesh>
            <mesh>
              <boxGeometry args={[0.07, 0.012, 0.012]} />
              <ToonMaterial color="#3a3145" />
            </mesh>
          </group>
        )}

        {/* 腮红 */}
        <mesh ref={blushL} position={[-0.185, -0.05, 0.262]} rotation={[0, -0.35, 0]}>
          <circleGeometry args={[0.038, 16]} />
          <meshBasicMaterial color="#ff9d9d" transparent opacity={0.2} />
        </mesh>
        <mesh ref={blushR} position={[0.185, -0.05, 0.262]} rotation={[0, 0.35, 0]}>
          <circleGeometry args={[0.038, 16]} />
          <meshBasicMaterial color="#ff9d9d" transparent opacity={0.2} />
        </mesh>

        {/* 嘴巴：微笑弧 + 开口（说话时互补显示） */}
        <mesh ref={smile} position={[0, -0.115, 0.302]}>
          <torusGeometry args={[0.05, 0.012, 8, 24, Math.PI * 0.8]} />
          <meshToonMaterial color={ink} gradientMap={getGradientMap()} transparent opacity={0.9} />
        </mesh>
        <mesh ref={mouthOpen} position={[0, -0.115, 0.296]} scale={[1, 0.02, 0.5]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#7a2e35" roughness={0.6} />
        </mesh>

        {/* 汗滴 */}
        <group ref={sweat} position={[0.26, 0.24, 0.14]} visible={false}>
          <mesh position={[0, 0.015, 0]}>
            <coneGeometry args={[0.02, 0.045, 10]} />
            <meshStandardMaterial color="#9fd8e8" roughness={0.2} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.024, 12, 12]} />
            <meshStandardMaterial color="#9fd8e8" roughness={0.2} transparent opacity={0.95} />
          </mesh>
        </group>

        {/* 头发与帽子 */}
        <HairAndHat look={persona} />
      </group>
    </group>
  );
}

function HairAndHat({ look }: { look: PersonaLook }) {
  const hair = look.hair;
  switch (look.hairStyle) {
    case "bob":
      return (
        <group>
          <mesh position={[0, 0.05, -0.02]} scale={[1.06, 1.02, 1.06]}>
            <sphereGeometry args={[0.33, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <ToonMaterial color={hair} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[-0.27, -0.1, -0.02]} scale={[0.5, 1.5, 0.9]}>
            <sphereGeometry args={[0.13, 14, 14]} />
            <ToonMaterial color={hair} />
          </mesh>
          <mesh position={[0.27, -0.1, -0.02]} scale={[0.5, 1.5, 0.9]}>
            <sphereGeometry args={[0.13, 14, 14]} />
            <ToonMaterial color={hair} />
          </mesh>
          <mesh position={[0, 0.14, 0.24]} rotation={[0.5, 0, 0]} scale={[1, 0.7, 0.6]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <ToonMaterial color={hair} />
          </mesh>
          {look.hat === "beret" && <Beret color={look.outfitAccent} />}
        </group>
      );
    case "bun":
      return (
        <group>
          <mesh position={[0, 0.05, -0.02]} scale={[1.05, 1, 1.05]}>
            <sphereGeometry args={[0.33, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <ToonMaterial color={hair} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[0, 0.32, -0.12]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <ToonMaterial color={hair} />
          </mesh>
          <mesh position={[0, 0.1, 0.26]} rotation={[0.45, 0, 0]} scale={[1, 0.55, 0.5]}>
            <sphereGeometry args={[0.21, 16, 16]} />
            <ToonMaterial color={hair} />
          </mesh>
          {look.hat !== "none" && <Beret color={look.outfitAccent} />}
        </group>
      );
    case "swept":
      return (
        <group>
          <mesh position={[0, 0.05, -0.02]} scale={[1.05, 1, 1.05]}>
            <sphereGeometry args={[0.33, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <ToonMaterial color={hair} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[0.02, 0.22, 0.2]} rotation={[0.3, 0, -0.35]} scale={[1.3, 0.5, 0.7]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <ToonMaterial color={hair} />
          </mesh>
          {look.hat !== "none" && <Beret color={look.outfitAccent} />}
        </group>
      );
    case "curly":
      return (
        <group>
          <mesh position={[0, 0.06, -0.02]}>
            <sphereGeometry args={[0.33, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
            <ToonMaterial color={hair} />
          </mesh>
          {[
            [-0.24, 0.2, 0.16],
            [-0.26, 0.24, -0.08],
            [-0.14, 0.3, -0.2],
            [0.14, 0.3, -0.2],
            [0.26, 0.24, -0.08],
            [0.24, 0.2, 0.16],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]}>
              <sphereGeometry args={[0.085, 12, 12]} />
              <ToonMaterial color={hair} />
            </mesh>
          ))}
          {look.hat === "beret" && <Beret color={look.outfitAccent} />}
        </group>
      );
    case "hood":
      return (
        <group>
          <mesh position={[0, 0.06, -0.1]} scale={[1.18, 1.05, 1.12]}>
            <sphereGeometry args={[0.33, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
            <ToonMaterial color={look.outfit} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[0, 0.1, 0.16]} rotation={[0.55, 0, 0]}>
            <torusGeometry args={[0.25, 0.042, 10, 28, Math.PI * 1.2]} />
            <ToonMaterial color={look.outfitAccent} />
          </mesh>
        </group>
      );
    case "short":
    default:
      return (
        <group>
          <mesh position={[0, 0.05, -0.02]} scale={[1.04, 1, 1.04]}>
            <sphereGeometry args={[0.33, 28, 28, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
            <ToonMaterial color={hair} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[0, 0.18, 0.24]} rotation={[0.4, 0, 0]} scale={[1, 0.5, 0.5]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <ToonMaterial color={hair} />
          </mesh>
          {look.beard && (
            <group>
              {[
                [-0.18, -0.16, 0.18],
                [-0.09, -0.22, 0.24],
                [0, -0.24, 0.26],
                [0.09, -0.22, 0.24],
                [0.18, -0.16, 0.18],
              ].map((p, i) => (
                <mesh key={i} position={p as [number, number, number]}>
                  <sphereGeometry args={[0.052, 10, 10]} />
                  <ToonMaterial color={hair} />
                </mesh>
              ))}
            </group>
          )}
          {look.hat !== "none" && <Beret color={look.outfitAccent} />}
        </group>
      );
  }
}

function Beret({ color }: { color: string }) {
  return (
    <group position={[0.04, 0.3, 0]} rotation={[0, 0, 0.22]}>
      <mesh scale={[1, 0.38, 1]}>
        <sphereGeometry args={[0.3, 20, 20]} />
        <ToonMaterial color={color} />
        <Outlines thickness={0.012} color={INK} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 8]} />
        <ToonMaterial color={color} />
      </mesh>
    </group>
  );
}
