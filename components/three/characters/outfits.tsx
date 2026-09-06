"use client";

import { useMemo, type Ref } from "react";
import * as THREE from "three";
import type { PersonaLook } from "./personas";
import { plaidTexture } from "./canvasTextures";

/**
 * 身体/服装系统（body 局部坐标：原点在髋部）。
 * - 躯干用 lathe 剖面（肩宽 → 腰收 → 摆放量），大衣类下摆外扩；
 * - 四套服装版型：trench 长风衣 / suit 西装 / hoodie 卫衣 / professor 三件套；
 * - 腿/鞋/手臂 + 手持道具（书、笔记本、电脑、挎包）对照官方立绘。
 */

type V2 = [number, number];

const TORSO_PROFILES: Record<string, V2[]> = {
  // 长风衣：下摆微外扩，膝上收摆露出腿
  trench: [
    [0.27, -0.34],
    [0.25, -0.22],
    [0.222, -0.08],
    [0.208, 0.08],
    [0.222, 0.26],
    [0.238, 0.4],
    [0.205, 0.5],
    [0.13, 0.55],
    [0.095, 0.56],
  ],
  // 西装：及胯短摆
  suit: [
    [0.255, -0.16],
    [0.225, -0.06],
    [0.205, 0.08],
    [0.22, 0.26],
    [0.236, 0.4],
    [0.204, 0.5],
    [0.13, 0.55],
    [0.095, 0.56],
  ],
  // 卫衣：直筒微鼓
  hoodie: [
    [0.235, -0.18],
    [0.245, 0.0],
    [0.252, 0.18],
    [0.252, 0.34],
    [0.235, 0.44],
    [0.18, 0.52],
    [0.1, 0.56],
  ],
};

const torsoCache = new Map<string, THREE.LatheGeometry>();
function torsoGeometry(style: string): THREE.LatheGeometry {
  const cached = torsoCache.get(style);
  if (cached) return cached;
  const pts = TORSO_PROFILES[style].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 36);
  torsoCache.set(style, geo);
  return geo;
}

function Arm({
  side,
  look,
  groupRef,
}: {
  side: 1 | -1;
  look: PersonaLook;
  groupRef?: Ref<THREE.Group>;
}) {
  const sleeveColor = look.outfitStyle === "professor" ? look.outfit : look.outfit;
  return (
    <group ref={groupRef} position={[side * 0.25, 0.44, 0.01]}>
      {/* 袖 */}
      <mesh position={[0, -0.11, 0]} castShadow>
        <capsuleGeometry args={[0.062, 0.16, 6, 14]} />
        <meshStandardMaterial color={sleeveColor} roughness={0.66} />
      </mesh>
      {/* 袖口 */}
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.055, 0.05, 0.035, 12]} />
        <meshStandardMaterial color={look.outfitAccent} roughness={0.6} />
      </mesh>
      {/* 手 */}
      <mesh position={[0, -0.26, 0.01]}>
        <sphereGeometry args={[0.052, 14, 12]} />
        <meshStandardMaterial color={look.skin} roughness={0.5} />
      </mesh>
      {look.props.includes("watch") && side === -1 && (
        <mesh position={[0, -0.185, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.05, 0.011, 8, 18]} />
          <meshStandardMaterial color="#3a332c" roughness={0.4} metalness={0.3} />
        </mesh>
      )}
    </group>
  );
}

function Leg({ side, look, sitting }: { side: 1 | -1; look: PersonaLook; sitting: boolean }) {
  const legLen = sitting ? 0.42 : 0.56;
  return (
    <group position={[side * 0.105, sitting ? -0.02 : 0.0, sitting ? 0.02 : 0]}>
      <mesh position={[0, -legLen / 2, 0]} castShadow>
        <capsuleGeometry args={[0.078, Math.max(0.02, legLen - 0.14), 6, 14]} />
        <meshStandardMaterial color={look.trousers} roughness={0.7} />
      </mesh>
      {/* 裤脚卷边 */}
      <mesh position={[0, -legLen + 0.05, 0]}>
        <cylinderGeometry args={[0.082, 0.078, 0.05, 14]} />
        <meshStandardMaterial color={look.trousers} roughness={0.7} />
      </mesh>
      <Shoe look={look} y={-legLen + 0.015} />
    </group>
  );
}

