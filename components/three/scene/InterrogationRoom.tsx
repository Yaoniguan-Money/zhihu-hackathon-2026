"use client";

import { useMemo } from "react";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";

/**
 * 卡通审讯室静态场景：圆木桌、吊灯暖光、夜窗、书架、软木板证据墙、绿植。
 * 阴影只由吊灯 SpotLight 投射，控制绘制成本。
 */

const INK = "#33283d";

function seededBooks(): Array<{ x: number; y: number; h: number; w: number; color: string; tilt: number }> {
  const colors = ["#d94f3d", "#2ea79b", "#e0a34a", "#5b5bd6", "#c2557a", "#7c8a3f"];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const books: Array<{ x: number; y: number; h: number; w: number; color: string; tilt: number }> = [];
  for (const shelfY of [0.52, 1.06, 1.6]) {
    let x = -0.82;
    while (x < 0.7) {
      const w = 0.05 + rand() * 0.05;
      const h = 0.3 + rand() * 0.12;
      books.push({ x, y: shelfY, h, w, color: colors[Math.floor(rand() * colors.length)], tilt: 0 });
      x += w + 0.012;
      if (rand() < 0.08) x += 0.1;
    }
  }
  return books;
}

export default function InterrogationRoom() {
  const books = useMemo(seededBooks, []);

  return (
    <group>
      {/* 地板与地毯 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[10, 48]} />
        <meshToonMaterial color="#6d4a2f" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[4.4, 48]} />
        <meshToonMaterial color="#3f3a5c" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[4.1, 4.28, 48]} />
        <meshToonMaterial color="#e0a34a" />
      </mesh>

      {/* 圆形围墙（暗夜蓝）+ 墙裙 */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[9.5, 9.5, 6, 48, 1, true]} />
        <meshToonMaterial color="#2a2740" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[9.45, 9.45, 1, 48, 1, true]} />
        <meshToonMaterial color="#3a3554" side={THREE.BackSide} />
      </mesh>

      {/* 中央圆桌 */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.55, 1.45, 0.09, 40]} />
          <meshToonMaterial color="#a9713f" />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.16, 0.22, 0.66, 16]} />
          <meshToonMaterial color="#7c4f2a" />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.62, 0.7, 0.08, 24]} />
          <meshToonMaterial color="#7c4f2a" />
        </mesh>
        {/* 桌面证据纸与放大镜道具 */}
        <mesh position={[0.4, 0.775, 0.3]} rotation={[-Math.PI / 2, 0, 0.5]}>
          <planeGeometry args={[0.42, 0.56]} />
          <meshToonMaterial color="#fdf8ec" />
        </mesh>
        <mesh position={[0.38, 0.782, 0.28]} rotation={[-Math.PI / 2, 0, 0.5]}>
          <planeGeometry args={[0.3, 0.02]} />
          <meshToonMaterial color="#b8b0a0" />
        </mesh>
        <group position={[-0.5, 0.82, 0.25]} rotation={[0, 0.4, 0.15]}>
          <mesh>
            <torusGeometry args={[0.09, 0.016, 10, 24]} />
            <meshToonMaterial color="#e0a34a" />
          </mesh>
          <mesh position={[0.11, -0.13, 0]} rotation={[0, 0, -0.8]}>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 8]} />
            <meshToonMaterial color="#8a5a36" />
          </mesh>
        </group>
      </group>

      {/* 吊灯 */}
      <group position={[0, 2.35, 0]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 1.5, 6]} />
          <meshToonMaterial color={INK} />
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.42, 0.32, 24, 1, true]} />
          <meshToonMaterial color="#e0a34a" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color="#ffe9b0" />
        </mesh>
        <pointLight position={[0, -0.25, 0]} intensity={12} distance={9} color="#ffd98a" />
        <spotLight
          position={[0, -0.1, 0]}
          target-position={[0, 0, 0]}
          angle={0.62}
          penumbra={0.7}
          intensity={55}
          distance={9}
          color="#ffce7a"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
        />
      </group>

      {/* 夜窗（挂在墙内侧） */}
      <group position={[0, 2.1, -9.3]} rotation={[0, 0, 0]}>
        <mesh>
          <planeGeometry args={[2.4, 1.7]} />
          <meshBasicMaterial color="#131b38" />
        </mesh>
        <mesh position={[0, 0.45, 0.02]}>
          <circleGeometry args={[0.24, 24]} />
          <meshBasicMaterial color="#f4ecd0" />
        </mesh>
        {[
          [-0.8, 0.5],
          [-0.5, 0.1],
          [0.6, 0.55],
          [0.9, 0.05],
          [0.3, -0.3],
          [-0.2, 0.6],
          [0.75, -0.5],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.02]}>
            <circleGeometry args={[0.02, 8]} />
            <meshBasicMaterial color="#dfe6ff" />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.04]}>
          <ringGeometry args={[1.19, 1.24, 4, 1, Math.PI / 4]} />
          <meshToonMaterial color="#5b4a32" />
        </mesh>
        <mesh>
          <planeGeometry args={[2.62, 1.92]} />
          <meshToonMaterial color="#5b4a32" />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[2.42, 1.72]} />
          <meshBasicMaterial color="#0c1226" transparent opacity={0} />
        </mesh>
        {/* 窗框纵横条 */}
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[0.07, 1.78]} />
          <meshToonMaterial color="#6d5a3f" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[2.58, 0.07]} />
          <meshToonMaterial color="#6d5a3f" />
        </mesh>
      </group>
      <pointLight position={[0, 2.4, -8.4]} intensity={6} distance={6} color="#7f9bff" />

      {/* 书架 */}
      <group position={[-5.2, 0, -6.4]} rotation={[0, 0.65, 0]}>
        <mesh position={[0, 1.05, -0.18]}>
          <boxGeometry args={[1.9, 2.1, 0.36]} />
          <meshToonMaterial color="#6d4a2f" />
        </mesh>
        {books.map((b, i) => (
          <mesh key={i} position={[b.x, b.y, 0.02]}>
            <boxGeometry args={[b.w, b.h, 0.26]} />
            <meshToonMaterial color={b.color} />
          </mesh>
        ))}
      </group>

      {/* 软木板证据墙：钉着的纸与红线 */}
      <group position={[4.6, 1.9, -6.2]} rotation={[0, -0.6, 0]}>
        <mesh>
          <boxGeometry args={[2.1, 1.5, 0.06]} />
          <meshToonMaterial color="#8a6b46" />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={[1.94, 1.34]} />
          <meshToonMaterial color="#c8a06a" />
        </mesh>
        {[
          [-0.55, 0.3, 0.08],
          [0.1, 0.35, -0.06],
          [0.6, 0.15, 0.12],
          [-0.35, -0.3, -0.1],
          [0.35, -0.35, 0.07],
        ].map(([x, y, r], i) => (
          <group key={i} position={[x, y, 0.05]} rotation={[0, 0, r]}>
            <mesh>
              <planeGeometry args={[0.34, 0.42]} />
              <meshToonMaterial color="#fdf8ec" />
            </mesh>
            <mesh position={[0, 0.24, 0.01]}>
              <circleGeometry args={[0.022, 10]} />
              <meshBasicMaterial color={i % 2 ? "#d94f3d" : "#e0a34a"} />
            </mesh>
            <mesh position={[0, 0.08, 0.008]}>
              <planeGeometry args={[0.24, 0.02]} />
              <meshToonMaterial color="#b8b0a0" />
            </mesh>
            <mesh position={[0, 0.02, 0.008]}>
              <planeGeometry args={[0.24, 0.02]} />
              <meshToonMaterial color="#b8b0a0" />
            </mesh>
            <mesh position={[0, -0.04, 0.008]}>
              <planeGeometry args={[0.18, 0.02]} />
              <meshToonMaterial color="#b8b0a0" />
            </mesh>
          </group>
        ))}
        {/* 红线连接 */}
        <mesh position={[0.05, 0.33, 0.07]} rotation={[0, 0, 1.25]}>
          <planeGeometry args={[0.85, 0.012]} />
          <meshBasicMaterial color="#d94f3d" />
        </mesh>
        <mesh position={[0.0, -0.06, 0.07]} rotation={[0, 0, -1.1]}>
          <planeGeometry args={[0.9, 0.012]} />
          <meshBasicMaterial color="#d94f3d" />
        </mesh>
      </group>

      {/* 绿植 */}
      <group position={[3.4, 0, 3.6]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.26, 0.2, 0.44, 16]} />
          <meshToonMaterial color="#c2557a" />
        </mesh>
        {[
          [0, 0.62, 0, 0.26],
          [0.16, 0.5, 0.08, 0.17],
          [-0.15, 0.55, -0.06, 0.19],
          [0.05, 0.82, -0.05, 0.15],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} castShadow>
            <sphereGeometry args={[r, 14, 14]} />
            <meshToonMaterial color={i % 2 ? "#3f7a44" : "#57995c"} />
          </mesh>
        ))}
      </group>

      {/* 挂钟 */}
      <group position={[-3.4, 2.5, -7.4]} rotation={[0, 0.5, 0]}>
        <mesh>
          <torusGeometry args={[0.34, 0.05, 10, 28]} />
          <meshToonMaterial color="#e0a34a" />
        </mesh>
        <mesh>
          <circleGeometry args={[0.32, 28]} />
          <meshToonMaterial color="#fdf8ec" />
        </mesh>
        <mesh position={[0, 0.06, 0.01]} rotation={[0, 0, 0.4]}>
          <planeGeometry args={[0.03, 0.2]} />
          <meshToonMaterial color={INK} />
        </mesh>
        <mesh position={[0.05, 0, 0.01]} rotation={[0, 0, -1.2]}>
          <planeGeometry args={[0.03, 0.26]} />
          <meshToonMaterial color={INK} />
        </mesh>
      </group>

      {/* 灯下漂浮尘埃 */}
      <Sparkles count={42} scale={[3.2, 2.4, 3.2]} position={[0, 1.6, 0]} size={2.4} speed={0.25} color="#ffd98a" opacity={0.5} />
    </group>
  );
}
