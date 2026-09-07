'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ZhihuShell from '@/components/zhihu/Shell';
import Mascot from '@/components/ui/Mascot';
import { Icon } from '@/components/ui/Icons';

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

const LEVEL_LABELS: Record<number, string> = {
  5: 'Lv.5 · 明察秋毫',
  4: 'Lv.4 · 洞察真伪',
  3: 'Lv.3 · 初见端倪',
  2: 'Lv.2 · 尚需修炼',
  1: 'Lv.1 · 雾里看花',
};

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
      <ZhihuShell icon="scale" title="辨别力战绩卡" subtitle="正在调取上一局的合议结果…">
        <div className="flex justify-center py-16">
          <Mascot motion="computer" size={110} caption="成绩单装订中…" />
        </div>
      </ZhihuShell>
    );
  }

  if (!data) {
    return (
      <ZhihuShell icon="scale" title="辨别力战绩卡" subtitle="对局结束后这里会生成可分享的成绩">
        <div className="card-dark mx-auto max-w-md py-10 text-center">
          <Mascot motion="sleep" size={120} caption="档案室还没有你的成绩单。" />
          <p className="mt-3 text-sm font-bold text-paper/70">先回事务所开一局，抓出篡改者！</p>
          <Link href="/" className="btn btn-amber mt-5 inline-flex items-center gap-2">
            <Icon name="home" size={15} />
            回大厅开一局
          </Link>
        </div>
      </ZhihuShell>
    );
  }

  const level = data.discernmentLevel;
  const mins = Math.floor(data.timeUsed / 60);
  const secs = data.timeUsed % 60;

  return (
    <ZhihuShell icon="scale" title="辨别力战绩卡" subtitle="把你的侦查成绩分享到知乎">
      {/* 成绩总览 */}
      <div className="card-dark p-6">
        <div className="text-center">
          <p className="text-lg font-black" style={{ color: data.isCorrect ? '#34d399' : '#fb7185' }}>
            {data.isCorrect ? '指控成功 · 真相被你钉死了' : '指控失败 · 被篡改者骗过了'}
          </p>
          <p className="mt-1 text-xs font-bold text-amber">{LEVEL_LABELS[level]}</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-paper/10 bg-night-deep/60 p-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-paper/45">总分</p>
            <p className="mt-1 text-2xl font-black text-amber">
              {data.totalScore}
              <span className="text-sm text-paper/35"> /100</span>
            </p>
          </div>
          <div className="rounded-2xl border-2 border-paper/10 bg-night-deep/60 p-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-paper/45">用时</p>
            <p className="mt-1 text-2xl font-black text-paper">
              {mins}&apos;{String(secs).padStart(2, '0')}&quot;
            </p>
          </div>
          <div className="rounded-2xl border-2 border-paper/10 bg-night-deep/60 p-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-teal">证据分</p>
            <p className="mt-1 text-2xl font-black text-teal">
              {data.evidenceScore}
              <span className="text-sm text-paper/35"> /100</span>
            </p>
          </div>
          <div className="rounded-2xl border-2 border-paper/10 bg-night-deep/60 p-3 text-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-indigo-soft">审讯分</p>
            <p className="mt-1 text-2xl font-black text-indigo-soft">
              {data.questioningScore}
              <span className="text-sm text-paper/35"> /100</span>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-bold text-paper/50">
          {data.caseTitle} · {data.roundsPlayed} 轮审讯
        </p>
      </div>

      {/* 战绩卡预览 */}
      {html && (
        <div className="card-dark mt-4 overflow-hidden p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-paper/60">
            <Icon name="file" size={14} className="text-amber" />
            分享图预览
          </p>
          <iframe
            title="战绩卡预览"
            srcDoc={html}
            className="h-[420px] w-full rounded-xl border-2 border-paper/10 bg-night-deep"
          />
        </div>
      )}

      {/* 可分享文案 */}
      <div className="card-dark mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-paper/60">
            <Icon name="quote" size={14} className="text-amber" />
            可分享文案
          </p>
          <button onClick={copyShareText} className="btn btn-amber !px-3 !py-1 text-xs">
            <Icon name="file" size={13} />
            {copied ? '已复制！' : '复制文案'}
          </button>
        </div>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border-2 border-paper/10 bg-night-deep/60 p-3 text-xs leading-relaxed text-paper/75">
{shareText}
        </pre>
        <p className="mt-2 text-[11px] text-paper/40">
          复制后粘贴到知乎想法 / 回答中即可分享。
        </p>
      </div>

      {/* 行动 */}
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn btn-ghost px-6">
          <Icon name="home" size={15} />
          回到事务所
        </Link>
        <Link href="/zhihu/hot" className="btn btn-amber px-6">
          <Icon name="bolt" size={15} />
          去热榜挑新案
        </Link>
      </div>
    </ZhihuShell>
  );
}