function Shoe({ look, y }: { look: PersonaLook; y: number }) {
  if (look.shoeStyle === "sneaker") {
    return (
      <group position={[0, y, 0.035]}>
        <mesh scale={[1, 0.62, 1.7]} castShadow>
          <sphereGeometry args={[0.085, 16, 12]} />
          <meshStandardMaterial color={look.shoes} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.028, 0.06]} scale={[1, 0.5, 0.9]}>
          <sphereGeometry args={[0.072, 14, 10]} />
          <meshStandardMaterial color="#f4f2ec" roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.045, 0]}>
          <boxGeometry args={[0.15, 0.022, 0.24]} />
          <meshStandardMaterial color="#d8d2c2" roughness={0.6} />
        </mesh>
      </group>
    );
  }
  if (look.shoeStyle === "heel") {
    return (
      <group position={[0, y, 0.03]}>
        <mesh scale={[1, 0.55, 1.6]} castShadow>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshStandardMaterial color={look.shoes} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.055, -0.075]}>
          <cylinderGeometry args={[0.016, 0.022, 0.07, 10]} />
          <meshStandardMaterial color={look.shoes} roughness={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, y, 0.04]}>
      <mesh scale={[1, 0.55, 1.75]} castShadow>
        <sphereGeometry args={[0.082, 16, 12]} />
        <meshStandardMaterial color={look.shoes} roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.045, 0]}>
        <boxGeometry args={[0.14, 0.02, 0.24]} />
        <meshStandardMaterial color={look.shoes} roughness={0.42} />
      </mesh>
    </group>
  );
}

