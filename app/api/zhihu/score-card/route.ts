import { NextRequest, NextResponse } from 'next/server';
import { generateShareText, generateScoreCardHTML, type ScoreCardData } from '@/lib/score-card';

/**
 * POST /api/zhihu/score-card
 * 方向3: 生成辨别力战绩卡（HTML + 可分享文案）
 *
 * Body: ScoreCardData
 */
export async function POST(req: NextRequest) {
  try {
    const data: ScoreCardData = await req.json();

    if (!data.caseTitle || data.totalScore === undefined) {
      return NextResponse.json({ error: 'caseTitle and totalScore are required' }, { status: 400 });
    }

    const shareText = generateShareText(data);
    const html = generateScoreCardHTML(data);

    return NextResponse.json({ shareText, html, scoreCard: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
