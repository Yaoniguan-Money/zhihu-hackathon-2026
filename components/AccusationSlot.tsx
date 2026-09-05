'use client';

import { motion, AnimatePresence } from 'motion/react';
import type { EvidenceFragmentPublic } from '@/contracts/types';

interface AccusationSlotProps {
  index: number;
  evidence?: EvidenceFragmentPublic;
  onRemove?: () => void;
}

export default function AccusationSlot({ index, evidence, onRemove }: AccusationSlotProps) {
  return (
    <div
      className={`min-h-[110px] rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${
        evidence
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-white/10'
      }`}
    >
      <AnimatePresence mode="wait">
        {evidence ? (
          <motion.div
            key={evidence.evidence_id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="p-2 w-full cursor-pointer"
            onClick={onRemove}
          >
            <div className="glass rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
                  证据 {index + 1}
                </span>
              </div>
              <p className="text-xs text-slate-300 line-clamp-3">{evidence.content}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-slate-500 text-sm"
          >
            槽位 {index + 1}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
