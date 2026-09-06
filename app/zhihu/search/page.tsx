'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SearchResult {
  title: string;
  contentType: string;
  contentText: string;
  url: string;
  voteUpCount: number;
  authorName: string;
  authorityLevel: string;
}

export default function ZhihuSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/zhihu/search?query=${encodeURIComponent(query)}&count=5`);
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.results ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#111827] to-[#0a0a1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🔍</span>
          <div>
            <h1 className="text-2xl font-bold">知乎搜索</h1>
            <p className="text-sm text-gray-400">搜索知乎内容，提交为自定义案件</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="输入关键词搜索知乎..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={search}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-xl transition-colors"
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <div className="space-y-3">
          {results.map((item, i) => (
            <div
              key={i}
              className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
            >
              <h3 className="font-medium text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-gray-400 line-clamp-3 mb-2">{item.contentText}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{item.authorName}</span>
                <span>👍 {item.voteUpCount}</span>
                <span>权威Lv.{item.authorityLevel}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  原文 →
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/zhihu/hot" className="text-sm text-gray-400 hover:text-white">← 今日热案</Link>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">返回首页 →</Link>
        </div>
      </div>
    </div>
  );
}
