'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ScoreCardData {
  caseTitle: string;
  isCorrect: boolean;
  timeUsed: number;
  roundsPlayed: number;
  evidenceScore: number;
  questioningScore: number;
  totalScore: number;
  discernmentLevel: number;
  timestamp: number;
}

export default function ScoreCardPage() {
  const [data, setData] = useState<ScoreCardData | null>(null);
  const [shareText, setShareText] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('lastGameResult');
    if (!stored) {
      setLoading(false);
      return;
    }
    const gameData = JSON.parse(stored) as ScoreCardData;
    setData(gameData);

    fetch('/api/zhihu/score-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData),
    })
      .then(r => r.json())
      .then(result => {
        setShareText(result.shareText ?? '');
        setHtml(result.html ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">还没有游戏记录</p>
          <Link href="/" className="text-blue-400 hover:underline">返回首页</Link>
        </div>
      </div>
    );
  }

  const levelLabels: Record<number, string> = {
    5: 'Lv.5 · 明察秋毫',
    4: 'Lv.4 · 洞察真伪',
    3: 'Lv.3 · 初见端倪',
    2: 'Lv.2 · 尚需修炼',
    1: 'Lv.1 · 雾里看花',
  };
  const level = data.totalScore >= 90 ? 5 : data.totalScore >= 75 ? 4 : data.totalScore >= 60 ? 3 : data.totalScore >= 40 ? 2 : 1;
  const mins = Math.floor(data.timeUsed / 60);
  const secs = data.timeUsed % 60;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#111827] to-[#0a0a1a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-center">辨别力战绩卡</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">
              {level === 5 ? '🎯' : level === 4 ? '🔍' : level === 3 ? '👁️' : level === 2 ? '🌫️' : '🤔'}
            </div>
            <p className="text-lg font-bold" style={{ color: data.isCorrect ? '#10B981' : '#EF4444' }}>
              {data.isCorrect ? '指控成功' : '指控失败'}
            </p>
            <p className="text-sm text-gray-400 mt-1">{levelLabels[level]}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">总分</p>
              <p className="text-xl font-bold">{data.totalScore}<span className="text-xs text-gray-500">/100</span></p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">用时</p>
              <p className="text-xl font-bold">{mins}'{String(secs).padStart(2,'0')}"</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">证据分</p>
              <p className="text-xl font-bold">{data.evidenceScore}<span className="text-xs text-gray-500">/40</span></p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">审讯分</p>
              <p className="text-xl font-bold">{data.questioningScore}<span className="text-xs text-gray-500">/35</span></p>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400">{data.caseTitle}</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-300">可分享文案</h2>
            <button
              onClick={copyShareText}
              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {copied ? '已复制!' : '复制文案'}
            </button>
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-black/30 rounded-lg p-3 max-h-48 overflow-y-auto">
{shareText}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            复制后粘贴到知乎想法/回答中即可分享
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-colors"
          >
            返回首页
          </Link>
          <Link
            href="/zhihu/hot"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm transition-colors"
          >
            挑战新案件 →
          </Link>
        </div>
      </div>
    </div>
  );
}
