/**
 * 方向3: 游戏结果回流知乎 — 辨别力战绩卡
 * 玩家通关后生成可分享的战绩卡
 */

export interface ScoreCardData {
  caseTitle: string;
  isCorrect: boolean;
  timeUsed: number;
  roundsPlayed: number;
  evidenceScore: number;
  questioningScore: number;
  totalScore: number;
  discernmentLevel: number;
  timestamp: number;
}

/**
 * 根据总分计算辨别力等级
 */
export function calcDiscernmentLevel(totalScore: number): number {
  if (totalScore >= 90) return 5;
  if (totalScore >= 75) return 4;
  if (totalScore >= 60) return 3;
  if (totalScore >= 40) return 2;
  return 1;
}

const LEVEL_LABELS: Record<number, string> = {
  5: '辨别力Lv.5 · 明察秋毫',
  4: '辨别力Lv.4 · 洞察真伪',
  3: '辨别力Lv.3 · 初见端倪',
  2: '辨别力Lv.2 · 尚需修炼',
  1: '辨别力Lv.1 · 雾里看花',
};

const LEVEL_EMOJIS: Record<number, string> = {
  5: '🎯',
  4: '🔍',
  3: '👁️',
  2: '🌫️',
  1: '🤔',
};

/**
 * 生成可分享到知乎想法的战绩文案
 */
export function generateShareText(data: ScoreCardData): string {
  const level = calcDiscernmentLevel(data.totalScore);
  const label = LEVEL_LABELS[level];
  const emoji = LEVEL_EMOJIS[level];
  const mins = Math.floor(data.timeUsed / 60);
  const secs = data.timeUsed % 60;

  const resultText = data.isCorrect ? '成功抓出篡改者' : '被篡改者骗过了';

  return [
    `${emoji} 我在「证据链狼人杀」中挑战了【${data.caseTitle}】`,
    '',
    `${resultText}！`,
    `辨别力评分: ${data.totalScore}/100 · ${label}`,
    `用时 ${mins}分${secs}秒 · ${data.roundsPlayed}轮审讯`,
    `证据 ${data.evidenceScore}/100 · 审讯 ${data.questioningScore}/100`,
    '',
    '#知乎黑客松 #证据链狼人杀 #AI游戏 #辨别力挑战',
  ].join('\n');
}

/**
 * 生成战绩卡 HTML（用于截图分享）
 */
export function generateScoreCardHTML(data: ScoreCardData): string {
  const level = calcDiscernmentLevel(data.totalScore);
  const label = LEVEL_LABELS[level];
  const emoji = LEVEL_EMOJIS[level];
  const mins = Math.floor(data.timeUsed / 60);
  const secs = data.timeUsed % 60;
  const resultColor = data.isCorrect ? '#10B981' : '#EF4444';
  const resultText = data.isCorrect ? '指控成功' : '指控失败';
  const levelColor = level >= 4 ? '#3B82F6' : level >= 2 ? '#F59E0B' : '#EF4444';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; font-family: -apple-system, 'PingFang SC', sans-serif;
  }
  .card {
    width: 400px; background: rgba(255,255,255,0.05); backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
    padding: 32px; color: #fff; position: relative; overflow: hidden;
  }
  .card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, ${resultColor}, ${levelColor});
  }
  .header { text-align: center; margin-bottom: 24px; }
  .emoji { font-size: 48px; margin-bottom: 8px; }
  .title { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .case-name { font-size: 14px; color: rgba(255,255,255,0.6); }
  .result {
    text-align: center; margin: 16px 0; padding: 12px;
    background: ${resultColor}20; border-radius: 12px;
    font-size: 20px; font-weight: 700; color: ${resultColor};
  }
  .level-badge {
    text-align: center; margin-bottom: 20px;
    font-size: 16px; font-weight: 600; color: ${levelColor};
  }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .stat-item {
    background: rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;
    text-align: center;
  }
  .stat-label { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
  .stat-value { font-size: 18px; font-weight: 700; }
  .footer {
    text-align: center; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);
    font-size: 12px; color: rgba(255,255,255,0.4);
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="emoji">${emoji}</div>
    <div class="title">证据链狼人杀 · 战绩卡</div>
    <div class="case-name">${data.caseTitle}</div>
  </div>
  <div class="result">${resultText}</div>
  <div class="level-badge">${label}</div>
  <div class="stats">
    <div class="stat-item">
      <div class="stat-label">总分</div>
      <div class="stat-value">${data.totalScore}<span style="font-size:12px;color:rgba(255,255,255,0.4)">/100</span></div>
    </div>
    <div class="stat-item">
      <div class="stat-label">用时</div>
      <div class="stat-value">${mins}'${String(secs).padStart(2,'0')}"</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">证据分</div>
      <div class="stat-value">${data.evidenceScore}<span style="font-size:12px;color:rgba(255,255,255,0.4)">/100</span></div>
    </div>
    <div class="stat-item">
      <div class="stat-label">审讯分</div>
      <div class="stat-value">${data.questioningScore}<span style="font-size:12px;color:rgba(255,255,255,0.4)">/100</span></div>
    </div>
  </div>
  <div class="footer">知乎黑客松 2026 · 证据链狼人杀</div>
</div>
</body>
</html>`;
}
