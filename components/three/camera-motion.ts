import * as THREE from "three";

export type CameraInteractionMode = "guided" | "free";

export interface CameraInteractionPolicy {
  minPolarAngle: number;
  maxPolarAngle: number;
  resumeProgrammaticMotion: boolean;
}

export function getCameraInteractionPolicy(mode: CameraInteractionMode): CameraInteractionPolicy {
  if (mode === "free") {
    return {
      // 避开球坐标两极的奇点，同时保留近乎完整的上下环视范围。
      minPolarAngle: 0.08,
      maxPolarAngle: Math.PI - 0.08,
      // 玩家一旦接管首屏相机，就保持其视角，不再由自动摇摆拉回。
      resumeProgrammaticMotion: false,
    };
  }
  return {
    minPolarAngle: Math.PI / 7,
    maxPolarAngle: Math.PI / 2.05,
    resumeProgrammaticMotion: true,
  };
}

export interface SwayOrbit {
  target: THREE.Vector3;
  radius: number;
  phi: number;
  theta: number;
}

export function createSwayOrbit(position: THREE.Vector3, target: THREE.Vector3): SwayOrbit {
  const base = position.clone().sub(target);
  const radius = base.length();
  return {
    target: target.clone(),
    radius,
    phi: Math.acos(THREE.MathUtils.clamp(base.y / radius, -1, 1)),
    theta: Math.atan2(base.x, base.z),
  };
}

/** 计算大厅相机的有界摇摆位置：每帧相对固定基准角度计算，不累积旋转。 */
export function getSwayCameraPosition(orbit: SwayOrbit, elapsedTime: number): THREE.Vector3 {
  const theta = orbit.theta + Math.sin(elapsedTime * 0.1) * 0.5;
  return new THREE.Vector3().setFromSphericalCoords(orbit.radius, orbit.phi, theta).add(orbit.target);
}
