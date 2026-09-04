/**
 * 匿名建案额度（CONTRACTS 4.5 / ADR 0004）：
 * 滚动 24 小时 ≤3 次；同一身份同时最多 1 次进行中编译；
 * 全站 UTC 日 ≤50 次；Canonical Source ≤30,000 UTF-16 code units。
 * 纯判定逻辑：输入已由调用方按索引收集，本模块不接触数据库。
 */

import { SOURCE_MAX_UTF16_CODE_UNITS } from "@server/source/normalize.js";

export const QUOTA_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const QUOTA_ROLLING_MAX = 3;
export const QUOTA_CONCURRENT_MAX = 1;
export const QUOTA_GLOBAL_DAILY_MAX = 50;

export type QuotaRejection =
  | { ok: true }
  | {
      ok: false;
      reason: "SOURCE_TOO_LONG" | "CREATION_QUOTA_EXCEEDED";
      detail: string;
    };

export function evaluateCreationQuota(input: {
  sourceLengthUnits: number;
  rollingWindowTimestampsMs: number[];
  concurrentActiveCompilations: number;
  globalTodayCount: number;
}): QuotaRejection {
  if (input.sourceLengthUnits > SOURCE_MAX_UTF16_CODE_UNITS) {
    return {
      ok: false,
      reason: "SOURCE_TOO_LONG",
      detail: `Canonical Source 超过 ${SOURCE_MAX_UTF16_CODE_UNITS} UTF-16 code units`,
    };
  }
  if (input.concurrentActiveCompilations >= QUOTA_CONCURRENT_MAX) {
    return {
      ok: false,
      reason: "CREATION_QUOTA_EXCEEDED",
      detail: "同一身份同时最多 1 次进行中的编译",
    };
  }
  const windowStart = Date.now() - QUOTA_ROLLING_WINDOW_MS;
  const inWindow = input.rollingWindowTimestampsMs.filter(
    (ts) => ts > windowStart,
  );
  if (inWindow.length >= QUOTA_ROLLING_MAX) {
    return {
      ok: false,
      reason: "CREATION_QUOTA_EXCEEDED",
      detail: "滚动 24 小时内建案次数已达上限",
    };
  }
  if (input.globalTodayCount >= QUOTA_GLOBAL_DAILY_MAX) {
    return {
      ok: false,
      reason: "CREATION_QUOTA_EXCEEDED",
      detail: "全站 UTC 日建案次数已达上限",
    };
  }
  return { ok: true };
}

/** UTC 日键（YYYY-MM-DD），全站日额度按天分桶。 */
export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
