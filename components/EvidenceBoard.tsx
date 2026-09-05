'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import EvidenceChip from './EvidenceChip';
import type { EvidenceFragmentPublic } from '@/contracts/types';

interface EvidenceBoardProps {
  evidences: EvidenceFragmentPublic[];
}

type LaneType = 'source' | 'retelling' | 'contradiction' | 'timeline';

const lanes: { id: LaneType; label: string; icon: string; color: string }[] = [
  { id: 'source', label: '原文事实', icon: '📄', color: 'from-green-500/20 to-emerald-500/20' },
  { id: 'retelling', label: '角色转述', icon: '💬', color: 'from-blue-500/20 to-cyan-500/20' },
  { id: 'contradiction', label: '矛盾点', icon: '⚡', color: 'from-red-500/20 to-rose-500/20' },
  { id: 'timeline', label: '时间轴', icon: '⏱️', color: 'from-purple-500/20 to-violet-500/20' },
];

export default function EvidenceBoard({ evidences }: EvidenceBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 将证据分类到不同泳道（Mock逻辑）
  const [boardState, setBoardState] = useState<Record<LaneType, EvidenceFragmentPublic[]>>({
    source: evidences.filter((e) => e.type === 'claim'),
    retelling: evidences.filter((e) => e.type === 'dialogue'),
    contradiction: evidences.filter((e) => e.type === 'contradiction'),
    timeline: [],
  });

  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [activeLane, setActiveLane] = useState<LaneType | null>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const evidenceId = active.id as string;
    const targetLane = over.id as LaneType;

    // 找到被拖拽的证据
    let draggedEvidence: EvidenceFragmentPublic | null = null;
    const newState = { ...boardState };

    // 从来源泳道移除
    for (const lane of Object.keys(newState) as LaneType[]) {
      const idx = newState[lane].findIndex((e) => e.evidence_id === evidenceId);
      if (idx !== -1) {
        draggedEvidence = newState[lane][idx];
        newState[lane] = newState[lane].filter((e) => e.evidence_id !== evidenceId);
        break;
      }
    }

    // 添加到目标泳道
    if (draggedEvidence) {
      newState[targetLane] = [...newState[targetLane], draggedEvidence];
    }

    setBoardState(newState);
    setActiveLane(null);
  };

  // 自动检测矛盾（简单逻辑：同实体但不同数字）
  const detectContradictions = () => {
    const contradictions: string[] = [];
    const dialogueEvidence = boardState.retelling;
    for (let i = 0; i < dialogueEvidence.length; i++) {
      for (let j = i + 1; j < dialogueEvidence.length; j++) {
        const a = dialogueEvidence[i];
        const b = dialogueEvidence[j];
        // 简单检测：如果两个证据都有数字且不同
        const numA = a.content.match(/\d+人?/);
        const numB = b.content.match(/\d+人?/);
        if (numA && numB && numA[0] !== numB[0]) {
          if (!contradictions.includes(a.evidence_id)) {
            contradictions.push(a.evidence_id);
          }
        }
      }
    }
    return contradictions;
  };

  const contradictionIds = detectContradictions();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      onDragOver={(event) => {
        if (event.over) {
          setActiveLane(event.over.id as LaneType);
        }
      }}
      onDragStart={() => setActiveLane(null)}
    >
      <div className="h-full flex gap-4 p-4">
        {/* 证据池 */}
        <div className="w-64 flex-shrink-0 glass-dark rounded-xl p-4 overflow-hidden flex flex-col">
          <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
            <span>🗂️</span> 证据池
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {evidences
              .filter(
                (e) =>
                  !Object.values(boardState).some((lane) =>
                    lane.some((item) => item.evidence_id === e.evidence_id)
                  )
              )
              .map((evidence) => (
                <EvidenceChip
                  key={evidence.evidence_id}
                  evidence={evidence}
                  selected={selectedEvidence === evidence.evidence_id}
                  onClick={() =>
                    setSelectedEvidence(
                      selectedEvidence === evidence.evidence_id ? null : evidence.evidence_id
                    )
                  }
                />
              ))}
            {evidences.filter(
              (e) =>
                !Object.values(boardState).some((lane) =>
                  lane.some((item) => item.evidence_id === e.evidence_id)
                )
            ).length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">
                所有证据已加入拼图
              </p>
            )}
          </div>
        </div>

        {/* 拼图区 - 4个泳道 */}
        <div className="flex-1 grid grid-cols-4 gap-4">
          {lanes.map((lane) => (
            <motion.div
              key={lane.id}
              id={lane.id}
              data-droppable={lane.id}
              className={`glass rounded-xl p-4 flex flex-col overflow-hidden bg-gradient-to-b ${lane.color} transition-all ${
                activeLane === lane.id ? 'ring-2 ring-indigo-500 scale-[1.02]' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                <span className="text-xl">{lane.icon}</span>
                <h3 className="font-bold text-white text-sm">{lane.label}</h3>
                <span className="ml-auto text-xs text-slate-400 bg-black/20 px-2 py-0.5 rounded-full">
                  {boardState[lane.id].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {boardState[lane.id].map((evidence) => (
                  <EvidenceChip
                    key={evidence.evidence_id}
                    evidence={{
                      ...evidence,
                      conflicts_with:
                        lane.id === 'contradiction' || contradictionIds.includes(evidence.evidence_id)
                          ? evidence.conflicts_with || 'auto'
                          : undefined,
                    }}
                    selected={selectedEvidence === evidence.evidence_id}
                    onClick={() =>
                      setSelectedEvidence(
                        selectedEvidence === evidence.evidence_id ? null : evidence.evidence_id
                      )
                    }
                  />
                ))}
                {boardState[lane.id].length === 0 && (
                  <div className="h-24 flex items-center justify-center text-slate-500 text-xs border-2 border-dashed border-white/10 rounded-lg">
                    拖拽证据到这里
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </DndContext>
  );
}
