/**
 * 邀请码（CONTRACTS 4.5）：明文绝不入库；只保存 SHA-256 哈希，
 * 可设置过期与总使用次数。撤销/过期/用尽/不存在一律同一拒绝。
 */

export interface InviteCodeRecord {
  code_hash: string;
  expires_at_ms: number | null;
  revoked: boolean;
  max_uses: number;
  used_count: number;
}

export function evaluateInviteCode(
  record: InviteCodeRecord | undefined,
  codeHash: string,
  nowMs: number,
): { ok: true } | { ok: false; detail: string } {
  if (!record || record.code_hash !== codeHash) {
    return { ok: false, detail: "邀请码无效" };
  }
  if (record.revoked) {
    return { ok: false, detail: "邀请码已撤销" };
  }
  if (record.expires_at_ms !== null && nowMs >= record.expires_at_ms) {
    return { ok: false, detail: "邀请码已过期" };
  }
  if (record.used_count >= record.max_uses) {
    return { ok: false, detail: "邀请码使用次数已用尽" };
  }
  return { ok: true };
}
