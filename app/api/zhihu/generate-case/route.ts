import { NextRequest, NextResponse } from 'next/server';
import { zhihuZhida } from '@/lib/zhihu-api';
import { buildCaseGenerationPrompt, ZHIHU_ANSWERER_PERSONAS, buildAnswererPrompt } from '@/lib/zhihu-personas';

/**
 * POST /api/zhihu/generate-case
 * 方向1+2: 用知乎直答AI根据热榜话题生成完整案件
 *
 * Body: { title: string, summary: string, url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, summary, url } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const messages = buildCaseGenerationPrompt({ title, summary: summary || '', url: url || '' });
    const content = await zhihuZhida(messages, 'zhida-thinking-1p5', false);

    let caseData;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      caseData = JSON.parse(jsonStr);
    } catch {
      caseData = {
        case_title: title,
        case_summary: summary,
        topic_context: summary,
        original_facts: [],
        raw_ai_output: content,
      };
    }

    return NextResponse.json({ case: caseData, personas: ZHIHU_ANSWERER_PERSONAS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
