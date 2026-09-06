'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface HotCandidate {
  title: string;
  url: string;
  summary: string;
  thumbnailUrl: string;
}

interface HotItem {
  title: string;
  url: string;
  thumbnailUrl: string;
  summary: string;
}

export default function ZhihuHotPage() {
  const [candidates, setCandidates] = useState<HotCandidate[]>([]);
  const [raw, setRaw] = useState<HotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedCase, setGeneratedCase] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/zhihu/hot')
      .then(r => r.json())
      .then(data => {
        setCandidates(data.candidates ?? []);
        setRaw(data.raw ?? []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  async function generateCase(item: HotCandidate) {
    setGenerating(item.title);
    setGeneratedCase(null);
    try {
      const resp = await fetch('/api/zhihu/generate-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          summary: item.summary,
          url: item.url,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedCase(data.case);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">正在拉取知乎热榜...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-blue-400 hover:underline">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#111827] to-[#0a0a1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🔥</span>
          <div>
            <h1 className="text-2xl font-bold">今日热案</h1>
            <p className="text-sm text-gray-400">从知乎热榜生成证据链案件</p>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          {candidates.length === 0 && raw.length === 0 && (
            <p className="text-gray-400 text-center py-8">暂无热榜数据</p>
          )}
          {candidates.map((item, i) => (
            <div
              key={i}
              className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex gap-3">
                {item.thumbnailUrl && (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm leading-snug mb-1">{item.title}</h3>
                  {item.summary && (
                    <p className="text-xs text-gray-400 line-clamp-2">{item.summary}</p>
                  )}
                  <button
                    onClick={() => generateCase(item)}
                    disabled={generating === item.title}
                    className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs rounded-lg transition-colors"
                  >
                    {generating === item.title ? '生成中...' : '生成案件 →'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {generatedCase && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-bold text-green-400 mb-3">案件生成成功</h2>
            <div className="space-y-3 text-sm">
              <p><span className="text-gray-400">标题:</span> {String(generatedCase.case_title ?? '')}</p>
              <p><span className="text-gray-400">简介:</span> {String(generatedCase.case_summary ?? '')}</p>
              <div>
                <p className="text-gray-400 mb-1">原文事实:</p>
                {(Array.isArray(generatedCase.original_facts) ? generatedCase.original_facts : []).map(
                  (fact: Record<string, string>, i: number) => (
                    <p key={i} className="ml-4 text-gray-300">• {fact.content ?? String(fact)}</p>
                  )
                )}
              </div>
            </div>
            <Link
              href="/game/briefing"
              className="inline-block mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-sm rounded-lg transition-colors"
            >
              进入审讯 →
            </Link>
          </div>
        )}

        {raw.length > 0 && (
          <details className="mt-8">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-300">
              查看原始热榜（未筛选）
            </summary>
            <div className="mt-4 space-y-2">
              {raw.map((item, i) => (
                <div key={i} className="text-xs text-gray-500 border-l-2 border-gray-700 pl-3">
                  {item.title}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="mt-8 flex gap-3">
          <Link href="/" className="text-sm text-gray-400 hover:text-white">← 返回首页</Link>
          <Link href="/game/evidence" className="text-sm text-gray-400 hover:text-white">证据板 →</Link>
        </div>
      </div>
    </div>
  );
}
