'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import RoleSeat from './RoleSeat';
import CameraRig from './CameraRig';
import { motion, AnimatePresence } from 'motion/react';
import type { RolePublic, DialogueTurn } from '@/contracts/types';
import { getRoleAvatar, getRoleName } from '@/lib/roleUtils';
import type { Mesh } from 'three';

interface RoundTableProps {
  roles: RolePublic[];
  dialogues: DialogueTurn[];
  onRoleClick?: (roleId: string) => void;
}

function TableScene({ roles, dialogues, onRoleClick }: RoundTableProps) {
  const tableRef = useRef<Mesh>(null);
  const [focusPos, setFocusPos] = useState<[number, number, number] | null>(null);

  const seatPositions = useMemo(() => {
    const angleStep = (Math.PI * 2) / 5;
    const radius = 3;
    return roles.map((role, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      return {
        role,
        position: [x, 0, z] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        angle,
      };
    });
  }, [roles]);

  // 只显示AI角色的最新发言（不显示玩家自己的消息）
  const latestAIDialogue = useMemo(() => {
    for (let i = dialogues.length - 1; i >= 0; i--) {
      if (dialogues[i].role_id !== 'player') return dialogues[i];
    }
    return null;
  }, [dialogues]);

  const currentSpeakerId = latestAIDialogue?.role_id || null;

  const rolePressure = useMemo(() => {
    const pressureMap: Record<string, number> = {};
    dialogues.forEach((d) => {
      pressureMap[d.role_id] = d.pressure_level;
    });
    return pressureMap;
  }, [dialogues]);

  useFrame((state) => {
    if (tableRef.current) {
      tableRef.current.rotation.y += 0.0005;
    }
  });

  const handleRoleClickInternal = (roleId: string, pos: [number, number, number]) => {
    setFocusPos(pos);
    onRoleClick?.(roleId);
    setTimeout(() => setFocusPos(null), 3000);
  };

  // 截断对话内容，3D气泡只显示前60字
  const truncateText = (text: string, max = 60) => {
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.8} color="#818cf8" />
      <pointLight position={[3, 2, 3]} intensity={0.3} color="#f472b6" />
      <pointLight position={[-3, 2, -3]} intensity={0.3} color="#60a5fa" />

      {/* 中央圆桌 */}
      <mesh ref={tableRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2, 2.1, 0.15, 64]} />
        <meshStandardMaterial color="#1e1b4b" metalness={0.3} roughness={0.5} />
      </mesh>

      {/* 桌面发光环 */}
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2, 64]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.3} side={2} />
      </mesh>

      {/* 中心光球 */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.8} />
      </mesh>

      {/* 5个角色座位 */}
      {seatPositions.map(({ role, position, rotation }) => (
        <RoleSeat
          key={role.role_id}
          role={role}
          position={position}
          rotation={rotation}
          isSpeaking={role.role_id === currentSpeakerId}
          pressure={rolePressure[role.role_id] || 20}
          onClick={() => handleRoleClickInternal(role.role_id, position)}
        />
      ))}

      {/* 对话气泡 - 只显示AI角色回复，截断长文本 */}
      {currentSpeakerId && latestAIDialogue && (() => {
        const seat = seatPositions.find((s) => s.role.role_id === currentSpeakerId);
        if (!seat) return null;
        const role = seat.role;
        return (
          <Html
            position={[seat.position[0], 1.8, seat.position[2]]}
            center
            distanceFactor={10}
            style={{ pointerEvents: 'none' }}
          >
            <AnimatePresence>
              <motion.div
                key={latestAIDialogue.turn_id}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="bg-slate-900/90 backdrop-blur-sm rounded-xl px-3 py-2 max-w-[200px] border border-white/10 shadow-xl"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-base">{getRoleAvatar(role)}</span>
                  <span className="text-xs font-bold text-white">{getRoleName(role)}</span>
                </div>
                <p className="text-xs text-slate-200 leading-snug">
                  {truncateText(latestAIDialogue.content)}
                </p>
              </motion.div>
            </AnimatePresence>
          </Html>
        );
      })()}

      {/* 摄像机控制 */}
      <CameraRig focusPosition={focusPos} onResetFocus={() => setFocusPos(null)} />
    </>
  );
}

export default function RoundTable(props: RoundTableProps) {
  return (
    <Canvas
      camera={{ position: [0, 3, 6], fov: 50 }}
      style={{ background: 'transparent' }}
    >
      <TableScene {...props} />
    </Canvas>
  );
}
