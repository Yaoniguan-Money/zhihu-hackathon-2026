import { describe, expect, test, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  callConvex,
  errorText,
  signInAnonymous,
} from "./helpers/convex-local.js";
import { clearAiProviderRegistry } from "./helpers/convex-local.js";
import { seedGoldenCaseViaAdmin } from "./helpers/golden-seed.js";

/**
 * P1-1 集成（本地后端，默认无模型）：evidence.saveRecording、
 * roleTurns.presentRecording、SessionView 动态 allowed_actions、
 * Recording Evidence 的公开投影与 Board/事件联动。
 * 来源 Approved Role Message 由 admin:seedRoleMessage 构造（复刻
 * finalizeTurnSuccess 的持久化形状；生产唯一路径是回合 worker）。
 * 对质 worker 的终态在无 AI 配置时为 SERVICE_NOT_CONFIGURED（同 TB4）。
 */

const GOLDEN = "case-demo-001";
const OBSERVER = "role-observer";
const ANALYST = "role-analyst";
const OBSERVER_NAME = "沈青梧 · 财经调查记者";

const AI_KEYS = [
  "AI_PROVIDER_NAME",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_CLAIM_MODEL",
  "AI_CASE_MODEL",
  "AI_ROLE_MODEL",
  "AI_VALIDATOR_MODEL",
  "AI_REVEAL_MODEL",
] as const;

function runConvexCli(args: string[]): void {
  const cli = join(
    import.meta.dir,
    "..",
    "node_modules",
    "convex",
    "bin",
    "main.js",
  );
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: join(import.meta.dir, ".."),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `convex ${args.join(" ")} 失败: ${(result.stderr || result.stdout).slice(0, 300)}`,
    );
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

interface FragmentLike {
  evidence_id: string;
  type: string;
  title: string;
  body: string;
  source_message_id?: string;
  public_claim_refs: string[];
  conflicts_with: string[];
  unlocked_at: string;
}

