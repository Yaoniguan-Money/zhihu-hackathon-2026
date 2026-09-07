import { NextRequest, NextResponse } from 'next/server';
import { zhihuZhida } from '@/lib/zhihu-api';
import { ZHIHU_ANSWERER_PERSONAS, buildAnswererPrompt } from '@/lib/zhihu-personas';

/**
 * POST /api/zhihu/answer
 * 方向2: 用知乎直答AI生成答主陈述
 *
 * Body: { personaType: string, topic: string, contextSummary: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { personaType, topic, contextSummary } = await req.json();

    if (!personaType || !topic) {
      return NextResponse.json({ error: 'personaType and topic are required' }, { status: 400 });
    }

    const persona = ZHIHU_ANSWERER_PERSONAS.find(p => p.type === personaType);
    if (!persona) {
      return NextResponse.json({ error: 'unknown persona type' }, { status: 400 });
    }

    const messages = buildAnswererPrompt(persona, topic, contextSummary || '');
    const content = await zhihuZhida(messages, 'zhida-fast-1p5', false);

    return NextResponse.json({ content, persona: persona.displayName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
