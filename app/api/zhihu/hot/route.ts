import { NextRequest, NextResponse } from 'next/server';
import { fetchZhihuHotList, pickCaseCandidates, type ZhihuHotItem } from '@/lib/zhihu-api';

let cache: { data: { candidates: ZhihuHotItem[]; raw: ZhihuHotItem[] }; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(_req: NextRequest) {
  try {
    const secret = process.env.ZHIHU_ACCESS_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'ZHIHU_ACCESS_SECRET not set' }, { status: 500 });
    }
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }
    const hotItems = await fetchZhihuHotList(15);
    const candidates = pickCaseCandidates(hotItems);
    const data = { candidates, raw: hotItems.slice(0, 5) };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (cache) {
      return NextResponse.json({ ...cache.data, cached: true, warning: msg });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
