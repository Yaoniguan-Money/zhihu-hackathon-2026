'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ZhihuShell from '@/components/zhihu/Shell';
import Mascot from '@/components/ui/Mascot';
import { Icon } from '@/components/ui/Icons';

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
  const [generatedFrom, setGeneratedFrom] = useState<HotCandidate | null>(null);

  useEffect(() => {
    fetch('/api/zhihu/hot')
      .then(async r => {
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data.error ?? `热榜接口异常（${r.status}）`);
        setCandidates(data.candidates ?? []);
        setRaw(data.raw ?? []);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : '热榜拉取失败');
        setLoading(false);
      });
  }, []);

  async function generateCase(item: HotCandidate) {
    setGenerating(item.title);
    setGeneratedCase(null);
    setGeneratedFrom(null);
    setError(null);
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
        setGeneratedFrom(item);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <ZhihuShell icon="bolt" title="今日热案" subtitle="从知乎热榜物色建案题材">
        <div className="flex justify-center py-16">
          <Mascot motion="computer" size={110} caption="正在翻阅知乎热榜…" />
        </div>
      </ZhihuShell>
    );
  }

  return (
    <ZhihuShell icon="bolt" title="今日热案" subtitle="从知乎热榜物色建案题材">
      {error && (
        <div className="card-dark mb-4 border-coral/50 p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-coral">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        </div>
      )}

      {/* 热榜候选 */}
      <div className="space-y-3">
        {candidates.length === 0 && raw.length === 0 && (
          <Mascot motion="sleep" size={110} caption="热榜暂时空着，稍后再来。" />
        )}
        {candidates.map((item, i) => (
          <div key={i} className="card-dark flex gap-3 p-4 transition-colors hover:border-amber/40">
            {item.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- 热榜外链缩略图，域名不定
              <img
                src={item.thumbnailUrl}
                alt=""
                className="h-16 w-16 flex-shrink-0 rounded-xl border-2 border-paper/10 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black leading-snug text-paper">{item.title}</h3>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-paper/50">{item.summary}</p>
              )}
              <button
                onClick={() => generateCase(item)}
                disabled={generating === item.title}
                className="btn btn-amber mt-3 !px-3 !py-1 text-xs disabled:opacity-40"
              >
                <Icon name="sparkle" size={13} filled />
                {generating === item.title ? '生成中…' : '生成案件预览'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 生成结果：仅作选题预览，正式开局回大厅建案 */}
      {generatedCase && (
        <div className="card mt-6 border-teal p-6">
          <h2 className="flex items-center gap-2 text-sm font-black text-ink">
            <Icon name="check" size={16} className="text-teal" />
            案件选题预览已生成
          </h2>
          <p className="mt-3 text-base font-black text-ink">{String(generatedCase.case_title ?? '')}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{String(generatedCase.case_summary ?? '')}</p>
          {Array.isArray(generatedCase.original_facts) && generatedCase.original_facts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-black uppercase tracking-widest text-coral-deep">AI 提炼的事实点</p>
              <ul className="mt-1 space-y-1">
                {(generatedCase.original_facts as Array<Record<string, string>>).map((fact, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink/75">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-deep" />
                    {fact.content ?? String(fact)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="dashed-divider my-4" />
          <p className="text-xs leading-relaxed text-ink/60">
            这只是<b>选题预览</b>。正式开局需要文章的<b>完整正文</b>：回事务所把这篇粘贴进「带一篇知乎文章来」，
            配上邀请码，AI 会把它编译成一局可回溯的对局。
          </p>
          <Link
            href={generatedFrom ? `/?prefill_url=${encodeURIComponent(generatedFrom.url)}` : '/'}
            className="btn btn-amber mt-4 inline-flex items-center gap-2"
          >
            <Icon name="send" size={14} />
            带着这篇回大厅建案
          </Link>
        </div>
      )}

      {/* 原始热榜：默认折叠 */}
      {raw.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-paper/40 hover:text-paper/60">
            查看原始热榜（未筛选）
          </summary>
          <div className="mt-3 space-y-2">
            {raw.map((item, i) => (
              <div key={i} className="border-l-2 border-paper/15 pl-3 text-xs leading-relaxed text-paper/45">
                {item.title}
              </div>
            ))}
          </div>
        </details>
      )}
    </ZhihuShell>
  );
}
