'use client';

import { useState } from 'react';
import Link from 'next/link';
import ZhihuShell from '@/components/zhihu/Shell';
import Mascot from '@/components/ui/Mascot';
import { Icon } from '@/components/ui/Icons';

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
  const [searched, setSearched] = useState(false);
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
        setSearched(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ZhihuShell icon="magnifier" title="知乎搜索" subtitle="搜文章与答主，物色可建案的题材">
      {/* 搜索框 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="输入关键词搜索知乎…"
          className="flex-1 rounded-xl border-2 border-paper/20 bg-night-deep/60 px-4 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-amber focus:outline-none"
        />
        <button onClick={search} disabled={loading} className="btn btn-amber !px-5 text-sm disabled:opacity-40">
          <Icon name="magnifier" size={15} />
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>

      {error && (
        <div className="card-dark mt-4 border-coral/50 p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-coral">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        </div>
      )}

      {/* 结果 */}
      <div className="mt-5 space-y-3">
        {results.map((item, i) => (
          <div key={i} className="card-dark p-4 transition-colors hover:border-amber/40">
            <h3 className="text-sm font-black leading-snug text-paper">{item.title}</h3>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-paper/50">{item.contentText}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-paper/45">
              <span>{item.authorName}</span>
              <span className="text-amber/80">▲ {item.voteUpCount}</span>
              <span>权威 Lv.{item.authorityLevel}</span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal transition-colors hover:text-teal/80"
              >
                原文 ↗
              </a>
              <Link
                href={`/?prefill_url=${encodeURIComponent(item.url)}`}
                className="ml-auto text-amber transition-colors hover:text-amber/80"
              >
                带去建案 →
              </Link>
            </div>
          </div>
        ))}

        {searched && results.length === 0 && !error && (
          <Mascot motion="sleep" size={110} caption="什么都没搜到，换个关键词试试。" />
        )}

        {!searched && !error && (
          <div className="card-dark p-6 text-center">
            <Mascot motion="idle" size={100} caption="搜一篇有意思的文章，把它变成一局对质。" />
            <p className="mt-3 text-xs leading-relaxed text-paper/50">
              找到目标后点「带去建案」：回事务所粘贴文章完整正文 + 邀请码，即可编译开局。
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <Link href="/zhihu/hot" className="text-xs font-bold text-paper/45 transition-colors hover:text-amber">
          或者去 <span className="text-amber">今日热案</span> 看看 →
        </Link>
      </div>
    </ZhihuShell>
  );
}
