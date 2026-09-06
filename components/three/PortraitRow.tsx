"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import CastCharacter from "./characters/CastCharacter";
import { personaForRole } from "./characters/personas";
import type { RolePublic } from "@/contracts/public";

interface PortraitRowProps {
  roles: RolePublic[];
  selectedId?: string | null;
  onSelect?: (roleId: string) => void;
  /** 每个角色的附加覆盖（如嫌疑标签）。 */
  className?: string;
}

/** 排成一排的盲盒角色立柱（单 Canvas，档案页与指控页共用）。 */
export default function PortraitRow({ roles, selectedId, onSelect, className }: PortraitRowProps) {
  const gap = 1.05;
  const width = Math.max(roles.length * gap, 2.4);

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.04, width * 0.72 + 1.35], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(0, 1.02, 0)}
      >
        <ambientLight intensity={0.42} color="#c4bfe0" />
        <directionalLight position={[3, 6, 5]} intensity={0.9} color="#ffdcae" castShadow />
        <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#8f9bff" />
        <directionalLight position={[0, 2.5, 6]} intensity={0.4} color="#fff6e8" />
        <Environment resolution={64} frames={1} background={false}>
          <Lightformer intensity={0.6} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} color="#fff4e0" />
          <Lightformer intensity={0.3} position={[-5, 1, 0]} scale={[6, 3, 1]} rotation-y={Math.PI / 2} color="#cfd4ff" />
        </Environment>
        <group position={[0, 0, 0]}>
          {roles.map((role, i) => (
            <CastCharacter
              key={role.role_id}
              role={role}
              look={personaForRole(role)}
              position={[(i - (roles.length - 1) / 2) * gap, 0, 0]}
              rotationY={((i % 2 === 0 ? 1 : -1) * Math.PI) / 14}
              withStool={false}
              selected={selectedId === role.role_id}
              onClick={onSelect ? () => onSelect(role.role_id) : undefined}
              scale={0.92}
            />
          ))}
        </group>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={width + 1} blur={2.2} far={2} color="#120f1e" />
      </Canvas>
    </div>
  );
}
