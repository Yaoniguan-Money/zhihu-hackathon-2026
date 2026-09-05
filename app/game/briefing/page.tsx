'use client';

import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import RoleCard from '@/components/RoleCard';
import type { RolePublic } from '@/contracts/types';

export default function BriefingPage() {
  const router = useRouter();
  const { casePublic, sourceDoc, goToInterrogation } = useGame();

  if (!casePublic) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔍</div>
          <p className="text-slate-400">正在加载案件资料...</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-indigo-400 hover:underline">
            返回首页重新开始
          </button>
        </div>
      </div>
    );
  }

  const startInterrogation = () => {
    goToInterrogation();
    router.push('/game/interrogation');
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      {/* 案件标题 */}
      <div className="text-center mb-10">
        <div className="inline-block px-4 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-sm mb-4">
          案件档案
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          {casePublic.title}
        </h1>
        <p className="text-slate-400 text-sm">
          来源：{casePublic.source_url}
        </p>
      </div>

      {/* 案件简介 */}
      <div className="glass rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>📄</span> 案情摘要
        </h2>
        <div className="text-slate-300 leading-relaxed whitespace-pre-line text-sm">
          {sourceDoc?.canonical_text
            .replace(/^# .+$/m, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim() || casePublic.summary}
        </div>
      </div>

      {/* 角色列表 */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>👥</span> 涉案角色
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {casePublic.roles.map((role: RolePublic) => (
            <RoleCard key={role.role_id} role={role} />
          ))}
        </div>
      </div>

      {/* 游戏规则提示 */}
      <div className="glass-dark rounded-xl p-5 mb-8">
        <h3 className="font-bold text-white mb-3 flex items-center gap-2">
          <span>🎯</span> 你的任务
        </h3>
        <ul className="text-sm text-slate-400 space-y-2">
          <li>• 5个角色中有1位篡改者，其余为忠实角色</li>
          <li>• 通过审讯提问，收集角色发言并保存为证据</li>
          <li>• 在证据板上对比事实，发现篡改痕迹</li>
          <li>• 最终提交指控：篡改者身份 + 证据链</li>
        </ul>
      </div>

      {/* 开始按钮 */}
      <div className="text-center">
        <button
          onClick={startInterrogation}
          className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-full text-lg hover:from-indigo-500 hover:to-purple-500 transition-all duration-300 glow-primary hover:scale-105"
        >
          开始审讯 →
        </button>
      </div>
    </div>
  );
}
