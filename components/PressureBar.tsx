'use client';

import { motion } from 'motion/react';

interface PressureBarProps {
  value: number; // 0-100
  label?: string;
}

export default function PressureBar({ value, label = '压力值' }: PressureBarProps) {
  const getColor = (v: number) => {
    if (v < 30) return 'from-green-500 to-emerald-500';
    if (v < 60) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  };

  const getGlow = (v: number) => {
    if (v < 30) return '';
    if (v < 60) return 'shadow-orange-500/30';
    return 'shadow-red-500/50';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${getColor(value)} shadow-lg ${getGlow(value)}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
