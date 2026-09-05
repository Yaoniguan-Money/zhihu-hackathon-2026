'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { useGame } from '@/context/GameContext';
import { mockRevealResult } from '@/mock/goldenCase';
import { getRoleAvatar, getRoleName } from '@/lib/roleUtils';
import type { DistortionType, RolePublic } from '@/contracts/types';

const distortionTypeLabels: Record<DistortionType, { name: string; description: string }> = {
  scope_expand: { name: '范围扩大', description: '将局部情况说成整体情况' },
  degree_strengthen: { name: '程度加强', description: '将轻微影响说成严重后果' },
  condition_delete: { name: '条件删除', description: '去掉前提条件，结论绝对化' },
  causal_swap: { name: '因果倒置', description: '将原因和结果颠倒' },
  time_montage: { name: '时间拼接', description: '将不同时间的事实拼成错误先后' },
  source_splice: { name: '来源拼接', description: '拼接不同来源的信息形成新结论' },
  context_omit: { name: '语境遗漏', description: '删除关键上下文，改变原意' },
  subject_swap: { name: '主语替换', description: '偷换行为主体' },
  concept_shift: { name: '概念偷换', description: '用相似但不同的概念替换' },
  cherry_pick: { name: '选择性引用', description: '只引用有利部分，隐藏反例' },
};

