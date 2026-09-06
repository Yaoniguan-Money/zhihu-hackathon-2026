"use client";

import { useMemo, type Ref } from "react";
import * as THREE from "three";
import { irisTexture } from "./canvasTextures";

/**
 * 盲盒风脸部系统。
 * 关键决定：
 * - 头型用 LatheGeometry 样条剖面（颅顶宽 → 颊最宽 → 下颌收窄 → 圆下巴），
 *   代替旧版的纯球体，解决「脸型不流畅」。
 * - 眼睛是「巩膜椭圆 + 虹膜盘叠层 + 上睫毛弧」，整体宽度约占头宽 17%
 *   （旧版 23% 的白球是「眼睛过大」的根源），睫毛带压住上缘形成杏仁形。
 * 所有比例常数集中在本文件底部，便于整体微调。
 */

const HEAD_CONTROL_POINTS: Array<[number, number]> = [
  [0.001, 0.44],
  [0.14, 0.425],
  [0.27, 0.375],
  [0.355, 0.29],
  [0.4, 0.18],
  [0.414, 0.05],
  [0.408, -0.08],
  [0.384, -0.2],
  [0.34, -0.3],
  [0.27, -0.385],
  [0.18, -0.438],
  [0.07, -0.462],
  [0.001, -0.468],
];

let headGeoCache: THREE.LatheGeometry | null = null;
export function headGeometry(): THREE.LatheGeometry {
  if (headGeoCache) return headGeoCache;
  const curve = new THREE.CatmullRomCurve3(
    HEAD_CONTROL_POINTS.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    "catmullrom",
    0.5,
  );
  const pts = curve.getPoints(40).map((p) => new THREE.Vector2(Math.max(0.0008, p.x), p.y));
  pts.push(new THREE.Vector2(0.0008, pts[pts.length - 1].y));
  headGeoCache = new THREE.LatheGeometry(pts, 64);
  return headGeoCache;
}

