import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  createSwayOrbit,
  getCameraInteractionPolicy,
  getSwayCameraPosition,
} from "@/components/three/camera-motion";

describe("大厅相机摇摆", () => {
  test("首屏自由模式允许近乎全向环视且不会恢复程序运镜", () => {
    const policy = getCameraInteractionPolicy("free");
    expect(policy.minPolarAngle).toBeLessThanOrEqual(0.1);
    expect(policy.maxPolarAngle).toBeGreaterThanOrEqual(Math.PI - 0.1);
    expect(policy.resumeProgrammaticMotion).toBe(false);
  });

  test("连续渲染不会把摇摆角度累积成失控旋转", () => {
    const target = new THREE.Vector3(1.35, 0.75, -0.1);
    const start = new THREE.Vector3(0, 5.1, 8.8);
    const orbit = createSwayOrbit(start, target);
    let position = start.clone();

    for (let frame = 0; frame < 60 * 12; frame += 1) {
      position = getSwayCameraPosition(orbit, frame / 60);
    }

    const finalTheta = Math.atan2(position.x - target.x, position.z - target.z);
    const startTheta = Math.atan2(start.x - target.x, start.z - target.z);
    const wrappedDelta = Math.atan2(Math.sin(finalTheta - startTheta), Math.cos(finalTheta - startTheta));
    expect(Math.abs(wrappedDelta)).toBeLessThanOrEqual(0.51);
  });
});
