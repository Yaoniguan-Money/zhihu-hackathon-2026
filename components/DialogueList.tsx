'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DialogueTurn, RolePublic } from '@/contracts/types';
import { getRoleAvatar, getRoleName } from '@/lib/roleUtils';

interface DialogueListProps {
  dialogues: DialogueTurn[];
  roles: RolePublic[];
}

export default function DialogueList({ dialogues, roles }: DialogueListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dialogues]);

  const getRoleById = (id: string) => roles.find((r) => r.role_id === id);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto space-y-3 p-4"
    >
      <AnimatePresence initial={false}>
        {dialogues.map((dialogue) => {
          const role = getRoleById(dialogue.role_id);
          const isPlayer = dialogue.role_id === 'player';
          return (
            <motion.div
              key={dialogue.turn_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`glass rounded-xl p-3 ${
                isPlayer ? 'border-indigo-500/30 bg-indigo-500/5' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl flex-shrink-0">{role ? getRoleAvatar(role) : '🧑'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">
                      {isPlayer ? '你' : (role ? getRoleName(role) : '未知')}
                    </span>
                    <span className="text-xs text-slate-500 ml-auto">
                      {new Date(dialogue.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {dialogue.content}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
