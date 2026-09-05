'use client';

import { motion } from 'motion/react';
import type { RolePublic } from '@/contracts/types';
import { getRoleAvatar, getRoleName, getRoleBio } from '@/lib/roleUtils';

interface RoleCardProps {
  role: RolePublic;
  selected?: boolean;
  onClick?: () => void;
}

export default function RoleCard({ role, selected, onClick }: RoleCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`glass rounded-xl p-4 text-center cursor-pointer transition-all duration-300 ${
        selected
          ? 'border-indigo-500 glow-primary'
          : 'hover:border-white/20'
      }`}
    >
      <div className="text-4xl mb-2">{getRoleAvatar(role)}</div>
      <h4 className="font-bold text-white text-sm">{getRoleName(role)}</h4>
      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
        {getRoleBio(role)}
      </p>
    </motion.div>
  );
}
