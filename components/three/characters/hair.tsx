"use client";

import type { ReactNode } from "react";
import type { PersonaLook } from "./personas";
import { Lock } from "./face";

/**
 * 五套发型 + 面部附加物，逐一对照官方立绘：
 * - bob          沈青梧：齐颌波波头 + 帘式刘海 + 两侧垂发
 * - tousledBob   纪云汀：利落短发 + 碎刘海 + 一侧收耳后
 * - messy        阿岚：蓬乱上抓短发 + 前刺
 * - swept        何叙：银灰大背头 + 络腮胡
 * - curly        柳成荫：紫色卷发蓬蓬 + 贝雷帽
 * 发际线规则：帽冠整体后倾，前缘必须 ≥ y0.18（眉在 y0.158 之上），
 * 额头/眼睛区域完全开放——这是旧版「头发盖脸」问题的根源修复。
 */

function Cap({ color, scale = 1.05, tilt = -0.5 }: { color: string; scale?: number; tilt?: number }) {
  return (
    <mesh position={[0, 0.03, -0.01]} rotation={[tilt, 0, 0]} scale={[scale, scale * 1.02, scale * 1.05]} castShadow>
      <sphereGeometry args={[0.434, 40, 28, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

function BobHair({ hair }: { hair: string }) {
  return (
    <group>
      <Cap color={hair} />
      {/* 后脑勺垂发到下颌 */}
      <Lock p={[0, -0.08, -0.16]} s={[0.78, 0.66, 0.5]} color={hair} />
      {/* 两侧垂发（贴面框住脸，不外翻） */}
      <Lock p={[-0.35, -0.18, 0.04]} s={[0.11, 0.5, 0.27]} r={[0, 0.1, 0.03]} color={hair} />
      <Lock p={[0.35, -0.18, 0.04]} s={[0.11, 0.5, 0.27]} r={[0, -0.1, -0.03]} color={hair} />
      {/* 帘式刘海：中偏分，发尾在眉上 */}
      <Lock p={[-0.2, 0.37, 0.24]} s={[0.25, 0.19, 0.13]} r={[0.12, 0.25, 0.3]} color={hair} />
      <Lock p={[0.0, 0.41, 0.28]} s={[0.19, 0.15, 0.12]} r={[0.08, 0.05, -0.12]} color={hair} />
      <Lock p={[0.18, 0.39, 0.27]} s={[0.19, 0.17, 0.12]} r={[0.1, -0.15, -0.28]} color={hair} />
      <Lock p={[0.33, 0.34, 0.2]} s={[0.16, 0.23, 0.13]} r={[0.12, -0.3, -0.44]} color={hair} />
      <Lock p={[-0.33, 0.35, 0.2]} s={[0.15, 0.21, 0.12]} r={[0.12, 0.3, 0.42]} color={hair} />
    </group>
  );
}

function TousledBobHair({ hair }: { hair: string }) {
  return (
    <group>
      <Cap color={hair} scale={1.035} />
      <Lock p={[0, -0.06, -0.16]} s={[0.74, 0.56, 0.48]} color={hair} />
      <Lock p={[-0.36, -0.1, 0.06]} s={[0.14, 0.42, 0.32]} r={[0, 0.12, 0.06]} color={hair} />
      {/* 右侧收耳后 */}
      <Lock p={[0.375, -0.02, 0.05]} s={[0.12, 0.3, 0.3]} r={[0, -0.18, -0.14]} color={hair} />
      {/* 碎刘海 */}
      <Lock p={[-0.22, 0.37, 0.22]} s={[0.22, 0.22, 0.13]} r={[0.14, 0.28, 0.45]} color={hair} />
      <Lock p={[-0.02, 0.41, 0.27]} s={[0.19, 0.17, 0.12]} r={[0.1, 0.1, -0.18]} color={hair} />
      <Lock p={[0.16, 0.39, 0.26]} s={[0.18, 0.16, 0.12]} r={[0.1, -0.12, 0.22]} color={hair} />
      <Lock p={[0.31, 0.35, 0.2]} s={[0.15, 0.2, 0.12]} r={[0.14, -0.3, -0.4]} color={hair} />
      <Lock p={[-0.34, 0.3, 0.12]} s={[0.13, 0.17, 0.11]} r={[0.16, 0.4, 0.52]} color={hair} />
      <Lock p={[0.3, 0.29, 0.12]} s={[0.12, 0.16, 0.11]} r={[0.16, -0.42, -0.48]} color={hair} />
      <Lock p={[0.2, 0.46, 0.12]} s={[0.16, 0.14, 0.12]} r={[0.1, -0.2, -0.3]} color={hair} />
    </group>
  );
}

function MessyHair({ hair }: { hair: string }) {
  const spikes: Array<{ p: [number, number, number]; s: [number, number, number]; r: [number, number, number] }> = [
    { p: [-0.15, 0.44, 0.14], s: [0.13, 0.3, 0.13], r: [0.35, 0, -0.38] },
    { p: [0.02, 0.48, 0.08], s: [0.12, 0.32, 0.12], r: [0.2, 0, 0.08] },
    { p: [0.17, 0.44, 0.12], s: [0.12, 0.28, 0.12], r: [0.3, 0, 0.42] },
    { p: [-0.26, 0.4, -0.04], s: [0.11, 0.26, 0.11], r: [0.15, 0, -0.5] },
    { p: [0.26, 0.38, -0.06], s: [0.11, 0.24, 0.11], r: [0.15, 0, 0.5] },
    { p: [0.0, 0.42, 0.26], s: [0.11, 0.22, 0.11], r: [0.95, 0, -0.15] },
    { p: [-0.14, 0.41, 0.24], s: [0.11, 0.2, 0.11], r: [0.85, 0, 0.3] },
    { p: [0.14, 0.4, 0.24], s: [0.1, 0.2, 0.1], r: [0.9, 0, -0.34] },
  ];
  return (
    <group>
      <Cap color={hair} scale={1.02} tilt={-0.56} />
      <Lock p={[0, 0.02, -0.16]} s={[0.72, 0.52, 0.5]} color={hair} />
      {spikes.map((sp, i) => (
        <Lock key={i} p={sp.p} s={sp.s} r={sp.r} color={hair} />
      ))}
      {/* 鬓角短碎 */}
      <Lock p={[-0.39, -0.02, 0.05]} s={[0.085, 0.16, 0.2]} color={hair} />
      <Lock p={[0.39, -0.02, 0.05]} s={[0.085, 0.16, 0.2]} color={hair} />
    </group>
  );
}

function SweptHair({ hair }: { hair: string }) {
  return (
    <group>
      <Cap color={hair} scale={1.035} tilt={-0.36} />
      {/* 大背头：向后梳的高体积 */}
      <Lock p={[-0.02, 0.36, -0.02]} s={[0.6, 0.28, 0.52]} r={[0.12, 0, -0.22]} color={hair} />
      <Lock p={[0.2, 0.3, 0.14]} s={[0.32, 0.18, 0.3]} r={[0.3, 0, -0.52]} color={hair} />
      <Lock p={[-0.22, 0.32, -0.08]} s={[0.38, 0.22, 0.4]} r={[0.08, 0.22, 0.36]} color={hair} />
      <Lock p={[0.04, 0.26, -0.26]} s={[0.54, 0.34, 0.36]} color={hair} />
      {/* 两侧鬓发贴面 */}
      <Lock p={[-0.39, 0.0, 0.08]} s={[0.1, 0.22, 0.26]} color={hair} />
      <Lock p={[0.39, 0.0, 0.08]} s={[0.1, 0.22, 0.26]} color={hair} />
    </group>
  );
}

function CurlyHair({ hair }: { hair: string }) {
  const puffs: Array<[number, number, number]> = [
    [-0.46, 0.05, 0.08],
    [-0.48, -0.14, -0.08],
    [-0.4, -0.23, -0.18],
    [-0.2, -0.27, -0.28],
    [0.2, -0.27, -0.28],
    [0.4, -0.23, -0.18],
    [0.48, -0.14, -0.08],
    [0.46, 0.05, 0.08],
    [-0.24, 0.22, -0.24],
    [0.24, 0.2, -0.24],
  ];
  return (
    <group>
      <Cap color={hair} scale={1.015} tilt={-0.48} />
      {puffs.map((p, i) => (
        <Lock key={i} p={p} s={[0.21, 0.25, 0.23]} color={hair} />
      ))}
      <Lock p={[0, -0.16, -0.26]} s={[0.6, 0.5, 0.38]} color={hair} />
      {/* 额前小卷（发际线以上） */}
      <Lock p={[-0.15, 0.36, 0.26]} s={[0.15, 0.14, 0.13]} color={hair} />
      <Lock p={[0.03, 0.39, 0.27]} s={[0.14, 0.13, 0.12]} color={hair} />
      <Lock p={[0.19, 0.35, 0.25]} s={[0.13, 0.13, 0.12]} color={hair} />
    </group>
  );
}

function Beard({ color }: { color: string }) {
  return (
    <group>
      {/* 络腮：环下颌的厚弧 */}
      <mesh position={[0, -0.24, 0.05]} rotation={[Math.PI / 2 * 0.94, 0, 0]} scale={[0.94, 0.9, 1]}>
        <torusGeometry args={[0.3, 0.062, 12, 32, Math.PI * 1.05]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      {/* 山羊胡 */}
      <Lock p={[0, -0.4, 0.2]} s={[0.16, 0.16, 0.12]} color={color} />
      {/* 八字胡（贴在鼻下皮面之外） */}
      <mesh position={[0, -0.118, 0.392]} rotation={[0.25, 0, Math.PI * 0.28]} scale={[1.1, 0.8, 1]}>
        <torusGeometry args={[0.05, 0.013, 8, 20, Math.PI * 0.62]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
    </group>
  );
}

export function Beret({ color }: { color: string }) {
  return (
    <group position={[0.05, 0.5, -0.04]} rotation={[0.1, 0, 0.2]}>
      <mesh scale={[1, 0.42, 1.04]} castShadow>
        <sphereGeometry args={[0.38, 28, 20]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.011, 0.014, 0.05, 8]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
    </group>
  );
}

function Glasses({ style }: { style: "round" | "oval" }) {
  const frame = style === "round" ? "#9c7c46" : "#3a3145";
  const ry = style === "round" ? 1 : 1.16;
  return (
    <group position={[0, 0.0, 0.372]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.155, 0.0, 0]}>
          <mesh scale={[1, ry, 1]}>
            <torusGeometry args={[0.058, 0.006, 8, 26]} />
            <meshStandardMaterial color={frame} roughness={0.35} metalness={0.5} />
          </mesh>
          {/* 镜腿：镜框 → 耳侧 */}
          <mesh position={[s * 0.2, 0.015, -0.1]} rotation={[0, s * -0.5, 0]}>
            <boxGeometry args={[0.24, 0.01, 0.01]} />
            <meshStandardMaterial color={frame} roughness={0.35} metalness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.012, 0.004]}>
        <boxGeometry args={[0.075, 0.011, 0.011]} />
        <meshStandardMaterial color={frame} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* 鼻托 */}
      <mesh position={[0, -0.028, 0.002]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color={frame} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** 头发 + 帽子 + 胡须 + 眼镜的统一入口（头局部坐标）。 */
export function HairAndExtras({ look }: { look: PersonaLook }): ReactNode {
  return (
    <group>
      {look.hairStyle === "bob" && <BobHair hair={look.hair} />}
      {look.hairStyle === "tousledBob" && <TousledBobHair hair={look.hair} />}
      {look.hairStyle === "messy" && <MessyHair hair={look.hair} />}
      {look.hairStyle === "swept" && <SweptHair hair={look.hair} />}
      {look.hairStyle === "curly" && <CurlyHair hair={look.hair} />}
      {look.beard && <Beard color={look.hair} />}
      {look.hat === "beret" && <Beret color="#6a4f3a" />}
      {look.glasses !== "none" && <Glasses style={look.glasses} />}
    </group>
  );
}
