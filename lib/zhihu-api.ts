/**
 * 知乎开放平台 API 客户端
 * 支持热榜、知乎搜索、全网搜索、直答AI
 */

const ZHIHU_API_BASE = 'https://developer.zhihu.com/api/v1';
const ZHIHU_ZHIDA_URL = 'https://developer.zhihu.com/v1/chat/completions';

function getHeaders() {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) throw new Error('ZHIHU_ACCESS_SECRET not configured');
  return {
    'Authorization': `Bearer ${secret}`,
    'X-Request-Timestamp': Math.floor(Date.now() / 1000).toString(),
    'Content-Type': 'application/json',
  };
}

export interface ZhihuHotItem {
  title: string;
  url: string;
  thumbnailUrl: string;
  summary: string;
}

export interface ZhihuSearchItem {
  title: string;
  contentType: string;
  contentId: string;
  contentText: string;
  url: string;
  commentCount: number;
  voteUpCount: number;
  authorName: string;
  authorAvatar: string;
  authorityLevel: string;
}

export interface ZhihuHotCaseCandidate {
  title: string;
  url: string;
  summary: string;
  thumbnailUrl: string;
}

/**
 * 获取知乎热榜 — 方向1: "今日热案"数据源
 * GET /api/v1/content/hot_list?Limit=N
 */
export async function fetchZhihuHotList(limit: number = 10): Promise<ZhihuHotItem[]> {
  const url = `${ZHIHU_API_BASE}/content/hot_list?Limit=${limit}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, { headers: getHeaders(), signal: controller.signal });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`知乎热榜请求失败 (${resp.status}): ${text}`);
    }
  const json = await resp.json();
  if (json.Code !== 0) {
    throw new Error(`知乎热榜错误: ${json.Message} (Code: ${json.Code})`);
  }
  return (json.Data?.Items ?? []).map((item: Record<string, string>) => ({
    title: item.Title,
    url: item.Url,
    thumbnailUrl: item.ThumbnailUrl,
    summary: item.Summary,
  }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 知乎站内搜索 — 方向1: UGC案件提交时搜索相关内容
 * GET /api/v1/content/zhihu_search?Query=xxx&Count=N
 */
export async function searchZhihu(query: string, count: number = 5): Promise<ZhihuSearchItem[]> {
  const params = new URLSearchParams({ Query: query, Count: String(Math.min(count, 10)) });
  const url = `${ZHIHU_API_BASE}/content/zhihu_search?${params}`;
  const resp = await fetch(url, { headers: getHeaders() });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`知乎搜索请求失败 (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  if (json.Code !== 0) {
    throw new Error(`知乎搜索错误: ${json.Message} (Code: ${json.Code})`);
  }
  return (json.Data?.Items ?? []).map((item: Record<string, unknown>) => ({
    title: String(item.Title ?? ''),
    contentType: String(item.ContentType ?? ''),
    contentId: String(item.ContentID ?? ''),
    contentText: String(item.ContentText ?? ''),
    url: String(item.Url ?? ''),
    commentCount: Number(item.CommentCount ?? 0),
    voteUpCount: Number(item.VoteUpCount ?? 0),
    authorName: String(item.AuthorName ?? '知乎用户'),
    authorAvatar: String(item.AuthorAvatar ?? ''),
    authorityLevel: String(item.AuthorityLevel ?? '1'),
  }));
}

/**
 * 知乎直答 AI — 方向2: 知乎答主人格化 + 案件生成
 * POST /v1/chat/completions
 */
export async function zhihuZhida(
  messages: { role: string; content: string }[],
  model: string = 'zhida-fast-1p5',
  stream: boolean = false,
): Promise<string> {
  const resp = await fetch(ZHIHU_ZHIDA_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model, messages, stream }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`知乎直答请求失败 (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * 从热榜选取适合做成"证据链案件"的候选话题
 * 过滤掉纯娱乐/图片类，优先有讨论价值的社会/科技话题
 */
export function pickCaseCandidates(hotItems: ZhihuHotItem[]): ZhihuHotCaseCandidate[] {
  return hotItems
    .filter(item => {
      if (!item.title || item.title.length < 8) return false;
      const lowerTitle = item.title.toLowerCase();
      if (lowerTitle.includes('图片') && !lowerTitle.includes('争议')) return false;
      return true;
    })
    .slice(0, 5)
    .map(item => ({
      title: item.title,
      url: item.url,
      summary: item.summary || '',
      thumbnailUrl: item.thumbnailUrl || '',
    }));
}
