"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { woodFloorTexture } from "../characters/canvasTextures";

/**
 * 侦探会议室（对照官方场景资产图 public/assets/scenes/detective-room.png）：
 * 暖胡桃木圆桌 + 黄铜吊灯暖光 + 软木板证据墙红线 + 书架 + 月夜窗 + 绿罩台灯柜。
 * 材质统一 meshStandardMaterial 软渲染，贴合立绘的盲盒渲染质感。
 */

const WOOD = "#6a4526";
const WOOD_DARK = "#54371f";
const BRASS = "#b08850";

function seededBooks(): Array<{ x: number; y: number; h: number; w: number; color: string }> {
  const colors = ["#a04434", "#4e7d72", "#c99a4a", "#4d5482", "#a2596f", "#75834a"];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const books: Array<{ x: number; y: number; h: number; w: number; color: string }> = [];
  for (const shelfY of [0.52, 1.06, 1.6]) {
    let x = -0.82;
    while (x < 0.7) {
      const w = 0.05 + rand() * 0.05;
      const h = 0.3 + rand() * 0.12;
      books.push({ x, y: shelfY, h, w, color: colors[Math.floor(rand() * colors.length)] });
      x += w + 0.012;
      if (rand() < 0.08) x += 0.1;
    }
  }
  return books;
}

/** 吊灯微风摆动：极低幅度绕 z 的正弦摆（视觉上像气流，不干扰阅读）。 */
function SwingingChandelier({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.7) * 0.018;
    group.current.rotation.x = Math.sin(t * 0.53 + 1.2) * 0.012;
  });
  return <group ref={group}>{children}</group>;
}

/** 台灯灯丝偶发闪烁：intensity 低频噪声抖动（暖光"呼吸"）。 */
function FlickerLight({
  base,
  spread = 0.35,
  speed = 1.7,
}: {
  base: number;
  spread?: number;
  speed?: number;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (!light.current) return;
    const t = state.clock.elapsedTime * speed;
    const noise = Math.sin(t * 3.1) * Math.sin(t * 1.7 + 0.6);
    light.current.intensity = base * (1 + noise * spread * 0.18);
  });
  return <pointLight ref={light} intensity={base} distance={3.4} color="#c8e8a8" />;
}

/** 护墙板：环墙条纹合批为单个 InstancedMesh（28 drawcall → 1）。 */
function Wainscoting() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = 28;
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      m.makeRotationY(a);
      m.setPosition(Math.sin(a) * 9.32, 1.35, Math.cos(a) * 9.32);
      mesh.current.setMatrixAt(i, m);
      mesh.current.setColorAt(i, color.set(i % 2 ? "#463d5c" : "#3f3754"));
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.16, 1.7, 0.06]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

