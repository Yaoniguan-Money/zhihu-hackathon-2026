'use client';

import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';
import EvidenceBoard from '@/components/EvidenceBoard';

export default function EvidencePage() {
  const router = useRouter();
  const { casePublic, evidences } = useGame();

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

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      {/* 顶部工具栏 */}
      <div className="glass-dark border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-white flex items-center gap-2">
            <span>🧩</span> 证据链拼图
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            将证据碎片拖入对应泳道，发现矛盾关系
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/game/interrogation')}
            className="px-4 py-2 glass rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            ← 返回审讯
          </button>
          <button
            onClick={() => router.push('/game/accusation')}
            className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-medium hover:from-red-500 hover:to-orange-500 transition-all"
          >
            ⚡ 提交指控
          </button>
        </div>
      </div>

      {/* 证据板主体 */}
      <div className="flex-1 overflow-hidden">
        <EvidenceBoard evidences={evidences} />
      </div>
    </div>
  );
}