function FrontOpening({ look, width }: { look: PersonaLook; width: number }) {
  return (
    <group>
      {/* 衬里/衬衫竖条（浮出大衣表面） */}
      <mesh position={[0, 0.22, 0.215]} scale={[1, 1, 0.6]}>
        <capsuleGeometry args={[width, 0.3, 6, 12]} />
        <meshStandardMaterial color={look.outfitAccent} roughness={0.62} />
      </mesh>
      {/* 翻领两片 */}
      <mesh position={[-0.055, 0.47, 0.195]} rotation={[0.3, 0.5, 0.5]}>
        <boxGeometry args={[0.075, 0.11, 0.02]} />
        <meshStandardMaterial color={look.outfit} roughness={0.66} />
      </mesh>
      <mesh position={[0.055, 0.47, 0.195]} rotation={[0.3, -0.5, -0.5]}>
        <boxGeometry args={[0.075, 0.11, 0.02]} />
        <meshStandardMaterial color={look.outfit} roughness={0.66} />
      </mesh>
      {/* 扣子 */}
      {[0.05, 0.18, 0.31].map((y, i) => (
        <mesh key={i} position={[0, y, 0.258 - Math.abs(y - 0.18) * 0.1]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color={look.outfit} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function NeckScarf({ color, plaid }: { color: string; plaid?: boolean }) {
  const tex = useMemo(() => (plaid ? plaidTexture() : null), [plaid]);
  return (
    <group>
      {/* 围在领口上方，前置以浮出大衣领 */}
      <mesh position={[0, 0.5, 0.045]} rotation={[Math.PI / 2, 0, 0]} scale={[1.18, 1, 0.7]}>
        <torusGeometry args={[0.125, 0.05, 10, 24]} />
        <meshStandardMaterial color={tex ? "#ffffff" : color} map={tex ?? null} roughness={0.75} />
      </mesh>
      {/* 垂尾 */}
      <mesh position={[0.1, 0.22, 0.19]} rotation={[0.06, 0, -0.12]}>
        <boxGeometry args={[0.1, 0.52, 0.028]} />
        <meshStandardMaterial color={tex ? "#ffffff" : color} map={tex ?? null} roughness={0.75} />
      </mesh>
      {plaid && (
        <mesh position={[-0.06, 0.26, 0.19]} rotation={[0.04, 0, 0.1]}>
          <boxGeometry args={[0.09, 0.46, 0.026]} />
          <meshStandardMaterial color="#ffffff" map={tex ?? null} roughness={0.75} />
        </mesh>
      )}
    </group>
  );
}

function Bowtie({ color }: { color: string }) {
  return (
    <group position={[0, 0.49, 0.225]}>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.052, 0.052, 0.028]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0.052, 0.004, 0]} rotation={[0, 0, -Math.PI / 4]} scale={[0.9, 0.8, 1]}>
        <boxGeometry args={[0.052, 0.052, 0.028]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[-0.052, 0.004, 0]} rotation={[0, 0, -Math.PI / 4]} scale={[0.9, 0.8, 1]}>
        <boxGeometry args={[0.052, 0.052, 0.028]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.016, 10, 10]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    </group>
  );
}

function CardLanyard({ idPhoto }: { idPhoto: boolean }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.055, 0.38, 0.19]} rotation={[0, 0, s * -0.35]}>
          <boxGeometry args={[0.016, 0.2, 0.008]} />
          <meshStandardMaterial color="#4a4440" roughness={0.6} />
        </mesh>
      ))}
      <group position={[0, 0.24, 0.262]}>
        <mesh>
          <boxGeometry args={[0.1, 0.13, 0.014]} />
          <meshStandardMaterial color="#f6f2e8" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.035, 0.009]}>
          <boxGeometry args={[0.085, 0.02, 0.004]} />
          <meshStandardMaterial color={idPhoto ? "#c9524a" : "#d94f3d"} roughness={0.5} />
        </mesh>
        {idPhoto && (
          <mesh position={[0, -0.01, 0.009]}>
            <boxGeometry args={[0.05, 0.055, 0.004]} />
            <meshStandardMaterial color="#b8c4d4" roughness={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function HeldItem({ look }: { look: PersonaLook }) {
  if (look.props.includes("book")) {
    return (
      <group position={[0.02, 0.2, 0.27]} rotation={[0.45, 0, 0.08]}>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.28, 0.055]} />
          <meshStandardMaterial color="#4a342a" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.031]}>
          <boxGeometry args={[0.185, 0.265, 0.014]} />
          <meshStandardMaterial color="#efe6d0" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.06, 0.04]}>
          <boxGeometry args={[0.16, 0.018, 0.004]} />
          <meshStandardMaterial color="#c9a86a" roughness={0.4} metalness={0.4} />
        </mesh>
      </group>
    );
  }
  if (look.props.includes("laptop")) {
    return (
      <group position={[0.24, 0.2, 0.16]} rotation={[0.1, 0, -0.12]}>
        <mesh castShadow>
          <boxGeometry args={[0.05, 0.34, 0.26]} />
          <meshStandardMaterial color="#b9bcc2" roughness={0.35} metalness={0.55} />
        </mesh>
      </group>
    );
  }
  if (look.props.includes("notebook")) {
    return (
      <group position={[-0.25, 0.22, 0.18]} rotation={[0.12, 0.1, 0.2]}>
        <mesh castShadow>
          <boxGeometry args={[0.055, 0.3, 0.22]} />
          <meshStandardMaterial color="#2e2b36" roughness={0.5} />
        </mesh>
      </group>
    );
  }
  return null;
}

function HipBag({ side, color, wide }: { side: 1 | -1; color: string; wide?: boolean }) {
  return (
    <group position={[side * 0.24, 0.02, 0.1]} rotation={[0, side * 0.3, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.16, wide ? 0.2 : 0.16, 0.07]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, wide ? -0.05 : -0.04, 0.04]}>
        <boxGeometry args={[0.1, 0.028, 0.014]} />
        <meshStandardMaterial color="#c9a86a" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* 背带斜跨 */}
      <mesh position={[side * -0.12, 0.3, 0.14]} rotation={[0, 0, side * 0.72]}>
        <boxGeometry args={[0.03, 0.56, 0.012]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
    </group>
  );
}