/** 书架书籍：单层书脊合批（~30 drawcall → 1）。geometry 基准 0.05×0.3×0.26，按数据缩放。 */
function BookRow({ books }: { books: Array<{ x: number; y: number; h: number; w: number; color: string }> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const useRef_BookRow = ref;
  useLayoutEffect(() => {
    const mesh = useRef_BookRow.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    books.forEach((b, i) => {
      dummy.position.set(b.x, b.y, 0.02);
      dummy.scale.set(b.w / 0.05, b.h / 0.3, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [books]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, books.length]}>
      <boxGeometry args={[0.05, 0.3, 0.26]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}

export default function InterrogationRoom() {
  const books = useMemo(() => seededBooks(), []);
  const floorTex = useMemo(() => woodFloorTexture(), []);
  const tableTex = useMemo(() => {
    const tex = woodFloorTexture().clone();
    tex.needsUpdate = true;
    tex.center.set(0.5, 0.5);
    return tex;
  }, []);

  return (
    <group>
      {/* 地板与地毯 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#9a7a52" map={floorTex} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[4.35, 48]} />
        <meshStandardMaterial color="#4c4560" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[4.05, 4.28, 48]} />
        <meshStandardMaterial color="#c99a4a" roughness={0.75} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[2.5, 2.62, 48]} />
        <meshStandardMaterial color="#5c5478" roughness={0.8} />
      </mesh>

      {/* 圆形围墙 + 墙裙 */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[9.5, 9.5, 6, 48, 1, true]} />
        <meshStandardMaterial color="#3d3750" side={THREE.BackSide} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[9.45, 9.45, 1, 48, 1, true]} />
        <meshStandardMaterial color="#2f2a40" side={THREE.BackSide} roughness={0.9} />
      </mesh>

      {/* 中央圆桌 */}
      <group>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.55, 1.45, 0.1, 40]} />
          <meshStandardMaterial color="#8a5f36" map={tableTex} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.17, 0.24, 0.64, 16]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.64, 0.72, 0.08, 24]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>

        {/* 桌面道具：地图纸 / 马克杯 / 笔筒 / 放大镜 / 录音机 */}
        {[
          [0.32, 0.36, 0.4],
          [-0.15, 0.28, -0.35],
        ].map(([x, , z], i) => (
          <mesh key={i} position={[x, 0.796, z]} rotation={[-Math.PI / 2, 0, i * 1.1]}>
            <planeGeometry args={[0.5, 0.66]} />
            <meshStandardMaterial color="#efe6d0" roughness={0.85} />
          </mesh>
        ))}
        {[
          [-0.52, 0.22],
          [0.58, -0.28],
          [0.12, 0.52],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.86, 0]}>
              <cylinderGeometry args={[0.055, 0.048, 0.11, 14]} />
              <meshStandardMaterial color="#e8e2d2" roughness={0.5} />
            </mesh>
            <mesh position={[0.06, 0.87, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.032, 0.011, 8, 16, Math.PI]} />
              <meshStandardMaterial color="#e8e2d2" roughness={0.5} />
            </mesh>
          </group>
        ))}
        <group position={[-0.3, 0, 0.42]}>
          <mesh position={[0, 0.85, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.1, 12]} />
            <meshStandardMaterial color="#3c4258" roughness={0.6} />
          </mesh>
          {[-0.03, 0, 0.03].map((x, i) => (
            <mesh key={i} position={[x, 0.94, 0]} rotation={[0, 0, x * 2]}>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 6]} />
              <meshStandardMaterial color={i === 1 ? "#c9524a" : "#46507a"} roughness={0.5} />
            </mesh>
          ))}
        </group>
        <group position={[0.42, 0, 0.34]} rotation={[0, 0.4, 0.12]}>
          <mesh position={[0, 0.85, 0]}>
            <torusGeometry args={[0.085, 0.015, 10, 24]} />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0.1, 0.77, 0]} rotation={[0, 0, -0.7]}>
            <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.5} />
          </mesh>
        </group>
        <group position={[-0.05, 0, -0.62]} rotation={[0, 0.2, 0]}>
          <mesh position={[0, 0.83, 0]} castShadow>
            <boxGeometry args={[0.26, 0.09, 0.16]} />
            <meshStandardMaterial color="#6e3b32" roughness={0.55} />
          </mesh>
          <mesh position={[0.07, 0.83, 0.082]}>
            <cylinderGeometry args={[0.03, 0.03, 0.012, 12]} />
            <meshStandardMaterial color="#2c2830" roughness={0.4} />
          </mesh>
        </group>

        {/* 档案袋（牛皮纸 + 绕绳扣） */}
        <group position={[0.02, 0, 0.02]} rotation={[0, -0.35, 0]}>
          <mesh position={[0, 0.815, -0.1]} castShadow>
            <boxGeometry args={[0.4, 0.02, 0.3]} />
            <meshStandardMaterial color="#c9a86a" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.825, -0.21]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.4, 0.02, 0.08]} />
            <meshStandardMaterial color="#b8944f" roughness={0.85} />
          </mesh>
          <mesh position={[0.12, 0.832, -0.1]}>
            <torusGeometry args={[0.03, 0.008, 6, 14]} />
            <meshStandardMaterial color="#8a6838" roughness={0.5} />
          </mesh>
          {/* 袋口露出的纸页 */}
          <mesh position={[-0.05, 0.832, -0.19]} rotation={[-Math.PI / 2, 0, 0.15]}>
            <planeGeometry args={[0.24, 0.16]} />
            <meshStandardMaterial color="#efe6d0" roughness={0.9} />
          </mesh>
        </group>

        {/* 钢笔（笔身+笔尖+笔夹） */}
        <group position={[-0.62, 0, 0.16]} rotation={[0, 0.5, 0]}>
          <mesh position={[0, 0.803, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 10]} />
            <meshStandardMaterial color="#26222e" roughness={0.3} />
          </mesh>
          <mesh position={[0.13, 0.803, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.012, 0.05, 10]} />
            <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0.02, 0.812, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.013, 0.013, 0.05, 8]} />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.6} />
          </mesh>
        </group>

        {/* 墨水瓶（玻璃瓶+墨水面+瓶盖垫） */}
        <group position={[-0.78, 0, -0.2]}>
          <mesh position={[0, 0.83, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.058, 0.06, 16]} />
            <meshStandardMaterial color="#2a2e3e" roughness={0.15} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.864, 0]}>
            <cylinderGeometry args={[0.052, 0.052, 0.006, 16]} />
            <meshStandardMaterial color="#151827" roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.838, 0]}>
            <torusGeometry args={[0.058, 0.004, 6, 18]} />
            <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
          </mesh>
        </group>

        {/* 怀表（黄铜壳+表链，放在桌沿） */}
        <group position={[0.85, 0, 0.45]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.075, 0.075, 0.02, 24]} />
            <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.75} />
          </mesh>
          <mesh position={[0, 0.812, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.004, 24]} />
            <meshStandardMaterial color="#efe6d0" roughness={0.4} />
          </mesh>
          {/* 表针 */}
          <mesh position={[0, 0.815, 0.02]} rotation={[-Math.PI / 2, 0, 0.7]}>
            <planeGeometry args={[0.006, 0.05]} />
            <meshStandardMaterial color="#26222e" roughness={0.5} />
          </mesh>
          <mesh position={[0.015, 0.815, -0.01]} rotation={[-Math.PI / 2, 0, -1.1]}>
            <planeGeometry args={[0.006, 0.04]} />
            <meshStandardMaterial color="#26222e" roughness={0.5} />
          </mesh>
          {/* 表链拖到桌沿 */}
          <mesh position={[0.1, 0.802, 0.1]} rotation={[0, 0.4, Math.PI / 2]}>
            <torusGeometry args={[0.05, 0.008, 6, 20, Math.PI * 1.3]} />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      </group>

      {/* 吊灯（带微风摆动） */}
      <SwingingChandelier>
      <group position={[0, 2.32, 0]}>
        <mesh position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 1.56, 6]} />
          <meshStandardMaterial color="#1c1826" />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.46, 0.34, 28, 1, true]} />
          <meshStandardMaterial color={BRASS} side={THREE.DoubleSide} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, -0.13, 0]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshBasicMaterial color="#ffedbb" />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.1, 12]} />
          <meshStandardMaterial color="#8a6838" roughness={0.4} metalness={0.6} />
        </mesh>
        <pointLight position={[0, -0.3, 0]} intensity={14} distance={10} color="#ffd98a" />
        <spotLight
          position={[0, -0.12, 0]}
          target-position={[0, 0, 0]}
          angle={0.66}
          penumbra={0.75}
          intensity={62}
          distance={10}
          color="#ffce7a"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
        />
      </group>
      </SwingingChandelier>

      {/* 月夜窗（挂墙内侧）：月亮 + 城市剪影 + 窗框 + 窗帘 */}
      <group position={[0, 2.2, -9.3]}>
        <mesh>
          <planeGeometry args={[2.7, 2.0]} />
          <meshBasicMaterial color="#0d1530" />
        </mesh>
        {/* 月亮与光晕 */}
        <mesh position={[0.82, 0.6, 0.02]}>
          <circleGeometry args={[0.26, 32]} />
          <meshBasicMaterial color="#f6f0d8" />
        </mesh>
        <mesh position={[0.82, 0.6, 0.015]}>
          <circleGeometry args={[0.4, 32]} />
          <meshBasicMaterial color="#e8e4c8" transparent opacity={0.24} />
        </mesh>
        {/* 星 */}
        {[
          [-1.0, 0.72],
          [-0.6, 0.35],
          [0.2, 0.8],
          [0.55, 0.15],
          [-0.2, 0.5],
          [1.05, 0.2],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.02]}>
            <circleGeometry args={[0.018, 8]} />
            <meshBasicMaterial color="#dfe6ff" />
          </mesh>
        ))}
        {/* 城市剪影 */}
        {[
          [-1.1, -0.55, 0.3, 0.5],
          [-0.8, -0.62, 0.24, 0.36],
          [-0.45, -0.5, 0.34, 0.6],
          [0.3, -0.6, 0.4, 0.4],
          [0.7, -0.52, 0.3, 0.56],
          [1.1, -0.6, 0.26, 0.4],
        ].map(([x, y, w, h], i) => (
          <group key={i} position={[x, y, 0.02]}>
            <mesh>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial color="#131c3a" />
            </mesh>
            {[0, 1, 2].map((r) => (
              <mesh key={r} position={[(r - 1) * w * 0.24, -h * 0.1 + r * 0.06, 0.005]}>
                <circleGeometry args={[0.022, 4]} />
                <meshBasicMaterial color="#e8c47a" />
              </mesh>
            ))}
          </group>
        ))}
        {/* 窗框 */}
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[2.95, 2.25]} />
          <meshStandardMaterial color="#4a3a28" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[2.72, 2.02]} />
          <meshBasicMaterial color="#0d1530" />
        </mesh>
        <mesh position={[0, 0, 0.075]}>
          <planeGeometry args={[0.06, 2.0]} />
          <meshStandardMaterial color="#5c4a32" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.075]}>
          <planeGeometry args={[2.7, 0.06]} />
          <meshStandardMaterial color="#5c4a32" roughness={0.7} />
        </mesh>
        {/* 窗帘 */}
        <mesh position={[-1.45, 0.1, 0.09]} rotation={[0, 0, 0.03]}>
          <planeGeometry args={[0.4, 2.3]} />
          <meshStandardMaterial color="#37406a" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[1.45, 0.1, 0.09]} rotation={[0, 0, -0.03]}>
          <planeGeometry args={[0.4, 2.3]} />
          <meshStandardMaterial color="#37406a" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* 月光冷色补光 */}
      <directionalLight position={[0, 4, -9]} intensity={0.5} color="#7f9bff" />

      {/* 书架 */}
      <group position={[-5.2, 0, -6.4]} rotation={[0, 0.65, 0]}>
        <mesh position={[0, 1.05, -0.18]}>
          <boxGeometry args={[1.9, 2.1, 0.36]} />
          <meshStandardMaterial color={WOOD} roughness={0.75} />
        </mesh>
        <BookRow books={books} />
      </group>

      {/* 软木板证据墙：照片/纸条 + 红线 */}
      <group position={[4.6, 2.0, -6.2]} rotation={[0, -0.6, 0]}>
        <mesh>
          <boxGeometry args={[2.3, 1.6, 0.06]} />
          <meshStandardMaterial color="#6e4f30" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[2.14, 1.44]} />
          <meshStandardMaterial color="#b08a58" roughness={0.9} />
        </mesh>
        {[
          [-0.62, 0.32, 0.08],
          [0.05, 0.38, -0.06],
          [0.66, 0.18, 0.12],
          [-0.4, -0.28, -0.1],
          [0.3, -0.34, 0.07],
          [0.75, -0.3, -0.12],
          [-0.75, -0.25, 0.05],
        ].map(([x, y, r], i) => (
          <group key={i} position={[x, y, 0.05]} rotation={[0, 0, r]}>
            <mesh>
              <planeGeometry args={[0.34, i % 2 ? 0.42 : 0.3]} />
              <meshStandardMaterial color={i % 3 === 0 ? "#d8d2c2" : "#efe6d0"} roughness={0.85} />
            </mesh>
            {i % 3 === 0 && (
              <mesh position={[0, 0.02, 0.008]}>
                <planeGeometry args={[0.22, 0.16]} />
                <meshStandardMaterial color="#6a6478" roughness={0.9} />
              </mesh>
            )}
            {[0.08, 0, -0.08].map((ly, j) => (
              <mesh key={j} position={[0, ly - 0.05, 0.008]}>
                <planeGeometry args={[0.22, 0.018]} />
                <meshStandardMaterial color="#a89c84" roughness={0.9} />
              </mesh>
            ))}
            <mesh position={[0, i % 2 ? 0.24 : 0.18, 0.012]}>
              <circleGeometry args={[0.02, 10]} />
              <meshBasicMaterial color={i % 2 ? "#c9524a" : "#c99a4a"} />
            </mesh>
          </group>
        ))}
        {/* 红线 */}
        {[
          [0.02, 0.35, 1.25, 0.95],
          [-0.05, -0.1, -1.0, 0.85],
          [0.35, 0.28, 0.5, 1.1],
        ].map(([x, y, rot, len], i) => (
          <mesh key={i} position={[x, y, 0.075]} rotation={[0, 0, rot]}>
            <planeGeometry args={[len, 0.014]} />
            <meshBasicMaterial color="#c9524a" />
          </mesh>
        ))}
      </group>

      {/* 右侧柜 + 绿罩台灯 + 收音机 */}
      <group position={[5.4, 0, -1.2]} rotation={[0, -1.35, 0]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, 0.84, 0.6]} />
          <meshStandardMaterial color={WOOD} roughness={0.75} />
        </mesh>
        {[-0.4, 0.4].map((x, i) => (
          <mesh key={i} position={[x, 0.36, 0.31]}>
            <circleGeometry args={[0.03, 10]} />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.7} />
          </mesh>
        ))}
        {/* 绿罩台灯 */}
        <group position={[-0.45, 0.84, 0]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.02, 0.05, 0.36, 10]} />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.4, 0]} rotation={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.05, 0.17, 0.12, 20, 1, true]} />
            <meshStandardMaterial color="#2f6e46" side={THREE.DoubleSide} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.345, 0]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshBasicMaterial color="#ffedbb" />
          </mesh>
          <FlickerLight base={2.2} />
        </group>
        {/* 文件盒 */}
        <mesh position={[0.4, 0.98, 0]} castShadow>
          <boxGeometry args={[0.36, 0.28, 0.3]} />
          <meshStandardMaterial color="#3c4258" roughness={0.6} />
        </mesh>
        <mesh position={[0.4, 0.9, 0.16]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.3, 0.05, 0.02]} />
          <meshStandardMaterial color="#e8e2d2" roughness={0.8} />
        </mesh>
      </group>

      {/* 绿植 ×2 */}
      {[
        { p: [3.6, 0, 4.2] as [number, number, number], s: 1 },
        { p: [-3.9, 0, 4.6] as [number, number, number], s: 0.8 },
      ].map(({ p, s }, gi) => (
        <group key={gi} position={p} scale={s}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.2, 0.48, 16]} />
            <meshStandardMaterial color="#8a5a4a" roughness={0.7} />
          </mesh>
          {[
            [0, 0.66, 0, 0.27],
            [0.17, 0.54, 0.08, 0.18],
            [-0.16, 0.58, -0.06, 0.2],
            [0.05, 0.86, -0.05, 0.16],
            [-0.07, 0.78, 0.09, 0.14],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} castShadow>
              <sphereGeometry args={[r, 14, 12]} />
              <meshStandardMaterial color={i % 2 ? "#3f7a44" : "#57995c"} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 挂钟 */}
      <group position={[-3.4, 2.6, -7.4]} rotation={[0, 0.5, 0]}>
        <mesh>
          <torusGeometry args={[0.36, 0.05, 10, 28]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.34, 28]} />
          <meshStandardMaterial color="#efe6d0" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.07, 0.01]} rotation={[0, 0, 0.4]}>
          <planeGeometry args={[0.03, 0.2]} />
          <meshStandardMaterial color="#2c2830" roughness={0.6} />
        </mesh>
        <mesh position={[0.05, 0, 0.01]} rotation={[0, 0, -1.2]}>
          <planeGeometry args={[0.03, 0.26]} />
          <meshStandardMaterial color="#2c2830" roughness={0.6} />
        </mesh>
      </group>

      {/* 前景案卷篮（大厅机位左下入画；审讯机位在镜头后方不干扰） */}
      <group position={[-2.1, 0, 5.4]} rotation={[0, 0.7, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.26, 0.32, 18]} />
          <meshStandardMaterial color="#7a5a38" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.02, 8, 24]} />
          <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
        </mesh>
        {/* 篮内卷宗卷轴 */}
        {[0, 1, 2].map((k) => (
          <group key={k} position={[k * 0.1 - 0.08, 0.3, (k % 2) * 0.06 - 0.03]} rotation={[0, 0.5 + k * 0.4, Math.PI / 2]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.42, 10]} />
              <meshStandardMaterial color={k === 1 ? "#e2d7bc" : "#d5c8a8"} roughness={0.85} />
            </mesh>
            {[-0.18, 0.18].map((y) => (
              <mesh key={y} position={[0, y, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.03, 10]} />
                <meshStandardMaterial color="#8a6a44" roughness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* 灯下漂浮尘埃 */}
      <Sparkles count={46} scale={[3.4, 2.6, 3.4]} position={[0, 1.7, 0]} size={2.4} speed={0.25} color="#ffd98a" opacity={0.5} />

      {/* 护墙板：环墙木条纹合批 + 黄铜腰线圆环（打破大平面，给墙面节奏） */}
      <Wainscoting />
      <mesh position={[0, 2.28, 0]}>
        <cylinderGeometry args={[9.4, 9.4, 0.05, 48, 1, true]} />
        <meshStandardMaterial color={BRASS} side={THREE.BackSide} roughness={0.4} metalness={0.65} />
      </mesh>

      {/* 挂画 ×2：剪影肖像 + 案卷编号（墙面中层兴趣点） */}
      {([
        { p: [-7.0, 2.3, -4.6] as [number, number, number], rot: 0.95, tone: "#8a8db4", label: "No.07" },
        { p: [6.8, 2.45, -5.2] as [number, number, number], rot: -0.9, tone: "#b48a8a", label: "No.12" },
      ]).map(({ p, rot, tone, label }, i) => (
        <group key={i} position={p} rotation={[0, rot, 0]}>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[0.94, 1.24, 0.05]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <planeGeometry args={[0.82, 1.1]} />
            <meshStandardMaterial color="#d9d2be" roughness={0.9} />
          </mesh>
          {/* 剪影头像 */}
          <mesh position={[0, 0.16, 0.02]}>
            <circleGeometry args={[0.17, 20]} />
            <meshStandardMaterial color={tone} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.22, 0.02]}>
            <circleGeometry args={[0.3, 20, Math.PI, Math.PI]} />
            <meshStandardMaterial color={tone} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.48, 0.02]}>
            <planeGeometry args={[0.4, 0.05]} />
            <meshStandardMaterial color="#8f8776" roughness={0.9} />
          </mesh>
          <mesh position={[0.28, 0.47, 0.02]}>
            <circleGeometry args={[0.018, 8]} />
            <meshBasicMaterial color="#c9524a" />
          </mesh>
        </group>
      ))}

      {/* 茶几 + 茶壶 + 茶杯（back-left 中景，让空墙脚下有生活气） */}
      <group position={[-3.6, 0, -3.2]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.44, 0.05, 20]} />
          <meshStandardMaterial color="#7c5230" map={tableTex} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.1, 0.4, 10]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.24, 0.28, 0.06, 14]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
        {/* 茶壶 */}
        <group position={[-0.12, 0.56, 0.05]}>
          <mesh castShadow>
            <sphereGeometry args={[0.11, 16, 12]} />
            <meshStandardMaterial color="#e6dfcf" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 0.05, 10]} />
            <meshStandardMaterial color="#e6dfcf" roughness={0.4} />
          </mesh>
          <mesh position={[0.12, 0.02, 0]} rotation={[0, 0, -0.9]}>
            <cylinderGeometry args={[0.012, 0.016, 0.1, 8]} />
            <meshStandardMaterial color="#e6dfcf" roughness={0.4} />
          </mesh>
          <mesh position={[-0.12, 0.02, 0]} rotation={[0, 0, 0.4]}>
            <torusGeometry args={[0.045, 0.01, 8, 14, Math.PI * 1.2]} />
            <meshStandardMaterial color="#c99a4a" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
        {/* 茶杯 ×2 */}
        {[[0.18, 0.62, -0.12], [0.26, 0.6, 0.14]].map(([x, z], ci) => (
          <group key={ci} position={[x, 0.47, z]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.045, 0.036, 0.06, 12]} />
              <meshStandardMaterial color="#efe8d8" roughness={0.45} />
            </mesh>
            <mesh position={[0.05, 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.024, 0.008, 6, 12, Math.PI]} />
              <meshStandardMaterial color="#efe8d8" roughness={0.45} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 落地灯（右前暗角）：暖光池 + 灯罩 */}
      <group position={[3.4, 0, 1.6]}>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 0.06, 14]} />
          <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.5, 8]} />
          <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 1.62, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.26, 0.3, 20, 1, true]} />
          <meshStandardMaterial color="#c46a4a" side={THREE.DoubleSide} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color="#ffedbb" />
        </mesh>
        <pointLight position={[0, 1.5, 0]} intensity={3.2} distance={4.2} color="#ffc985" />
      </group>

      {/* 档案堆（软木板墙脚下）：三摞卷宗 + 散页 */}
      <group position={[4.5, 0, -4.4]} rotation={[0, -0.5, 0]}>
        {[
          [0, 0, 0, 0.1],
          [0.3, 0, 0.16, -0.14],
          [-0.24, 0, 0.2, 0.22],
        ].map(([x, , z, r], si) => (
          <group key={si} position={[x, 0, z]} rotation={[0, r, 0]}>
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, 0.035 + k * 0.05, 0]} rotation={[0, k * 0.12, 0]} castShadow>
                <boxGeometry args={[0.34, 0.045, 0.24]} />
                <meshStandardMaterial color={k === 1 ? "#d8cfb8" : "#c4b896"} roughness={0.85} />
              </mesh>
            ))}
            <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0.3]}>
              <planeGeometry args={[0.2, 0.14]} />
              <meshStandardMaterial color="#efe6d0" roughness={0.9} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 壁灯 ×3（emissive 为主，仅一盏真实点光，控制光数） */}
      {[
        { p: [-8.6, 2.5, 1.5] as [number, number, number], rot: 1.35, light: true },
        { p: [8.7, 2.55, 0.2] as [number, number, number], rot: -1.4, light: false },
        { p: [2.2, 2.5, 8.8] as [number, number, number], rot: 2.9, light: false },
      ].map(({ p, rot, light }, i) => (
        <group key={i} position={p} rotation={[0, rot, 0]}>
          <mesh position={[0, 0, 0.04]}>
            <cylinderGeometry args={[0.03, 0.04, 0.16, 8]} />
            <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.1, 0.06]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.09, 0.09, 14, 1, true]} />
            <meshStandardMaterial color="#e8d9a8" emissive="#ffdf9e" emissiveIntensity={light ? 1.6 : 0.9} side={THREE.DoubleSide} roughness={0.5} />
          </mesh>
          {light && <pointLight position={[0, 0.06, 0.1]} intensity={1.8} distance={3.6} color="#ffd9a0" />}
        </group>
      ))}
    </group>
  );
}
