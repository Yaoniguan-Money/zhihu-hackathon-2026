import { v } from "convex/values";
import { query } from "./_generated/server";
import { messagePublicSchema, type MessagePublic } from "@contracts/public/index.js";
import { throwPublicError } from "./publicErrors.js";

/**
 * messages.listPublic（CONTRACTS 5 / 11）：v1 全量返回当前 Session 的
 * 全部公开消息，按 created_at + message_id 稳定排序；
 * 不存在与越权 Session 返回同一安全空数组（CONTRACTS 4.3）。
 */
export const listPublic = query({
  args: { session_id: v.string() },
  handler: async (ctx, args): Promise<MessagePublic[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throwPublicError("AUTH_REQUIRED", "需要先建立会话身份");
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_session_key", (q) => q.eq("session_key", args.session_id))
      .unique();
    if (!session || session.owner_identity !== identity.tokenIdentifier) {
      return [];
    }
    const docs = await ctx.db
      .query("messages")
      .withIndex("by_session_created", (q) =>
        q.eq("session_id", args.session_id),
      )
      .order("asc")
      .collect();
    const sorted = docs.sort((a, b) =>
      a.created_at_ms === b.created_at_ms
        ? a.message_id < b.message_id
          ? -1
          : 1
        : a.created_at_ms - b.created_at_ms,
    );
    return sorted.map((doc) =>
      messagePublicSchema.parse(JSON.parse(doc.payload_json)),
    );
  },
});
