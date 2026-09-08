"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { RoleEmotion, RolePublic, RoleStance } from "@/contracts/public";
import { personaForRole, PERSONA_PRESETS, type PersonaLook } from "./personas";

/**
 * Blender GLB 角色渲染器（art/blender 交付资产）。
 * 与 CastCharacter 同 props 接口，可互换：
 * - 坐姿通过骨骼程序化摆位实现（GLB 未内嵌坐姿动画，避免 NLA clip 覆盖骨骼）；
 * - 眨眼/口型走 morph target（Blink / MouthOpen），待机呼吸/手势走骨骼；
 * - 外观来源全部是公开契约字段：emotion / stance / speaking / pressure。
 */

const GLB_SLUGS = ["shen-qingwu", "ji-yunting", "a-lan", "he-xu", "liu-chengyin"] as const;
type GlbSlug = (typeof GLB_SLUGS)[number];

// 统一视觉高度（与原程序化角色 ~2.0 对齐，相机已按此调优）
const TARGET_HEIGHT = 2.0;
// 各 GLB 实测包围盒高度（exports/*.three-validation.json bounds）
const GLB_HEIGHT: Record<GlbSlug, number> = {
  "shen-qingwu": 2.4888,
  "ji-yunting": 2.4888,
  "a-lan": 2.3787,
  "he-xu": 2.5602,
  "liu-chengyin": 2.515,
};

// 坐姿由骨骼世界轴最短旋转计算（见组件内 swing），无需欧拉角参数。

function slugForLook(look?: PersonaLook): GlbSlug {
  if (look) {
    const idx = PERSONA_PRESETS.indexOf(look);
    if (idx >= 0) return GLB_SLUGS[idx];
  }
  return "shen-qingwu";
}

function slugForRole(role: RolePublic, look?: PersonaLook): GlbSlug {
  if (look) return slugForLook(look);
  return slugForLook(personaForRole(role));
}

const STANCE_GESTURE: Record<RoleStance, "nod" | "shake" | "leanFwd" | "tilt" | "shrug" | "wave"> = {
  answer: "nod",
  deny: "shake",
  challenge: "leanFwd",
  clarify: "tilt",
  evade: "shrug",
};