export interface OutfitProps {
  look: PersonaLook;
  sitting: boolean;
  armLRef?: Ref<THREE.Group>;
  armRRef?: Ref<THREE.Group>;
}

/** 躯干 + 腿 + 手臂 + 配件（body 局部坐标）。 */
export function Outfit({ look, sitting, armLRef, armRRef }: OutfitProps) {
  const style = look.outfitStyle;
  const torsoStyle = style === "professor" ? "trench" : style;
  return (
    <group>
      <mesh geometry={torsoGeometry(torsoStyle)} castShadow>
        <meshStandardMaterial color={look.outfit} roughness={0.66} />
      </mesh>

      {(style === "trench" || style === "suit") && <FrontOpening look={look} width={0.055} />}

      {style === "professor" && (
        <group>
          {/* 马甲 + 衬衫 */}
          <mesh position={[0, 0.24, 0.2]} scale={[1, 1, 0.5]}>
            <capsuleGeometry args={[0.06, 0.28, 6, 12]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.18, 0.205]} scale={[1, 1, 0.42]}>
            <capsuleGeometry args={[0.085, 0.16, 6, 12]} />
            <meshStandardMaterial color="#57432f" roughness={0.68} />
          </mesh>
          {/* 怀表链 */}
          <mesh position={[0.07, 0.08, 0.2]} rotation={[0, 0, 0.6]}>
            <torusGeometry args={[0.045, 0.006, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#c9a86a" roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      )}

      {style === "hoodie" && (
        <group>
          {/* 帽子（垂在后背） */}
          <mesh position={[0, 0.42, -0.2]} rotation={[0.5, 0, 0]} scale={[1.15, 0.8, 0.75]}>
            <sphereGeometry args={[0.17, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={look.outfitAccent} roughness={0.68} side={THREE.DoubleSide} />
          </mesh>
          {/* 背包肩带（胸前） */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.115, 0.38, 0.2]} rotation={[0, 0, s * -0.12]}>
              <boxGeometry args={[0.055, 0.3, 0.02]} />
              <meshStandardMaterial color="#26232e" roughness={0.6} />
            </mesh>
          ))}
          {/* 口袋 */}
          <mesh position={[0, -0.02, 0.225]}>
            <boxGeometry args={[0.18, 0.1, 0.02]} />
            <meshStandardMaterial color={look.outfit} roughness={0.68} />
          </mesh>
          {/* 帽绳 */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.045, 0.4, 0.21]} rotation={[0, 0, s * 0.15]}>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 6]} />
              <meshStandardMaterial color={look.outfitAccent} roughness={0.6} />
            </mesh>
          ))}
          {/* 下摆白T露出 */}
          <mesh position={[0, -0.19, 0]}>
            <cylinderGeometry args={[0.242, 0.24, 0.05, 24]} />
            <meshStandardMaterial color="#f2efe6" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* 配件 */}
      {look.props.includes("bowtie") && <Bowtie color={look.outfitAccent} />}
      {look.props.includes("scarf") && <NeckScarf color={look.outfitAccent} />}
      {look.props.includes("plaidScarf") && <NeckScarf color="#8a6a4c" plaid />}
      {(look.props.includes("pressCard") || look.props.includes("lanyard")) && (
        <CardLanyard idPhoto={look.props.includes("lanyard")} />
      )}
      {look.props.includes("necklace") && (
        <mesh position={[0, 0.45, 0.17]} rotation={[0.55, 0, 0]}>
          <torusGeometry args={[0.1, 0.008, 8, 22]} />
          <meshStandardMaterial color="#d9c08a" roughness={0.3} metalness={0.8} />
        </mesh>
      )}
      {look.props.includes("shoulderBag") && <HipBag side={-1} color="#2c2830" />}
      {look.props.includes("satchel") && <HipBag side={-1} color="#6b4a30" wide />}
      <HeldItem look={look} />

      <Arm side={-1} look={look} groupRef={armLRef} />
      <Arm side={1} look={look} groupRef={armRRef} />
      <Leg side={-1} look={look} sitting={sitting} />
      <Leg side={1} look={look} sitting={sitting} />
    </group>
  );
}
