'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

interface CameraRigProps {
  focusPosition?: [number, number, number] | null;
  onResetFocus?: () => void;
}

export default function CameraRig({ focusPosition, onResetFocus }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 3, 6));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (focusPosition) {
      const [x, y, z] = focusPosition;
      const dist = 2.5;
      const angle = Math.atan2(z, x);
      targetPos.current.set(
        x * 1.5,
        2,
        z * 1.5 + dist
      );
      targetLook.current.set(x, y, z);
    } else {
      targetPos.current.set(0, 3, 6);
      targetLook.current.set(0, 0, 0);
    }
  }, [focusPosition]);

  useFrame(() => {
    camera.position.lerp(targetPos.current, 0.05);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook.current, 0.05);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef as never}
      enablePan={false}
      minDistance={4}
      maxDistance={10}
      minPolarAngle={Math.PI / 4}
      maxPolarAngle={Math.PI / 2.2}
      enableDamping
      dampingFactor={0.05}
    />
  );
}
