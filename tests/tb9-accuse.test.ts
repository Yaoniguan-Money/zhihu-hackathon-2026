import { describe, expect, test, beforeAll } from "bun:test";
import {
  callConvex,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * TB9 集成（默认无模型）：accuse 的鉴权、幂等、阶段与证据门控。
 * 完整 golden 闭环（开场+审讯+正确指控+Reveal）见 tb9-model.test.ts。
 */

const GOLDEN = "case-demo-001";

function uuid(): string {
  return crypto.randomUUID();
}

describe("TB9 指控门控（本地后端，无模型）", () => {
  beforeAll(async () => {
    await seedGoldenCaseViaAdmin();
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
  });

  test("无身份 / 非法 UUID / 不存在 Session → 对应错误", async () => {
    const noAuth = await callConvex(
      "action",
      "game:accuse",
      {
        session_id: "s",
        suspect_role_id: "role-skeptic",
        distortion_types: ["scope_expand"],
        evidence_ids: ["ev-meta-quote"],
        client_action_id: uuid(),
      },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const badUuid = await callConvex(
      "action",
      "game:accuse",
      {
        session_id: "s",
        suspect_role_id: "role-skeptic",
        distortion_types: ["scope_expand"],
        evidence_ids: ["ev-meta-quote"],
        client_action_id: "nope",
      },
      { bearer: token },
    );
    expect(badUuid.ok).toBe(false);
    expect(errorText(badUuid)).toContain("INVALID_ARGUMENT");

    const missing = await callConvex(
      "action",
      "game:accuse",
      {
        session_id: "no-such-session",
        suspect_role_id: "role-skeptic",
        distortion_types: ["scope_expand"],
        evidence_ids: ["ev-meta-quote"],
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(missing.ok).toBe(false);
    expect(errorText(missing)).toContain("SESSION_NOT_FOUND");
  });

  test("阶段门控（briefing 不能指控）与未解锁证据 → EVIDENCE_UNAVAILABLE", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const sessionId = created.value.session_id;

    const inBriefing = await callConvex(
      "action",
      "game:accuse",
      {
        session_id: sessionId,
        suspect_role_id: "role-skeptic",
        distortion_types: ["scope_expand"],
        evidence_ids: ["ev-meta-quote"],
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(inBriefing.ok).toBe(false);
    expect(errorText(inBriefing)).toContain("SESSION_PHASE_CONFLICT");

    await callConvex(
      "mutation",
      "admin:forcePhase",
      { session_key: sessionId, phase: "investigation" },
      { admin: true },
    );
    const locked = await callConvex(
      "action",
      "game:accuse",
      {
        session_id: sessionId,
        suspect_role_id: "role-skeptic",
        distortion_types: ["scope_expand"],
        evidence_ids: ["ev-meta-quote"],
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(locked.ok).toBe(false);
    expect(errorText(locked)).toContain("EVIDENCE_UNAVAILABLE");

    // getReveal 在非 revealed 阶段返回 null（CONTRACTS 10）
    const reveal = await callConvex<unknown>(
      "query",
      "game:getReveal",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(reveal.ok).toBe(true);
    if (reveal.ok) expect(reveal.value).toBeNull();
  });
});
