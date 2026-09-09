"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { createSwayOrbit, getSwayCameraPosition, type SwayOrbit } from "./camera-motion";

interface CameraRigProps {
  /** 聚焦的角色座位坐标（世界系）；null 表示回到全景。 */
  focus?: [number, number, number] | null;
  /** 入场电影运镜（仅挂载后执行一次）。 */
  intro?: boolean;
  /** 有界摇摆（大厅模式）：绕主体 ±约 28° 缓摆，替代无限环绕。 */
  sway?: boolean;
  /** 无聚焦时注视点的横向偏移：正值把主体推到画面左侧（给右侧 UI 面板让位）。 */
  targetBiasX?: number;
}

const DEFAULT_POS = new THREE.Vector3(0, 5.1, 8.8);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.75, -0.1);

export default function CameraRig({ focus, intro = true, sway = false, targetBiasX = 0 }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const targetPos = useRef(DEFAULT_POS.clone());
  const targetLook = useRef(DEFAULT_TARGET.clone());
  const userGrabbed = useRef(false);
  const swayOrbit = useRef<SwayOrbit | null>(null);
  const introTimeline = useRef<gsap.core.Timeline | null>(null);
  const introActive = useRef(false);

  useEffect(() => {
    if (!intro) return;
    const startPos = new THREE.Vector3(0, 7.8, 10.8);
    camera.position.copy(startPos);
    introActive.current = true;
    const tl = gsap.timeline({
      onComplete: () => {
        introActive.current = false;
        introTimeline.current = null;
      },
    });
    introTimeline.current = tl;
    tl.to(camera.position, {
      x: DEFAULT_POS.x,
      y: DEFAULT_POS.y,
      z: DEFAULT_POS.z,
      duration: 2.1,
      ease: "power3.out",
    });
    return () => {
      tl.kill();
      if (introTimeline.current === tl) introTimeline.current = null;
      introActive.current = false;
    };
  }, [camera, intro]);

  useEffect(() => {
    if (focus) {
      introTimeline.current?.kill();
      introTimeline.current = null;
      introActive.current = false;
    }
    const focusTarget = focus
      ? new THREE.Vector3(focus[0] * 0.38, 1.22, focus[2] * 0.38)
      : new THREE.Vector3(DEFAULT_TARGET.x + targetBiasX, DEFAULT_TARGET.y, DEFAULT_TARGET.z);
    targetLook.current.copy(focusTarget);
    if (!focus) swayOrbit.current = createSwayOrbit(DEFAULT_POS, focusTarget);
    if (focus) {
      const dir = new THREE.Vector3(focus[0], 0, focus[2]).normalize();
      // 相机放到说话者对面桌沿的斜上方：正视其面部，桌沿作前景，邻座退到画框边缘。
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      targetPos.current.set(
        -focus[0] * 1.35 + perp.x * 1.2,
        2.75,
        -focus[2] * 1.35 + perp.z * 1.2,
      );
    } else {
      targetPos.current.copy(DEFAULT_POS);
    }
  }, [focus, targetBiasX]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (introActive.current) return;
    if (focus && !userGrabbed.current) {
      controls.target.lerp(targetLook.current, 1 - Math.pow(0.002, delta));
      camera.position.lerp(targetPos.current, 1 - Math.pow(0.02, delta));
      controls.update();
    } else if (sway && !focus && !userGrabbed.current) {
      // 大厅有界摇摆：注视点固定在偏移后的桌心，相机绕其 ±约 28° 缓摆
      const t = state.clock.elapsedTime;
      const orbit = swayOrbit.current ?? createSwayOrbit(camera.position, targetLook.current);
      swayOrbit.current = orbit;
      camera.position.copy(getSwayCameraPosition(orbit, t));
      controls.target.copy(targetLook.current);
      camera.lookAt(targetLook.current);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={2.4}
      maxDistance={11}
      minPolarAngle={Math.PI / 7}
      maxPolarAngle={Math.PI / 2.05}
      enableDamping
      autoRotate={false}
      autoRotateSpeed={0.55}
      dampingFactor={0.08}
      onStart={() => {
        userGrabbed.current = true;
      }}
      onEnd={() => {
        // 用户松手后延迟恢复程序运镜权限，给观察留出时间
        setTimeout(() => {
          userGrabbed.current = false;
        }, 2500);
      }}
    />
  );
}
