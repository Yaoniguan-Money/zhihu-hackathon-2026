'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Mesh } from 'three';
import type { RolePublic } from '@/contracts/types';
import { getRoleAvatar, getRoleName } from '@/lib/roleUtils';

interface RoleSeatProps {
  role: RolePublic;
  position: [number, number, number];
  rotation: [number, number, number];
  isSpeaking?: boolean;
  pressure?: number;
  onClick?: () => void;
}

export default function RoleSeat({
  role,
  position,
  rotation,
  isSpeaking = false,
  pressure = 0,
  onClick,
}: RoleSeatProps) {
  const meshRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (isSpeaking && glowRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      glowRef.current.scale.set(scale, 1, scale);
    }
  });

  const pressureColor = pressure > 60 ? '#ef4444' : pressure > 30 ? '#f59e0b' : '#10b981';

  return (
    <group position={position} rotation={rotation}>
      <mesh ref={meshRef} position={[0, 0.05, 0]} onClick={onClick}>
        <cylinderGeometry args={[0.6, 0.7, 0.1, 32]} />
        <meshStandardMaterial
          color={isSpeaking ? '#6366f1' : '#374151'}
          emissive={isSpeaking ? '#4f46e5' : '#000000'}
          emissiveIntensity={isSpeaking ? 0.5 : 0}
        />
      </mesh>

      {isSpeaking && (
        <mesh ref={glowRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.65, 32]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.6} side={2} />
        </mesh>
      )}

      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color={pressureColor} />
      </mesh>

      <Html
        position={[0, 1, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: 'none' }}
      >
        <div className="flex flex-col items-center">
          <div
            className={`text-4xl transition-transform duration-300 ${
              isSpeaking ? 'scale-125 animate-bounce' : ''
            }`}
          >
            {getRoleAvatar(role)}
          </div>
          <div className="text-white text-xs font-bold mt-1 whitespace-nowrap bg-black/50 px-2 py-0.5 rounded">
            {getRoleName(role)}
          </div>
        </div>
      </Html>
    </group>
  );
}
