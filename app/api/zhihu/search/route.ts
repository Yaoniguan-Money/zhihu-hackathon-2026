import { NextRequest, NextResponse } from 'next/server';
import { searchZhihu } from '@/lib/zhihu-api';

/**
 * GET /api/zhihu/search?query=xxx&count=5
 * 方向1: UGC案件提交 — 玩家输入知乎链接/关键词，搜索相关内容
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  const count = Number(searchParams.get('count') ?? '5');

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const results = await searchZhihu(query, count);
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