async function createInvestigationSession(
  token: string,
): Promise<string> {
  const created = await callConvex<{ session_id: string }>(
    "mutation",
    "sessions:create",
    { case_id: GOLDEN, client_action_id: uuid() },
    { bearer: token },
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(errorText(created));
  const forced = await callConvex(
    "mutation",
    "admin:forcePhase",
    { session_key: created.value.session_id, phase: "investigation" },
    { admin: true },
  );
  expect(forced.ok).toBe(true);
  return created.value.session_id;
}

async function seedRoleMessage(
  sessionId: string,
  role_id: string,
  text: string,
  support: string[],
): Promise<string> {
  const seeded = await callConvex<{ message_id: string }>(
    "mutation",
    "admin:seedRoleMessage",
    { session_id: sessionId, role_id, text, support_claim_ids: support },
    { admin: true },
  );
  expect(seeded.ok).toBe(true);
  if (!seeded.ok) throw new Error(errorText(seeded));
  return seeded.value.message_id;
}

async function getAllowedActions(
  token: string,
  sessionId: string,
): Promise<string[]> {
  const view = await callConvex<{ allowed_actions: string[] }>(
    "query",
    "sessions:getPublic",
    { session_id: sessionId },
    { bearer: token },
  );
  expect(view.ok).toBe(true);
  if (!view.ok) throw new Error(errorText(view));
  return view.value.allowed_actions;
}

describe("P1-1 Recording 与对质（本地后端，无模型）", () => {
  test("前置：清空 AI 供应商注册表覆盖层", async () => {
    expect(await clearAiProviderRegistry()).toBe(true);
  });
  beforeAll(async () => {
    await seedGoldenCaseViaAdmin();
    await callConvex("mutation", "admin:resetQuotaState", {}, { admin: true });
    // 保证「无模型」前提：移除可能残留的 AI_* 配置（p11-model 自带 beforeAll 重设）。
    for (const key of AI_KEYS) {
      try {
        runConvexCli(["env", "remove", key]);
      } catch {
        // 本就未配置：预期路径。
      }
    }
  }, 120_000);

  test("saveRecording：鉴权 / 安全查找 / 输入 schema", async () => {
    const noAuth = await callConvex(
      "mutation",
      "evidence:saveRecording",
      { session_id: "s", message_id: "m", client_action_id: uuid() },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const missing = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: "no-such-session",
        message_id: "msg-x",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(missing.ok).toBe(false);
    expect(errorText(missing)).toContain("SESSION_NOT_FOUND");

    const badUuid = await callConvex(
      "mutation",
      "evidence:saveRecording",
      { session_id: "s", message_id: "m", client_action_id: "nope" },
      { bearer: token },
    );
    expect(badUuid.ok).toBe(false);
    expect(errorText(badUuid)).toContain("INVALID_ARGUMENT");

    // 越权与不存在同一安全结果（CONTRACTS 4.3）。
    const sessionId = await createInvestigationSession(token);
    const foreignToken = await signInAnonymous();
    const foreign = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: sessionId,
        message_id: "msg-x",
        client_action_id: uuid(),
      },
      { bearer: foreignToken },
    );
    expect(foreign.ok).toBe(false);
    expect(errorText(foreign)).toContain("SESSION_NOT_FOUND");
    void sessionId;
  });

  test("saveRecording：阶段门控与来源消息校验", async () => {
    const token = await signInAnonymous();
    const created = await callConvex<{ session_id: string }>(
      "mutation",
      "sessions:create",
      { case_id: GOLDEN, client_action_id: uuid() },
      { bearer: token },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const briefingId = created.value.session_id;

    // briefing 阶段直接拒绝。
    const inBriefing = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: briefingId,
        message_id: "msg-x",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(inBriefing.ok).toBe(false);
    expect(errorText(inBriefing)).toContain("SESSION_PHASE_CONFLICT");

    const sessionId = await createInvestigationSession(token);

    // 不存在的消息 → EVIDENCE_UNAVAILABLE。
    const unknownMessage = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: sessionId,
        message_id: "msg-does-not-exist",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(unknownMessage.ok).toBe(false);
    expect(errorText(unknownMessage)).toContain("EVIDENCE_UNAVAILABLE");

    // 玩家消息不是 Approved Role Message → EVIDENCE_UNAVAILABLE。
    const asked = await callConvex<{ request_id: string }>(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: OBSERVER,
        mode: "direct",
        text: "Meta 裁员数据是多少？",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(asked.ok).toBe(true);
    const messages = await callConvex<
      { message_id: string; speaker_type: string }[]
    >("query", "messages:listPublic", { session_id: sessionId }, {
      bearer: token,
    });
    expect(messages.ok).toBe(true);
    if (!messages.ok) return;
    const playerMessage = messages.value.find(
      (m) => m.speaker_type === "player",
    );
    expect(playerMessage).toBeDefined();
    const playerSave = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: sessionId,
        message_id: playerMessage!.message_id,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(playerSave.ok).toBe(false);
    expect(errorText(playerSave)).toContain("EVIDENCE_UNAVAILABLE");
  });

  test("saveRecording：创建、投影、事件、allowed_actions、幂等与内容级去重", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);

    // 无角色消息时 investigation 不开放 save_recording。
    expect(await getAllowedActions(token, sessionId)).toEqual(["ask"]);

    const messageId = await seedRoleMessage(
      sessionId,
      OBSERVER,
      "Meta 计划裁减约20%员工，涉及约1.58万人。",
      ["cl-004"],
    );

    // 有已发布 Approved Role Message 后开放 save_recording。
    expect(await getAllowedActions(token, sessionId)).toEqual([
      "ask",
      "save_recording",
    ]);

    const saved = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const fragment = saved.value;
    expect(fragment.type).toBe("quote");
    expect(fragment.body).toBe("Meta 计划裁减约20%员工，涉及约1.58万人。");
    expect(fragment.title).toBe(`录音：${OBSERVER_NAME}`);
    expect(fragment.source_message_id).toBe(messageId);
    // cl-004 当时未公开可见 → 推导引用为空（不暴露私有支持 Claim）。
    expect(fragment.public_claim_refs).toEqual([]);
    expect(fragment.conflicts_with).toEqual([]);

    // 公开投影字段扫描：不得出现私有字段。
    const raw = JSON.stringify(fragment);
    expect(raw).not.toContain("support_claim_ids");
    expect(raw).not.toContain("fidelity");

    // 证据列表包含录音 Fragment。
    const fragments = await callConvex<FragmentLike[]>(
      "query",
      "evidence:getAll",
      { session_id: sessionId },
      { bearer: token },
    );
    expect(fragments.ok).toBe(true);
    if (fragments.ok) {
      expect(fragments.value.map((f) => f.evidence_id)).toContain(
        fragment.evidence_id,
      );
    }

    // recording_saved 事件入公开序列。
    const events = await callConvex<
      { payload: { type: string; evidence_id?: string } }[]
    >(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 0 },
      { bearer: token },
    );
    expect(events.ok).toBe(true);
    if (events.ok) {
      const savedEvents = events.value.filter(
        (e) => e.payload.type === "recording_saved",
      );
      expect(savedEvents).toHaveLength(1);
      expect(savedEvents[0]!.payload.evidence_id).toBe(fragment.evidence_id);
    }

    // 保存后开放 present_recording；录音本身即已解锁证据，
    // 因此 update_board / accuse 一并动态开放（CONTRACTS 7.1）。
    expect(await getAllowedActions(token, sessionId)).toEqual([
      "ask",
      "save_recording",
      "present_recording",
      "update_board",
      "accuse",
    ]);

    // 同 action ID 幂等重放 → 同一 Fragment。
    const actionId = uuid();
    const first = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: actionId },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    const replay = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: actionId },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok && first.ok) expect(replay.value).toEqual(first.value);

    // 同 action ID 不同载荷 → IDEMPOTENCY_CONFLICT。
    const conflict = await callConvex(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: sessionId,
        message_id: "msg-other",
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(conflict.ok).toBe(false);
    expect(errorText(conflict)).toContain("IDEMPOTENCY_CONFLICT");

    // 不同 action ID 重复保存同一消息 → 返回首次创建的同一录音（内容级确定性）。
    const duplicate = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) {
      expect(duplicate.value.evidence_id).toBe(fragment.evidence_id);
    }

    // 录音可上板（自动已解锁）。
    const board = await callConvex<{ revision: number }>(
      "action",
      "evidence:updateBoard",
      {
        session_id: sessionId,
        placements: [
          {
            evidence_id: fragment.evidence_id,
            lane: "retelling",
            x: 0.4,
            y: 0.4,
          },
        ],
        links: [],
        expected_revision: 0,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(board.ok).toBe(true);
    if (board.ok) expect(board.value.revision).toBe(1);
  });

  test("saveRecording：public_claim_refs 按已公开可见 Claim 推导", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);

    // 先解锁 ev-meta-quote（refs cl-004）→ cl-004 成为已公开可见 Claim。
    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );

    const messageId = await seedRoleMessage(
      sessionId,
      OBSERVER,
      "文中给出 Meta 裁减约20%、约1.58万人的数字。",
      ["cl-004", "cl-009"],
    );
    const saved = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // 支持 Claim 中只有 cl-004 已公开可见；cl-009 未解锁不得借录音暴露。
    expect(saved.value.public_claim_refs).toEqual(["cl-004"]);
  });

  test("presentRecording：拒绝路径（查找/越权/阶段/锁/Role）", async () => {
    const noAuth = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: "s",
        evidence_id: "ev",
        target_role_id: OBSERVER,
        client_action_id: uuid(),
      },
      { admin: true },
    );
    expect(noAuth.ok).toBe(false);
    expect(errorText(noAuth)).toContain("AUTH_REQUIRED");

    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);
    const messageId = await seedRoleMessage(
      sessionId,
      OBSERVER,
      "Meta 计划裁减约20%员工。",
      ["cl-004"],
    );
    const saved = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const recordingId = saved.value.evidence_id;

    // SESSION_NOT_FOUND / 越权。
    const missing = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: "no-such-session",
        evidence_id: recordingId,
        target_role_id: ANALYST,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(missing.ok).toBe(false);
    expect(errorText(missing)).toContain("SESSION_NOT_FOUND");

    // 未解锁 / 非录音 / 跨 Session 的 Evidence 一律 EVIDENCE_UNAVAILABLE。
    const unknownEvidence = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: "ev-unknown",
        target_role_id: ANALYST,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(unknownEvidence.ok).toBe(false);
    expect(errorText(unknownEvidence)).toContain("EVIDENCE_UNAVAILABLE");

    await callConvex(
      "mutation",
      "admin:seedUnlockedEvidence",
      { session_id: sessionId, evidence_ids: ["ev-meta-quote"] },
      { admin: true },
    );
    const notRecording = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: "ev-meta-quote",
        target_role_id: ANALYST,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(notRecording.ok).toBe(false);
    expect(errorText(notRecording)).toContain("EVIDENCE_UNAVAILABLE");

    const foreignToken = await signInAnonymous();
    const otherSessionId = await createInvestigationSession(foreignToken);
    const otherMessageId = await seedRoleMessage(
      otherSessionId,
      OBSERVER,
      "另一局的取证。",
      ["cl-004"],
    );
    const otherRecording = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      {
        session_id: otherSessionId,
        message_id: otherMessageId,
        client_action_id: uuid(),
      },
      { bearer: foreignToken },
    );
    expect(otherRecording.ok).toBe(true);
    const crossSession = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: otherRecording.ok
          ? otherRecording.value.evidence_id
          : "ev-none",
        target_role_id: ANALYST,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(crossSession.ok).toBe(false);
    expect(errorText(crossSession)).toContain("EVIDENCE_UNAVAILABLE");

    // 未知目标 Role。
    const unknownRole = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: recordingId,
        target_role_id: "role-nobody",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(unknownRole.ok).toBe(false);
    expect(errorText(unknownRole)).toContain("ROLE_NOT_FOUND");

    // 非法 action ID。
    const badUuid = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: recordingId,
        target_role_id: ANALYST,
        client_action_id: "nope",
      },
      { bearer: token },
    );
    expect(badUuid.ok).toBe(false);
    expect(errorText(badUuid)).toContain("INVALID_ARGUMENT");

    // 对质与 ask 共用排他锁：存在 ask 活动 Ticket → ROLE_TURN_BUSY。
    await callConvex(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId },
      { admin: true },
    );
    const busy = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: recordingId,
        target_role_id: ANALYST,
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(busy.ok).toBe(false);
    expect(errorText(busy)).toContain("ROLE_TURN_BUSY");
  });

  test("presentRecording：对质 Ticket 同样占用排他锁（ask → ROLE_TURN_BUSY）", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);
    await callConvex(
      "mutation",
      "admin:seedActiveTicket",
      { session_id: sessionId, kind: "present_recording" },
      { admin: true },
    );
    const busy = await callConvex(
      "action",
      "roleTurns:ask",
      {
        session_id: sessionId,
        role_id: OBSERVER,
        mode: "direct",
        text: "对质占用锁期间不能提问。",
        source: "keyboard",
        client_action_id: uuid(),
      },
      { bearer: token },
    );
    expect(busy.ok).toBe(false);
    expect(errorText(busy)).toContain("ROLE_TURN_BUSY");
  });

  test("presentRecording：受理、幂等、recording_presented 事件与无模型终态", async () => {
    const token = await signInAnonymous();
    const sessionId = await createInvestigationSession(token);
    const messageId = await seedRoleMessage(
      sessionId,
      OBSERVER,
      "Meta 计划裁减约20%员工，涉及约1.58万人。",
      ["cl-004"],
    );
    const saved = await callConvex<FragmentLike>(
      "mutation",
      "evidence:saveRecording",
      { session_id: sessionId, message_id: messageId, client_action_id: uuid() },
      { bearer: token },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const actionId = uuid();
    const first = await callConvex<{ request_id: string }>(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: saved.value.evidence_id,
        target_role_id: ANALYST,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.request_id.length).toBeGreaterThan(0);

    // 幂等重放返回同一 receipt。
    const replay = await callConvex<{ request_id: string }>(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: saved.value.evidence_id,
        target_role_id: ANALYST,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value).toEqual(first.value);

    // 同 ID 不同载荷 → IDEMPOTENCY_CONFLICT。
    const conflict = await callConvex(
      "action",
      "roleTurns:presentRecording",
      {
        session_id: sessionId,
        evidence_id: saved.value.evidence_id,
        target_role_id: OBSERVER,
        client_action_id: actionId,
      },
      { bearer: token },
    );
    expect(conflict.ok).toBe(false);
    expect(errorText(conflict)).toContain("IDEMPOTENCY_CONFLICT");

    // recording_presented 事件入公开序列。
    const events = await callConvex<
      {
        payload: {
          type: string;
          request_id?: string;
          target_role_id?: string;
          evidence_id?: string;
        };
      }[]
    >(
      "query",
      "events:listPublic",
      { session_id: sessionId, after_sequence: 0 },
      { bearer: token },
    );
    expect(events.ok).toBe(true);
    if (events.ok) {
      const presented = events.value.filter(
        (e) => e.payload.type === "recording_presented",
      );
      expect(presented).toHaveLength(1);
      expect(presented[0]!.payload.request_id).toBe(first.value.request_id);
      expect(presented[0]!.payload.target_role_id).toBe(ANALYST);
      expect(presented[0]!.payload.evidence_id).toBe(saved.value.evidence_id);
    }

    // 无 AI 配置：对质回合终态为 SERVICE_NOT_CONFIGURED（与 TB4 同一契约行为）。
    const deadline = Date.now() + 60_000;
    let terminal: { status: string; error?: { code?: string } } | null = null;
    while (Date.now() < deadline) {
      const observed = await callConvex<{
        status: string;
        error?: { code: string };
      }>("query", "roleTurns:observe", { request_id: first.value.request_id }, {
        bearer: token,
      });
      if (observed.ok && observed.value) {
        terminal = observed.value;
        if (
          terminal.status === "succeeded" ||
          terminal.status === "failed"
        ) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(terminal).not.toBeNull();
    expect(terminal!.status).toBe("failed");
    expect(terminal!.error?.code).toBe("SERVICE_NOT_CONFIGURED");
  }, 90_000);
});
