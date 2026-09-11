'use client';

import { forwardRef } from 'react';
import { calcDiscernmentLevel, type ScoreCardData } from '@/lib/score-card';

const LEVEL_LABELS: Record<number, string> = {
  5: '辨别力Lv.5 · 明察秋毫',
  4: '辨别力Lv.4 · 洞察真伪',
  3: '辨别力Lv.3 · 初见端倪',
  2: '辨别力Lv.2 · 尚需修炼',
  1: '辨别力Lv.1 · 雾里看花',
};

const LEVEL_EMOJIS: Record<number, string> = {
  5: '🎯',
  4: '🔍',
  3: '👁️',
  2: '🌫️',
  1: '🤔',
};

/**
 * 战绩卡分享图：真实 DOM 渲染（替代原服务端 HTML 字符串 + iframe 方案），
 * 通过 ref 暴露根节点，供 html-to-image 导出 PNG。
 */
const ScoreCardArt = forwardRef<HTMLDivElement, { data: ScoreCardData }>(function ScoreCardArt(
  { data },
  ref,
) {
  const level = calcDiscernmentLevel(data.totalScore);
  const label = LEVEL_LABELS[level];
  const emoji = LEVEL_EMOJIS[level];
  const mins = Math.floor(data.timeUsed / 60);
  const secs = data.timeUsed % 60;
  const resultColor = data.isCorrect ? '#10B981' : '#EF4444';
  const resultText = data.isCorrect ? '指控成功' : '指控失败';
  const levelColor = level >= 4 ? '#3B82F6' : level >= 2 ? '#F59E0B' : '#EF4444';

  return (
    <div
      ref={ref}
      className="relative w-[400px] max-w-full overflow-hidden rounded-[20px] border border-white/10 p-8 text-white"
      style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        fontFamily: "-apple-system, 'PingFang SC', sans-serif",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${resultColor}, ${levelColor})` }}
      />

      <div className="mb-6 text-center">
        <div className="mb-2 text-5xl leading-none">{emoji}</div>
        <div className="mb-1 text-lg font-semibold">证据链狼人杀 · 战绩卡</div>
        <div className="text-sm text-white/60">{data.caseTitle}</div>
      </div>

      <div
        className="mb-4 rounded-xl px-3 py-3 text-center text-xl font-bold"
        style={{ background: `${resultColor}20`, color: resultColor }}
      >
        {resultText}
      </div>

      <div className="mb-5 text-center text-base font-semibold" style={{ color: levelColor }}>
        {label}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        {(
          [
            ['总分', data.totalScore],
            ['用时', `${mins}'${String(secs).padStart(2, '0')}"`],
            ['证据分', data.evidenceScore],
            ['审讯分', data.questioningScore],
          ] as const
        ).map(([labelText, value]) => (
          <div key={labelText} className="rounded-[10px] bg-white/[0.08] px-3 py-3 text-center">
            <div className="mb-1 text-xs text-white/50">{labelText}</div>
            <div className="text-lg font-bold">
              {value}
              {labelText !== '用时' && (
                <span className="text-xs text-white/40">/100</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-4 text-center text-xs text-white/40">
        知乎黑客松 2026 · 证据链狼人杀
      </div>
    </div>
  );
});

export default ScoreCardArt;
