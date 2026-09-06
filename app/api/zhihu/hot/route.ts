import { NextRequest, NextResponse } from 'next/server';
import { fetchZhihuHotList, pickCaseCandidates } from '@/lib/zhihu-api';

/**
 * GET /api/zhihu/hot
 * 方向1: 拉取知乎热榜，筛选适合做成"证据链案件"的候选话题
 */
export async function GET(_req: NextRequest) {
  try {
    const secret = process.env.ZHIHU_ACCESS_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'ZHIHU_ACCESS_SECRET not set' }, { status: 500 });
    }
    const hotItems = await fetchZhihuHotList(15);
    const candidates = pickCaseCandidates(hotItems);
    return NextResponse.json({ candidates, raw: hotItems.slice(0, 5) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg, stack: err instanceof Error ? err.stack?.split('\n').slice(0, 3) : undefined }, { status: 500 });
  }
}
