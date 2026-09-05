'use client';

import { useRouter } from 'next/navigation';
import { useGame } from '@/context/GameContext';

export default function Home() {
  const router = useRouter();
  const { startGame } = useGame();

  const handleStart = () => {
    startGame();
    router.push('/game/briefing');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* 主内容 */}
      <div className="relative z-10 text-center max-w-2xl">
        {/* Logo / 标题 */}
        <div className="mb-8 animate-float">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-5xl font-bold mb-3 text-gradient">
            证据链狼人杀
          </h1>
          <p className="text-xl text-slate-400">
            Evidence Chain
          </p>
        </div>

        {/* 副标题 */}
        <p className="text-lg text-slate-300 mb-12 leading-relaxed">
          所有话语和材料都来自原文，但只有部分叙述保留了原意。
          <br />
          找出那个偷偷改变了事实之间关联的人。
        </p>

        {/* 模式选择卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* 系统案件 */}
          <div
            onClick={handleStart}
            className="glass rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:scale-105 hover:border-indigo-500/50 group"
          >
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-xl font-bold mb-2 text-white group-hover:text-indigo-400 transition-colors">
              系统案件
            </h3>
            <p className="text-slate-400 text-sm">
              精选案件，立即开始审讯
            </p>
            <div className="mt-4 text-xs text-indigo-400">
              星辰科技裁员事件 · Demo
            </div>
          </div>

          {/* 自定义案件 */}
          <div className="glass rounded-2xl p-6 opacity-50 cursor-not-allowed">
            <div className="text-4xl mb-4">🔗</div>
            <h3 className="text-xl font-bold mb-2 text-white">
              粘贴知乎链接
            </h3>
            <p className="text-slate-400 text-sm">
              输入知乎文章链接生成案件
            </p>
            <div className="mt-4 text-xs text-slate-500">
              敬请期待
            </div>
          </div>
        </div>

        {/* 游戏说明 */}
        <div className="glass-dark rounded-xl p-6 text-left">
          <h4 className="font-bold text-white mb-3 flex items-center gap-2">
            <span>📜</span> 游戏规则
          </h4>
          <ul className="text-sm text-slate-400 space-y-2">
            <li>• 5个AI角色围坐圆桌，其中1人是篡改者</li>
            <li>• 通过审讯提问，收集角色发言作为证据</li>
            <li>• 在证据板上拼凑事实，发现矛盾之处</li>
            <li>• 最终指控：提交篡改者和支撑证据</li>
          </ul>
        </div>
      </div>

      {/* 页脚 */}
      <div className="absolute bottom-4 text-slate-600 text-sm">
        知乎黑客松 2026 · 跨次元游乐场赛道
      </div>
    </div>
  );
}
