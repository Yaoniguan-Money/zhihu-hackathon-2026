import { v } from "convex/values";
import { query } from "./_generated/server";
import { gameEventPublicSchema } from "@contracts/public/index.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * events.listPublic（CONTRACTS 7 / 11）：公开事件的增量恢复通道，
 * sequence 从 1 开始连续；不存在与越权 Session 返回同一安全空数组。
 */
export const listPublic = query({
  args: { session_id: v.string(), after_sequence: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    if (!Number.isInteger(args.after_sequence) || args.after_sequence < 0) {
      throwPublicError("INVALID_ARGUMENT", "after_sequence 必须是非负整数");
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== identity.tokenIdentifier) {
      return [];
    }
    const docs = await ctx.db
      .query("events")
      .withIndex("by_session_sequence", (q) =>
        q
          .eq("session_id", args.session_id)
          .gt("sequence", args.after_sequence),
      )
      .order("asc")
      .collect();
    return docs.map((doc) =>
      gameEventPublicSchema.parse({
        event_id: `evt-${doc.session_id}-${doc.sequence}`,
        session_id: doc.session_id,
        sequence: doc.sequence,
        occurred_at: new Date(doc.occurred_at_ms).toISOString(),
        payload: JSON.parse(doc.payload_json),
      }),
    );
  },
});