/** 选中指示环：呼吸脉冲实环 + 缓转缺口弧（比静态圆环更有"正在交谈"的指向性）。 */
function SelectionRing() {
  const pulse = useRef<THREE.Mesh>(null);
  const arc = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pulse.current) {
      const m = pulse.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + Math.sin(t * 2.6) * 0.25;
      pulse.current.scale.setScalar(1 + Math.sin(t * 2.6) * 0.03);
    }
    if (arc.current) arc.current.rotation.z = t * 0.9;
  });
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={pulse}>
        <ringGeometry args={[0.46, 0.55, 40]} />
        <meshBasicMaterial color="#ffb84d" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={arc} position={[0, 0, 0.004]}>
        <ringGeometry args={[0.6, 0.66, 40, 1, 0, Math.PI * 0.55]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

const EMOTION_TREMBLE: Record<RoleEmotion, number> = {
  calm: 0,
  uneasy: 0.0016,
  defensive: 0.0022,
  agitated: 0.005,
};

// 情绪姿态层：spine 后仰/前倾、头部低垂、呼吸速率——让情绪不止靠抖动表达
const EMOTION_POSE: Record<RoleEmotion, { lean: number; headDrop: number; breathRate: number; breathAmp: number }> = {
  calm: { lean: 0.02, headDrop: 0, breathRate: 2.1, breathAmp: 0.016 },
  uneasy: { lean: -0.03, headDrop: 0.03, breathRate: 2.8, breathAmp: 0.022 },
  defensive: { lean: -0.07, headDrop: 0.045, breathRate: 3.3, breathAmp: 0.028 },
  agitated: { lean: 0.06, headDrop: -0.02, breathRate: 4.2, breathAmp: 0.036 },
};

export interface GlbCharacterProps {
  role: RolePublic;
  look?: PersonaLook;
  position?: [number, number, number];
  rotationY?: number;
  emotion?: RoleEmotion;
  stance?: RoleStance;
  speaking?: boolean;
  pressure?: number;
  gestureSeed?: string;
  withStool?: boolean;
  selected?: boolean;
  onClick?: () => void;
  scale?: number;
}

export default function GlbCharacter({
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
}: GlbCharacterProps) {
  const slug = slugForRole(role, look);
  const { scene } = useGLTF(`/models/${slug}.glb`);

  const root = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  // 多实例必须各自克隆骨架（SkeletonUtils），且后续骨骼/形变操作都作用在这个渲染实例上
  const instance = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  const rig = useRef({
    blinkTargets: [] as THREE.Mesh[],
    mouthTargets: [] as THREE.Mesh[],
    bones: {} as Record<string, THREE.Object3D | undefined>,
    restQ: {} as Record<string, THREE.Quaternion>,
    blink: 0,
    blinkTimer: 2.5,
    mouth: 0,
    lookYaw: 0,
    lookYawTarget: 0,
    lookTimer: 3,
    gesture: null as null | "nod" | "shake" | "leanFwd" | "tilt" | "shrug" | "wave",
    gestureT: 0,
    gestureIdle: false,
    lastSeed: gestureSeed,
    randomized: false,
    idleLeanZ: 0,
    idleLeanX: 0,
    idleHeadZ: 0,
  });

  // 实例就绪后：收集 morph 网格与骨骼，应用坐姿，关闭视锥剔除（骨骼动画边界盒会漂移）
  useEffect(() => {
    if (!instance) return;
    const r = rig.current;
    r.blinkTargets = [];
    r.mouthTargets = [];
    instance.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      const dict = mesh.morphTargetDictionary;
      if (dict && mesh.morphTargetInfluences) {
        if ("Blink" in dict) r.blinkTargets.push(mesh);
        if ("MouthOpen" in dict) r.mouthTargets.push(mesh);
      }
    });
    const names = [
      "Pelvis",
      "Spine_01",
      "Spine_02",
      "Chest",
      "Neck",
      "Head",
      "Clavicle_L",
      "Clavicle_R",
      "UpperArm_L",
      "UpperArm_R",
      "ForeArm_L",
      "ForeArm_R",
      "UpperLeg_L",
      "UpperLeg_R",
      "LowerLeg_L",
      "LowerLeg_R",
      "Foot_L",
      "Foot_R",
    ];
    r.bones = {};
    for (const n of names) r.bones[n] = instance.getObjectByName(n);
    // 记录动画涉及骨骼的静息四元数：动画=静息 × 附加旋转，绝不清零静息姿态
    // （直接写 rotation 会把手臂覆写成 T-pose，是"手部扭曲"的根源）
    r.restQ = {};
    for (const n of [
      "Spine_01",
      "Spine_02",
      "Chest",
      "Neck",
      "Head",
      "Clavicle_L",
      "Clavicle_R",
      "UpperArm_R",
      "ForeArm_R",
    ]) {
      const b = r.bones[n];
      if (b) r.restQ[n] = b.quaternion.clone();
    }
    if (!r.randomized) {
      r.randomized = true;
      r.blinkTimer = 1.5 + Math.random() * 3;
      r.lookTimer = 2 + Math.random() * 3;
      // 每个角色一份随机微姿态，消除整齐划一的僵硬感
      r.idleLeanZ = (Math.random() - 0.5) * 0.06;
      r.idleLeanX = Math.random() * 0.035;
      r.idleHeadZ = (Math.random() - 0.5) * 0.09;
    }
  }, [instance]);

  // 坐姿：把大腿方向从"下垂"转到"正前"、小腿回到"下垂"，整体下沉到凳面。
  // 骨骼带 roll，直接改 rotation.x 会扫出锥面；这里按世界轴最短旋转计算四元数，自动补偿。
  useEffect(() => {
    if (!instance) return;
    instance.updateMatrixWorld(true);
    const iq = new THREE.Quaternion();
    instance.getWorldQuaternion(iq);
    const iqInv = iq.clone().invert();
    // 对象在角色空间下的四元数
    const relQ = (obj: THREE.Object3D) => {
      const wq = new THREE.Quaternion();
      obj.getWorldQuaternion(wq);
      return iqInv.clone().multiply(wq);
    };
    const swing = (bone: THREE.Object3D, targetDir: THREE.Vector3) => {
      const parentQ = relQ(bone.parent!).clone();
      const boneQ = relQ(bone).clone();
      const d0 = new THREE.Vector3(0, 1, 0).applyQuaternion(boneQ).normalize();
      const d1 = targetDir.clone().normalize();
      const axis = new THREE.Vector3().crossVectors(d0, d1);
      if (axis.lengthSq() < 1e-8) return;
      const angle = Math.acos(THREE.MathUtils.clamp(d0.dot(d1), -1, 1));
      const qDelta = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), angle);
      // 世界(角色空间)旋转 → 该骨骼的父空间局部旋转，再前乘
      const qLocal = parentQ.clone().invert().multiply(qDelta).multiply(parentQ);
      bone.quaternion.premultiply(qLocal);
      instance.updateMatrixWorld(true);
    };
    const b = (n: string) => instance.getObjectByName(n);
    for (const side of ["L", "R"] as const) {
      const thigh = b(`UpperLeg_${side}`);
      const shin = b(`LowerLeg_${side}`);
      if (withStool) {
        if (thigh) swing(thigh, new THREE.Vector3(0, 0.05, 1)); // 大腿抬平略沉
        if (shin) swing(shin!, new THREE.Vector3(0, -1, 0.08)); // 小腿垂到地面
      } else {
        if (thigh) thigh.quaternion.identity();
        if (shin) shin.quaternion.identity();
      }
    }
    if (inner.current) {
      const modelScale = TARGET_HEIGHT / GLB_HEIGHT[slug];
      // GLB 髋骨在模型空间 y≈1.1；凳面 0.475+软垫 ≈ 0.495
      inner.current.position.y = withStool ? 0.495 - 1.1 * modelScale : 0;
    }
  }, [instance, withStool, slug]);

  useEffect(() => {
    if (gestureSeed && rig.current.lastSeed !== gestureSeed) {
      rig.current.lastSeed = gestureSeed;
      rig.current.gesture = STANCE_GESTURE[stance];
      rig.current.gestureT = 0;
    }
  }, [gestureSeed, stance]);

  useFrame((state, delta) => {
    const r = rig.current;
    const t = state.clock.elapsedTime;
    const lerp = 1 - Math.pow(0.0018, delta);
    const pressureBoost = Math.max(0, (pressure - 40) / 60);
    const tremble = EMOTION_TREMBLE[emotion] + pressureBoost * 0.004;

    // —— 眨眼（morph）——
    r.blinkTimer -= delta;
    if (r.blinkTimer <= 0) {
      r.blinkTimer = 2.2 + Math.random() * 3.4;
      r.blink = 1;
    }
    r.blink = Math.max(0, r.blink - delta * 7);
    const lid = r.blink > 0 ? Math.sin(Math.min(1, r.blink) * Math.PI) : 0;
    for (const m of r.blinkTargets) {
      const idx = m.morphTargetDictionary?.["Blink"];
      // eslint-disable-next-line react-hooks/immutability -- 逐帧驱动 three.js morph 权重
      if (idx !== undefined) m.morphTargetInfluences![idx] = lid;
    }

    // —— 口型（morph）：短语化包络，避免机械匀速开合 ——
    // gate 在 0.15~1 间以"说话-停顿"节奏起伏，模拟分句换气
    const phraseGate = 0.575 + 0.425 * Math.sin(t * 2.3) * Math.sin(t * 3.7 + 1.3);
    const talk = speaking ? (0.25 + Math.abs(Math.sin(t * 9.5)) * 0.75) * (0.35 + 0.65 * phraseGate) : 0;
    r.mouth += (talk - r.mouth) * lerp;
    for (const m of r.mouthTargets) {
      const idx = m.morphTargetDictionary?.["MouthOpen"];
      if (idx !== undefined) m.morphTargetInfluences![idx] = r.mouth;
    }

    // —— 待机张望 ——
    r.lookTimer -= delta;
    if (r.lookTimer <= 0) {
      r.lookTimer = 2.6 + Math.random() * 3.4;
      r.lookYawTarget = (Math.random() - 0.5) * (speaking ? 0.16 : 0.4);
    }
    r.lookYaw += (r.lookYawTarget - r.lookYaw) * lerp * 0.5;

    // —— 手势包络 ——
    let gNod = 0;
    let gYaw = 0;
    let gTilt = 0;
    let gLean = 0;
    let gArm = 0;
    if (r.gesture) {
      r.gestureT += delta;
      const p = Math.min(1, r.gestureT / 1.15);
      const env = Math.sin(Math.min(1, p) * Math.PI);
      switch (r.gesture) {
        case "nod":
          gNod = Math.sin(p * Math.PI * 3) * 0.14 * env;
          break;
        case "shake":
          gYaw = Math.sin(p * Math.PI * 4) * 0.3 * env;
          break;
        case "leanFwd":
          gLean = 0.14 * env;
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
      if (p >= 1) r.gesture = null;
    } else if (speaking && Math.random() < delta * 0.25) {
      r.gesture = Math.random() < 0.5 ? "tilt" : "nod";
      r.gestureT = 0;
    } else if (!speaking && Math.random() < delta * 0.06) {
      // 待机微动作：非说话角色偶发小点头/歪头（8~16s 一次的量级），消除静止感
      r.gesture = Math.random() < 0.6 ? "tilt" : "nod";
      r.gestureT = 0;
      r.gestureIdle = true;
    }
    const idleGestureScale = r.gestureIdle ? 0.4 : 1;
    if (r.gesture && r.gestureT >= 1.2) r.gestureIdle = false;
    gNod *= idleGestureScale;
    gYaw *= idleGestureScale;
    gTilt *= idleGestureScale;
    gLean *= idleGestureScale;
    gArm *= idleGestureScale;

    const ePose = EMOTION_POSE[emotion];
    const breath = Math.sin(t * (speaking ? ePose.breathRate + 2.2 : ePose.breathRate)) * (speaking ? 0.03 : ePose.breathAmp);

    // 动画 = 静息四元数 × 附加小旋转（绝不覆写静息姿态）
    const _e = new THREE.Euler();
    const _q = new THREE.Quaternion();
    const pose = (name: string, x: number, y: number, z: number) => {
      const b = r.bones[name];
      const q0 = r.restQ[name];
      if (!b || !q0) return;
      _e.set(x, y, z);
      _q.setFromEuler(_e);
      b.quaternion.copy(q0).multiply(_q);
    };

    pose("Head", Math.sin(t * (speaking ? 3.1 : 1.6)) * (speaking ? 0.05 : 0.02) + gNod + ePose.headDrop, r.lookYaw + gYaw, gTilt + r.idleHeadZ);
    pose("Neck", ePose.headDrop * 0.5, r.lookYaw * 0.4, r.idleHeadZ * 0.4);
    pose("Chest", 0.05 + r.idleLeanX + breath * 0.6 + gLean * 0.5 + ePose.lean * 0.6, 0, Math.sin(t * 1.15) * 0.02 + r.idleLeanZ);
    pose("Spine_01", gLean + 0.02 + ePose.lean * 0.4, 0, Math.sin(t * 1.15 + 0.8) * 0.015 + r.idleLeanZ * 0.5);
    pose("UpperArm_R", -gArm * 0.8, 0, -gArm * 0.25);
    pose("ForeArm_R", -gArm * 1.1 - (speaking ? Math.sin(t * 5.2) * 0.08 : 0) - 0.08, 0, 0);
    pose("Clavicle_L", 0, 0, gArm * 0.1);
    pose("Clavicle_R", 0, 0, -gArm * 0.1);

    if (root.current) {
      const base = root.current.scale.x || 1;
      const selectPop = selected ? 1.05 : 1;
      root.current.scale.setScalar(base + (scale * selectPop - base) * lerp);
      root.current.position.x =
        position[0] + (tremble > 0 ? Math.sin(t * 23) * tremble : 0);
      root.current.position.z = position[2];
    }
  });

  const interactable = typeof onClick === "function";
  const modelScale = (TARGET_HEIGHT / GLB_HEIGHT[slug]) * scale;

  return (
    <group
      ref={root}
      position={position}
      rotation={[0, rotationY, 0]}
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
        <SelectionRing />
      )}
      {withStool && (
        <group position={[0, 0, -0.06]}>
          {/* 凳面软垫（与原程序化角色同规格） */}
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
      <group ref={inner}>
        <primitive object={instance} scale={modelScale} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/shen-qingwu.glb");