/** 椭圆体碎片：hair/服装通用。 */
export function Lock({
  p = [0, 0, 0],
  s = [1, 1, 1],
  r = [0, 0, 0],
  color,
  roughness = 0.62,
}: {
  p?: [number, number, number];
  s?: [number, number, number];
  r?: [number, number, number];
  color: string;
  roughness?: number;
}) {
  return (
    <mesh position={p} scale={s} rotation={r} castShadow>
      <sphereGeometry args={[0.5, 20, 16]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/** 杏仁眼：巩膜 + 虹膜叠层 + 上睫毛带 + 下睫细线 + 双高光。 */
function Eye({
  side,
  iris,
  lash,
  groupRef,
}: {
  side: 1 | -1;
  iris: string;
  lash: string;
  groupRef?: Ref<THREE.Group>;
}) {
  const zFace = FACE.eyeZ;
  return (
    <group
      ref={groupRef}
      position={[side * FACE.eyeX, FACE.eyeY, zFace]}
      rotation={[0, side * -0.08, side * -0.05]}
    >
      {/* 巩膜：竖椭圆，嵌进脸里 */}
      <mesh scale={[1, 1.14, 0.5]}>
        <sphereGeometry args={[FACE.eyeR, 22, 18]} />
        <meshStandardMaterial color="#fff9f5" roughness={0.32} />
      </mesh>
      {/* 虹膜叠层：占眼宽 ~91%，上缘被睫毛带压住 → 杏仁深色主调 */}
      <group position={[0, -0.008, FACE.eyeR * 0.5 + 0.006]}>
        <mesh>
          <circleGeometry args={[FACE.irisR, 30]} />
          <meshBasicMaterial map={irisTexture(iris)} toneMapped={true} />
        </mesh>
        <mesh position={[0, 0, 0.0015]}>
          <ringGeometry args={[FACE.irisR * 0.82, FACE.irisR, 30]} />
          <meshBasicMaterial color="#241512" />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <circleGeometry args={[FACE.irisR * 0.4, 20]} />
          <meshBasicMaterial color="#1c100d" />
        </mesh>
        {/* 主高光：统一光源方向（左上），不随眼睛镜像 */}
        <mesh position={[-0.018, 0.02, 0.004]}>
          <circleGeometry args={[0.013, 14]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* 次高光：右下 */}
        <mesh position={[0.015, -0.018, 0.004]}>
          <circleGeometry args={[0.006, 10]} />
          <meshBasicMaterial color="#ffffff" opacity={0.85} transparent />
        </mesh>
      </group>
      {/* 上睫毛带：厚弧压住虹膜上缘，形成深色杏仁轮廓 */}
      <mesh position={[0, 0.002, 0.044]} rotation={[0.05, 0, Math.PI * 0.04]}>
        <torusGeometry args={[0.061, 0.02, 10, 30, Math.PI * 0.9]} />
        <meshStandardMaterial color={lash} roughness={0.5} />
      </mesh>
      {/* 外眼角小睫毛钩 */}
      <mesh
        position={[side * FACE.eyeR * 1.02, 0.03, 0.038]}
        rotation={[0, 0, side * -1.0]}
        scale={[1, 0.5, 1]}
      >
        <sphereGeometry args={[0.02, 10, 8]} />
        <meshStandardMaterial color={lash} roughness={0.5} />
      </mesh>
      {/* 下睫细线 */}
      <mesh position={[0, -0.004, 0.034]} rotation={[0, 0, -Math.PI * 0.72]}>
        <torusGeometry args={[0.058, 0.005, 8, 20, Math.PI * 0.44]} />
        <meshStandardMaterial color={lash} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Brow({
  side,
  color,
  groupRef,
}: {
  side: 1 | -1;
  color: string;
  groupRef?: Ref<THREE.Group>;
}) {
  return (
    <group ref={groupRef} position={[side * FACE.browX, FACE.browY, FACE.browZ]}>
      <mesh rotation={[0, 0, Math.PI * 0.18]} scale={[1, 0.9, 1]}>
        <torusGeometry args={[0.052, 0.0125, 8, 20, Math.PI * 0.6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Mouth({
  ink,
  smileRef,
  openRef,
}: {
  ink: string;
  smileRef?: Ref<THREE.Mesh>;
  openRef?: Ref<THREE.Mesh>;
}) {
  return (
    <group position={[0, FACE.mouthY, FACE.mouthZ]}>
      <mesh ref={smileRef} rotation={[0, 0, Math.PI * 1.1]} scale={[1, 0.72, 1]}>
        <torusGeometry args={[0.036, 0.0085, 8, 20, Math.PI * 0.8]} />
        <meshStandardMaterial color={ink} roughness={0.55} transparent opacity={0.95} />
      </mesh>
      <mesh ref={openRef} position={[0, -0.008, -0.004]} scale={[1, 0.02, 0.45]}>
        <sphereGeometry args={[0.036, 16, 14]} />
        <meshStandardMaterial color="#7c2f36" roughness={0.55} />
      </mesh>
    </group>
  );
}

/** 头部基底：lathe 脸型 + 耳 + 鼻尖（腮红由主组件持有 ref 驱动）。 */
export function HeadBase({ skin }: { skin: string }) {
  const geo = useMemo(() => headGeometry(), []);
  const noseColor = useMemo(
    () => `#${new THREE.Color(skin).lerp(new THREE.Color("#c97a52"), 0.28).getHexString()}`,
    [skin],
  );
  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      {/* 耳 */}
      <mesh position={[-0.402, -0.02, 0.01]} rotation={[0, 0, 0.12]} scale={[0.5, 1.05, 0.8]}>
        <sphereGeometry args={[0.058, 14, 12]} />
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      <mesh position={[0.402, -0.02, 0.01]} rotation={[0, 0, -0.12]} scale={[0.5, 1.05, 0.8]}>
        <sphereGeometry args={[0.058, 14, 12]} />
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      {/* 鼻尖：极小、含在面里 */}
      <mesh position={[0, FACE.noseY, FACE.noseZ]}>
        <sphereGeometry args={[0.017, 12, 10]} />
        <meshStandardMaterial color={noseColor} roughness={0.5} />
      </mesh>
    </group>
  );
}

export { Eye, Brow, Mouth };

/**
 * 面部比例（头局部坐标，头中心为原点）。
 * 参考官方立绘测量：眼宽 ≈ 头宽 17%，眼距 ≈ 1 眼，眼位在脸中线略下，
 * 眉毛高于眼约 0.16，嘴在下颌上方 1/4。
 */
export const FACE = {
  eyeX: 0.143,
  eyeY: -0.028,
  eyeZ: 0.352,
  eyeR: 0.07, // 巩膜基半径 → 眼宽 0.14 ≈ 头宽 0.83 的 17%
  irisR: 0.064, // 虹膜半径 → 占眼宽 ~91%
  browX: 0.15,
  browY: 0.17,
  browZ: 0.345,
  noseY: -0.088,
  noseZ: 0.392,
  mouthY: -0.218,
  mouthZ: 0.376, // 下巴曲面在该高度的半径，嘴必须浮出此面（旧值 0.303 会埋进脸里）
  blushY: -0.125,
  blushZ: 0.318,
} as const;
