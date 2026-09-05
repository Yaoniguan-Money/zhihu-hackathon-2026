'use client';

import { motion, AnimatePresence } from 'motion/react';
import type { EvidenceFragmentPublic } from '@/contracts/types';

interface ContradictionMarkerProps {
  contradictions: EvidenceFragmentPublic[];
  onSelect?: (evidenceId: string) => void;
}

export default function ContradictionMarker({ contradictions, onSelect }: ContradictionMarkerProps) {
  if (contradictions.length === 0) return null;

  return (
    <div className="glass-dark rounded-xl p-4 border-red-500/30">
      <h3 className="font-bold text-red-400 mb-3 flex items-center gap-2">
        <motion.span
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          ⚡
        </motion.span>
        检测到 {contradictions.length} 处矛盾
      </h3>
      <div className="space-y-2">
        <AnimatePresence>
          {contradictions.map((c, i) => (
            <motion.div
              key={c.evidence_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => onSelect?.(c.evidence_id)}
              className="glass rounded-lg p-3 cursor-pointer hover:border-red-500/50 transition-colors border border-red-500/20"
            >
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-sm">⚠</span>
                <p className="text-xs text-slate-300 flex-1">{c.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
