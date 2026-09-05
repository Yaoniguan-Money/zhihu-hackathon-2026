'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '@/context/GameContext';
import EvidenceChip from '@/components/EvidenceChip';
import AccusationSlot from '@/components/AccusationSlot';
import { getRoleAvatar, getRoleName, getRoleBio } from '@/lib/roleUtils';
import type { EvidenceFragmentPublic, RolePublic } from '@/contracts/types';

export default function AccusationPage() {
  const router = useRouter();
  const { casePublic, gameConfig, evidences, submitAccusation } = useGame();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedEvidences, setSelectedEvidences] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const maxSlots = gameConfig.evidence_slots;

  if (!casePublic) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔍</div>
          <p className="text-slate-400">正在加载...</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-indigo-400 hover:underline">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const toggleEvidence = (evidenceId: string) => {
    setSelectedEvidences((prev) => {
      if (prev.includes(evidenceId)) {
        return prev.filter((id) => id !== evidenceId);
      }
      if (prev.length >= maxSlots) {
        return prev;
      }
      return [...prev, evidenceId];
    });
  };

  const handleSubmit = () => {
    if (!selectedRoleId || selectedEvidences.length === 0) return;
    setShowConfirm(true);
  };

  const confirmSubmit = () => {
    submitAccusation({
      accused_role_id: selectedRoleId!,
      evidence_ids: selectedEvidences,
      reasoning,
    });
    router.push('/game/reveal');
  };

  const selectedRole = casePublic.roles.find((r: RolePublic) => r.role_id === selectedRoleId);

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-block px-4 py-1 rounded-full bg-red-500/20 text-red-400 text-sm mb-4">
          ⚡ 最终指控
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          你指控谁是篡改者？
        </h1>
        <p className="text-slate-400">
          选择你认为的篡改者，并提交 {maxSlots} 条证据支撑你的指控
        </p>
      </div>

      {/* 角色选择 */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <span>👤</span> 第一步：选择嫌疑人
        </h2>
        <div className="grid grid-cols-5 gap-4">
          {casePublic.roles.map((role: RolePublic) => (
            <motion.div
              key={role.role_id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedRoleId(role.role_id)}
              className={`glass rounded-xl p-4 text-center cursor-pointer transition-all ${
                selectedRoleId === role.role_id
                  ? 'border-red-500 ring-2 ring-red-500/30 glow-danger'
                  : 'hover:border-white/20'
              }`}
            >
              <div className="text-4xl mb-2">{getRoleAvatar(role)}</div>
              <h4 className="font-bold text-white text-sm">{getRoleName(role)}</h4>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {getRoleBio(role)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 证据槽位 */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <span>📎</span> 第二步：提交证据（{selectedEvidences.length}/{maxSlots}）
        </h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {Array.from({ length: maxSlots }).map((_, i) => {
            const evidenceId = selectedEvidences[i];
            const evidence = evidences.find((e: EvidenceFragmentPublic) => e.evidence_id === evidenceId);
            return (
              <AccusationSlot
                key={i}
                index={i}
                evidence={evidence}
                onRemove={() => evidence && toggleEvidence(evidence.evidence_id)}
              />
            );
          })}
        </div>

        <div className="max-h-64 overflow-y-auto">
          <p className="text-xs text-slate-500 mb-2">点击证据添加/移除：</p>
          <div className="grid grid-cols-2 gap-2">
            {evidences.map((evidence: EvidenceFragmentPublic) => (
              <div
                key={evidence.evidence_id}
                onClick={() => toggleEvidence(evidence.evidence_id)}
              >
                <EvidenceChip
                  evidence={evidence}
                  draggable={false}
                  selected={selectedEvidences.includes(evidence.evidence_id)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 推理说明 */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <span>💭</span> 第三步：你的推理（可选）
        </h2>
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="简述你为什么认为这个人是篡改者..."
          className="w-full h-24 bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none text-sm"
        />
      </div>

      {/* 提交按钮 */}
      <div className="text-center">
        <button
          onClick={handleSubmit}
          disabled={!selectedRoleId || selectedEvidences.length === 0}
          className={`px-10 py-4 font-bold rounded-full text-lg transition-all duration-300 ${
            selectedRoleId && selectedEvidences.length > 0
              ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-500 hover:to-orange-500 glow-danger hover:scale-105'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          确认指控 →
        </button>
        <p className="text-xs text-slate-500 mt-3">
          {!selectedRoleId && '请先选择嫌疑人'}
          {selectedRoleId && selectedEvidences.length === 0 && '请至少选择1条证据'}
          {selectedRoleId && selectedEvidences.length > 0 && `准备指控 ${selectedRole ? getRoleName(selectedRole) : ''}`}
        </p>
      </div>

      {/* 确认弹窗 */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl p-8 max-w-md text-center"
            >
              <div className="text-5xl mb-4">⚡</div>
              <h3 className="text-xl font-bold text-white mb-2">
                确认指控？
              </h3>
              <p className="text-slate-400 mb-6">
                你即将指控 <span className="text-red-400 font-bold">{selectedRole ? getRoleName(selectedRole) : ''}</span> 为篡改者。
                <br />
                提交后将无法更改。
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-6 py-2 glass rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  再想想
                </button>
                <button
                  onClick={confirmSubmit}
                  className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-full hover:from-red-500 hover:to-orange-500 transition-all"
                >
                  确认提交
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
