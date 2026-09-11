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

