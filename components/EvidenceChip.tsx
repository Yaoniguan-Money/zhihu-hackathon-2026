'use client';

import { motion } from 'motion/react';
import type { EvidenceFragmentPublic } from '@/contracts/types';

interface EvidenceChipProps {
  evidence: EvidenceFragmentPublic;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  selected?: boolean;
}

const typeLabels: Record<EvidenceFragmentPublic['type'], { label: string; color: string; icon: string }> = {
  dialogue: { label: '对话', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '💬' },
  claim: { label: '事实', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '📝' },
  contradiction: { label: '矛盾', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '⚡' },
};

export default function EvidenceChip({
  evidence,
  draggable = true,
  onClick,
  selected = false,
}: EvidenceChipProps) {
  const typeInfo = typeLabels[evidence.type];
  const hasContradiction = !!evidence.conflicts_with;

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      draggable={draggable}
      onClick={onClick}
      className={`glass rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all ${
        selected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : ''
      } ${hasContradiction ? 'border-red-500/50 glow-danger' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {hasContradiction && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                ⚠ 矛盾
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
            {evidence.content}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
