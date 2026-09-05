import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * TB10：私有审计事件（CONTRACTS 15 / ENGINEERING_SPEC 11）。
 * 只记录 ID、任务名、attempt index、耗时与错误码；禁止 API Key、Prompt、
 * 候选原文、Validator 私有文本或完整正文。全部为 internal 入口，
 * 不通过任何公开 Interface 暴露。
 */

export const recordInternal = internalMutation({
  args: {
    event: v.string(),
    case_id: v.optional(v.string()),
    session_id: v.optional(v.string()),
    request_id: v.optional(v.string()),
    client_action_id: v.optional(v.string()),
    task: v.optional(v.string()),
    attempt_index: v.optional(v.number()),
    duration_ms: v.optional(v.number()),
    detail_code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("private_audit", {
      event: args.event,
      ...(args.case_id !== undefined && { case_id: args.case_id }),
      ...(args.session_id !== undefined && { session_id: args.session_id }),
      ...(args.request_id !== undefined && { request_id: args.request_id }),
      ...(args.client_action_id !== undefined && {
        client_action_id: args.client_action_id,
      }),
      ...(args.task !== undefined && { task: args.task }),
      ...(args.attempt_index !== undefined && {
        attempt_index: args.attempt_index,
      }),
      ...(args.duration_ms !== undefined && {
        duration_ms: args.duration_ms,
      }),
      ...(args.detail_code !== undefined && { detail_code: args.detail_code }),
      created_at_ms: Date.now(),
    });
  },
});

export const metricsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("private_audit").collect();
    const eventCounts: Record<string, number> = {};
    for (const row of rows) {
      eventCounts[row.event] = (eventCounts[row.event] ?? 0) + 1;
    }
    return {
      total: rows.length,
      event_counts: eventCounts,
      // SPEC 11 聚合计数的直接别名（ASR/TTS 属 P1，P0 恒为 0）
      asr_failures: 0,
      tts_failures: 0,
    };
  },
});
