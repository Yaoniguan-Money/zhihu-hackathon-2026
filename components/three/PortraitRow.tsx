"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import ChibiCharacter from "./characters/ChibiCharacter";
import { personaForRole } from "./characters/personas";
import type { RolePublic } from "@/contracts/public";

interface PortraitRowProps {
  roles: RolePublic[];
  selectedId?: string | null;
  onSelect?: (roleId: string) => void;
  /** 每个角色的附加覆盖（如嫌疑标签）。 */
  className?: string;
}

/** 排成一排的 Q 版角色立绘（单 Canvas，档案页与指控页共用）。 */
export default function PortraitRow({ roles, selectedId, onSelect, className }: PortraitRowProps) {
  const gap = 1.0;
  const width = Math.max(roles.length * gap, 2.4);

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.02, width * 0.72 + 1.1], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.75} color="#a9a4d6" />
        <directionalLight position={[3, 6, 5]} intensity={1.5} color="#ffe0b0" castShadow />
        <directionalLight position={[-4, 3, 2]} intensity={0.5} color="#8f9bff" />
        <group position={[0, 0, 0]}>
          {roles.map((role, i) => (
            <ChibiCharacter
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
