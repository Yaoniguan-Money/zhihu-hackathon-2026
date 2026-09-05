"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

interface CameraRigProps {
  /** 聚焦的角色座位坐标（世界系）；null 表示回到全景。 */
  focus?: [number, number, number] | null;
  /** 入场电影运镜（仅挂载后执行一次）。 */
  intro?: boolean;
  /** 慢速自动环绕（大厅模式）。 */
  autoRotate?: boolean;
}

const DEFAULT_POS = new THREE.Vector3(0, 3.4, 6.6);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.9, 0);

export default function CameraRig({ focus, intro = true, autoRotate = false }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const targetPos = useRef(DEFAULT_POS.clone());
  const targetLook = useRef(DEFAULT_TARGET.clone());
  const userGrabbed = useRef(false);

  useEffect(() => {
    if (!intro) return;
    const startPos = new THREE.Vector3(0, 8.5, 11.5);
    camera.position.copy(startPos);
    const tl = gsap.timeline();
    tl.to(camera.position, {
      x: DEFAULT_POS.x,
      y: DEFAULT_POS.y,
      z: DEFAULT_POS.z,
      duration: 2.1,
      ease: "power3.out",
    });
    return () => {
      tl.kill();
    };
  }, [camera, intro]);

  useEffect(() => {
    const focusTarget = focus
      ? new THREE.Vector3(focus[0] * 0.92, 1.15, focus[2] * 0.92)
      : DEFAULT_TARGET.clone();
    targetLook.current.copy(focusTarget);
    if (focus) {
      const dir = new THREE.Vector3(focus[0], 0, focus[2]).normalize();
      // 站到角色外侧斜上方，看向桌心
      targetPos.current.set(
        focus[0] * 0.55 - dir.z * 2.6,
        2.2,
        focus[2] * 0.55 + dir.x * 2.6,
      );
    } else {
      targetPos.current.copy(DEFAULT_POS);
    }
  }, [focus]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (focus && !userGrabbed.current) {
      controls.target.lerp(targetLook.current, 1 - Math.pow(0.002, delta));
      camera.position.lerp(targetPos.current, 1 - Math.pow(0.02, delta));
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
      autoRotate={autoRotate && !focus}
      autoRotateSpeed={0.55}
      dampingFactor={0.08}
      onStart={() => {
        userGrabbed.current = true;
      }}
      onEnd={() => {
        // 用户松手后延迟恢复程序运镜权限
        setTimeout(() => {
          userGrabbed.current = false;
        }, 400);
      }}
    />
  );
}
