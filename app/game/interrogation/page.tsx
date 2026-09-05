'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import PressureBar from '@/components/PressureBar';
import DialogueList from '@/components/DialogueList';
import RecordButton from '@/components/RecordButton';
import { mockReplies } from '@/mock/goldenCase';
import { getRoleAvatar, getRoleName } from '@/lib/roleUtils';
import type { RolePublic, DialogueTurn } from '@/contracts/types';

const RoundTable = dynamic(
  () => import('@/components/three/RoundTable'),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-slate-400">加载3D场景中...</div> }
);

let replyIndex = 0;

export default function InterrogationPage() {
  const router = useRouter();
  const { casePublic, gameConfig, dialogues, addDialogue, currentRound, nextRound, unlockEvidenceByRole } = useGame();
  const [inputText, setInputText] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(90);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(gameConfig.interrogation_time_limit);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setShowTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameConfig.interrogation_time_limit]);

  const handleSend = useCallback(() => {
    if (!inputText.trim() || !casePublic) return;

    const playerTurn: DialogueTurn = {
      turn_id: `t-player-${Date.now()}`,
      role_id: 'player',
      content: inputText,
      timestamp: Date.now(),
      pressure_level: 0,
      is_interrupted: false,
    };

    addDialogue(playerTurn);
    setInputText('');
    setIsThinking(true);

    setTimeout(() => {
      const reply = selectedRoleId
        ? mockReplies.find((r) => r.roleId === selectedRoleId) || mockReplies[replyIndex % mockReplies.length]
        : mockReplies[replyIndex % mockReplies.length];
      replyIndex++;
      const roleTurn: DialogueTurn = {
        turn_id: `t-${Date.now()}`,
        role_id: reply.roleId,
        content: reply.content,
        timestamp: Date.now(),
        pressure_level: reply.pressure,
        is_interrupted: false,
        metadata: {
          related_claim_ids: reply.claims,
        },
      };
      addDialogue(roleTurn);
      unlockEvidenceByRole(reply.roleId);
      setIsThinking(false);
    }, 1500);
  }, [inputText, casePublic, addDialogue, selectedRoleId, unlockEvidenceByRole]);

  const handleRoleClick = (roleId: string) => {
    setSelectedRoleId(roleId);
  };

  const handleNextRound = () => {
    setShowTimeUp(false);
    nextRound();
    setTimeLeft(gameConfig.interrogation_time_limit);
  };

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

  const selectedRole = casePublic.roles.find((r: RolePublic) => r.role_id === selectedRoleId);
  const maxRounds = gameConfig.max_rounds;

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      {/* 主区域：3D桌 + 对话面板 */}
      <div className="flex-1 flex">
        {/* 左侧：3D审讯桌 */}
        <div className="flex-1 relative">
          <RoundTable
            roles={casePublic.roles}
            dialogues={dialogues}
            onRoleClick={handleRoleClick}
          />

          {/* 顶部信息条 */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
            <div className="glass rounded-full px-4 py-2 text-sm">
              <span className="text-slate-400">第 </span>
              <span className="text-white font-bold">{currentRound}</span>
              <span className="text-slate-400"> / {maxRounds} 轮</span>
            </div>
            <div className="glass rounded-full px-4 py-2 text-sm">
              <span className="text-slate-400">剩余 </span>
              <span className={`font-bold ${timeLeft < 30 ? 'text-red-400' : 'text-white'}`}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* 操作提示 */}
          {dialogues.length <= 5 && !selectedRoleId && !isThinking && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm text-slate-300 animate-pulse">
              👆 点击角色头像选择审讯对象，在底部输入框提问
            </div>
          )}

          {/* 被选中角色信息 */}
          {selectedRole && (
            <div className="absolute top-16 left-4 glass rounded-xl p-3 max-w-xs">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{getRoleAvatar(selectedRole)}</span>
                <div>
                  <div className="font-bold text-white">{getRoleName(selectedRole)}</div>
                  <div className="text-xs text-slate-400">{selectedRole.public_bio}</div>
                </div>
              </div>
              <div className="mt-2">
                <PressureBar
                  value={dialogues.find((d: DialogueTurn) => d.role_id === selectedRoleId)?.pressure_level || 30}
                  label="当前压力"
                />
              </div>
            </div>
          )}

          {/* AI 思考中提示 */}
          {isThinking && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 text-sm text-slate-300 animate-pulse">
              角色正在思考...
            </div>
          )}

          {/* 时间到弹窗 */}
          {showTimeUp && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="glass rounded-2xl p-8 text-center max-w-sm">
                <div className="text-5xl mb-4">⏰</div>
                <h3 className="text-xl font-bold text-white mb-2">时间到！</h3>
                <p className="text-slate-400 mb-6 text-sm">
                  {currentRound < maxRounds
                    ? `本轮审讯结束，进入第 ${currentRound + 1} 轮`
                    : '所有轮次结束，请提交指控'}
                </p>
                <div className="flex gap-3 justify-center">
                  {currentRound < maxRounds && (
                    <button
                      onClick={handleNextRound}
                      className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full hover:from-indigo-500 hover:to-purple-500 transition-all"
                    >
                      进入下一轮 →
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/game/accusation')}
                    className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-full hover:from-red-500 hover:to-orange-500 transition-all"
                  >
                    ⚡ 提交指控
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：对话列表面板 */}
        <div className="w-80 border-l border-white/5 glass-dark flex flex-col">
          <div className="px-4 py-3 border-b border-white/5">
            <h3 className="font-bold text-white text-sm">对话记录</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              共 {dialogues.length} 条 · 点击右侧证据板对比矛盾
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <DialogueList dialogues={dialogues} roles={casePublic.roles} />
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="glass-dark border-t border-white/5 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* 压力条 */}
          <div className="grid grid-cols-5 gap-2">
            {casePublic.roles.map((role: RolePublic) => {
              const pressure = dialogues.find((d: DialogueTurn) => d.role_id === role.role_id)?.pressure_level || 20;
              return (
                <div
                  key={role.role_id}
                  onClick={() => handleRoleClick(role.role_id)}
                  className={`glass rounded-lg p-2 cursor-pointer transition-all ${
                    selectedRoleId === role.role_id
                      ? 'border-indigo-500'
                      : 'hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getRoleAvatar(role)}</span>
                    <span className="text-xs text-white font-medium truncate">{getRoleName(role)}</span>
                  </div>
                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pressure > 60
                          ? 'bg-red-500'
                          : pressure > 30
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${pressure}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 输入区 */}
          <div className="flex gap-3 items-center">
            <RecordButton
              isRecording={isRecording}
              onStart={() => setIsRecording(true)}
              onStop={() => {
                setIsRecording(false);
                handleSend();
              }}
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={selectedRole ? `向 ${getRoleName(selectedRole)} 提问...` : '先点选一个角色，再提问...'}
              className="flex-1 bg-slate-800/50 border border-white/10 rounded-full px-5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />

            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className={`px-6 py-2 rounded-full transition-all ${
                inputText.trim()
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              发送
            </button>
          </div>

          {/* 快捷操作 */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/game/evidence')}
                className="px-4 py-2 glass rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                📋 证据板
              </button>
              <button
                onClick={() => {
                  setShowTimeUp(false);
                  handleNextRound();
                }}
                className="px-4 py-2 glass rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                ⏭ 跳过本轮
              </button>
            </div>
            <button
              onClick={() => router.push('/game/accusation')}
              className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-medium hover:from-red-500 hover:to-orange-500 transition-all"
            >
              ⚡ 提交指控
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