export default function RevealPage() {
  const router = useRouter();
  const { casePublic, accusation, restart } = useGame();
  const [revealStep, setRevealStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<HTMLDivElement>(null);
  const distortedRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  const result = mockRevealResult;
  const distortedRole = casePublic?.roles.find((r: RolePublic) => r.role_id === result.distorted_role_id);
  const accusedRole = casePublic?.roles.find((r: RolePublic) => r.role_id === accusation?.accused_role_id);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      tl.from('.reveal-title', { opacity: 0, y: -30, duration: 0.6, onComplete: () => setRevealStep(1) })
        .from('.reveal-avatar', { scale: 0, rotation: -180, duration: 0.8, ease: 'back.out(1.7)', onComplete: () => setRevealStep(2) })
        .from('.reveal-distortion', { opacity: 0, x: -50, duration: 0.5, onComplete: () => setRevealStep(3) })
        .from('.reveal-compare', { opacity: 0, y: 30, duration: 0.6, stagger: 0.3, onComplete: () => setRevealStep(4) })
        .from('.reveal-analysis', { opacity: 0, y: 20, duration: 0.5, onComplete: () => setRevealStep(5) })
        .from('.reveal-mapping', { opacity: 0, x: -30, duration: 0.4, stagger: 0.2 })
        .from('.reveal-score', { opacity: 0, scale: 0.5, duration: 0.6, ease: 'back.out(2)' })
        .from('.reveal-actions', { opacity: 0, y: 20, duration: 0.4 });

      if (originalRef.current && distortedRef.current) {
        tl.to(originalRef.current, { borderColor: '#10b981', boxShadow: '0 0 20px rgba(16,185,129,0.3)', duration: 0.5 }, '-=0.3')
          .to(distortedRef.current, { borderColor: '#ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.3)', duration: 0.5 }, '<');
      }

      if (scoreRef.current) {
        tl.to(scoreRef.current, { textContent: result.score.total, duration: 1.5, ease: 'power2.out', snap: { textContent: 1 } }, '<');
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleRestart = () => {
    restart();
    router.push('/');
  };

  if (!casePublic || !distortedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔍</div>
          <p className="text-slate-400">正在加载揭晓结果...</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-indigo-400 hover:underline">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="reveal-title inline-block px-6 py-2 rounded-full text-sm font-bold mb-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-400">
          真相揭晓
        </div>
        <h1 className="reveal-title text-4xl font-bold text-white mb-2 text-gradient">
          {result.is_correct ? '🎉 指控正确！' : '😔 指控错误'}
        </h1>
      </div>

      <div className="reveal-avatar text-center mb-8">
        <div className="text-7xl mb-4 animate-float">{getRoleAvatar(distortedRole)}</div>
        <h2 className="text-2xl font-bold text-white mb-2">
          篡改者是 <span className="text-red-400">{getRoleName(distortedRole)}</span>
        </h2>
        <p className="text-slate-400 mb-4">{distortedRole.public_bio}</p>

        {accusation && accusedRole && (
          <p className="text-sm text-slate-500">
            你指控的是：{getRoleName(accusedRole)}
            {result.is_correct ? ' ✓ 正确' : ' ✗ 错误'}
          </p>
        )}
      </div>

      <div className="reveal-distortion text-center mb-8">
        <div className="flex flex-wrap justify-center gap-2">
          {result.distortion_types.map((dt) => {
            const info = distortionTypeLabels[dt];
            return (
              <span key={dt} className="px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm border border-red-500/30">
                {info.name} — {info.description}
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div ref={originalRef} className="reveal-compare glass rounded-xl p-6 border-2 border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">✅</span>
            <h3 className="font-bold text-green-400">原文事实</h3>
          </div>
          <p className="text-slate-300 leading-relaxed">{result.original_text}</p>
        </div>
        <div ref={distortedRef} className="reveal-compare glass rounded-xl p-6 border-2 border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">⚠️</span>
            <h3 className="font-bold text-red-400">被篡改后</h3>
          </div>
          <p className="text-slate-300 leading-relaxed">{result.distorted_text}</p>
        </div>
      </div>

      <div className="reveal-analysis glass rounded-2xl p-6 mb-6">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <span>🔍</span> 篡改分析
        </h3>
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-4 space-y-2">
          {result.distortion_types.map((dt) => {
            const info = distortionTypeLabels[dt];
            return (
              <div key={dt}>
                <span className="text-indigo-400 font-bold">{info.name}</span>
                <span className="text-xs text-slate-400 ml-2">— {info.description}</span>
              </div>
            );
          })}
        </div>
        <p className="text-slate-300 leading-relaxed text-sm">{result.explanation}</p>
      </div>

      <div className="reveal-mapping glass rounded-2xl p-6 mb-8">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <span>🌍</span> 现实映射 — 这个技能在现实中怎么用
        </h3>
        <div className="space-y-3">
          {result.reality_mapping.map((mapping, i) => (
            <div key={i} className="reveal-mapping flex items-start gap-3 p-3 glass-dark rounded-lg">
              <span className="text-lg flex-shrink-0">
                {['🔄', '⚠️', '🤖'][i] || '💡'}
              </span>
              <p className="text-slate-300 text-sm">{mapping}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="reveal-score glass rounded-2xl p-6 mb-8 text-center">
        <h3 className="font-bold text-white mb-4">本局得分</h3>
        <div ref={scoreRef} className="text-6xl font-bold text-gradient mb-4">
          0
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="glass-dark rounded-lg p-3">
            <div className="text-slate-400">证据质量</div>
            <div className="text-2xl font-bold text-green-400">{result.score.evidence_score}</div>
          </div>
          <div className="glass-dark rounded-lg p-3">
            <div className="text-slate-400">审讯质量</div>
            <div className="text-2xl font-bold text-blue-400">{result.score.questioning_score}</div>
          </div>
          <div className="glass-dark rounded-lg p-3">
            <div className="text-slate-400">总分</div>
            <div className="text-2xl font-bold text-purple-400">{result.score.total}</div>
          </div>
        </div>
      </div>

      <div className="reveal-actions flex justify-center gap-4">
        <button
          onClick={handleRestart}
          className="px-8 py-3 glass rounded-full text-white hover:bg-white/10 transition-colors"
        >
          🔄 再来一局
        </button>
        <button
          onClick={() => router.push('/')}
          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full hover:from-indigo-500 hover:to-purple-500 transition-all glow-primary"
        >
          🏠 返回首页
        </button>
      </div>
    </div>
  );
}
