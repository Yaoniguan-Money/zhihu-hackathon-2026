import * as THREE from "three";

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
