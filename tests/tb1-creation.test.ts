import { describe, expect, test } from "bun:test";
import {
  canonicalJson,
  payloadHashForCreateFromSource,
} from "@server/cases/idempotency.js";
import {
  evaluateCreationQuota,
  utcDayKey,
  QUOTA_GLOBAL_DAILY_MAX,
  QUOTA_ROLLING_MAX,
} from "@server/cases/quota.js";
import {
  evaluateInviteCode,
  type InviteCodeRecord,
} from "@server/cases/invites.js";

describe("幂等载荷哈希（CONTRACTS 12）", () => {
  test("键序不影响哈希；undefined 与缺省等价", () => {
    expect(
      canonicalJson({ a: "1", b: "2", c: undefined }),
    ).toBe(canonicalJson({ c: undefined, b: "2", a: "1" }));
    expect(canonicalJson({ a: "1", b: null })).toBe('{"a":"1","b":null}');
  });

  test("规范化后的正文参与哈希：CRLF 与 LF 同哈希", async () => {
    const a = await payloadHashForCreateFromSource({
      source_url: "https://example.com/a",
      source_text: "行一\r\n行二",
      invite_code: "invite",
    });
    const b = await payloadHashForCreateFromSource({
      source_url: "https://example.com/a",
      source_text: "行一\n行二",
      invite_code: "invite",
    });
    expect(a).toBe(b);
  });

  test("不同内容或不同邀请码 → 不同哈希", async () => {
    const base = { source_url: "https://example.com/a", source_text: "正文" };
    const h1 = await payloadHashForCreateFromSource({ ...base, invite_code: "k1" });
    const h2 = await payloadHashForCreateFromSource({ ...base, invite_code: "k2" });
    const h3 = await payloadHashForCreateFromSource({
      ...base,
      source_text: "正文2",
      invite_code: "k1",
    });
    expect(new Set([h1, h2, h3]).size).toBe(3);
  });
});

describe("建案额度（CONTRACTS 4.5）", () => {
  const now = Date.now();
  const base = {
    sourceLengthUnits: 100,
    rollingWindowTimestampsMs: [] as number[],
    concurrentActiveCompilations: 0,
    globalTodayCount: 0,
  };

  test("无占用时通过", () => {
    expect(evaluateCreationQuota(base)).toEqual({ ok: true });
  });

  test("超长正文优先拒绝 SOURCE_TOO_LONG", () => {
    const result = evaluateCreationQuota({
      ...base,
      sourceLengthUnits: 30_001,
      rollingWindowTimestampsMs: [now, now, now],
      concurrentActiveCompilations: 1,
      globalTodayCount: QUOTA_GLOBAL_DAILY_MAX,
    });
    expect(result).toMatchObject({ ok: false, reason: "SOURCE_TOO_LONG" });
  });

  test("并发编译占用 ≥1 → 拒绝", () => {
    expect(
      evaluateCreationQuota({ ...base, concurrentActiveCompilations: 1 }),
    ).toMatchObject({ ok: false, reason: "CREATION_QUOTA_EXCEEDED" });
  });

  test(`滚动 24 小时内 ≥${QUOTA_ROLLING_MAX} 次 → 拒绝；窗口外不计数`, () => {
    expect(
      evaluateCreationQuota({
        ...base,
        rollingWindowTimestampsMs: [now - 1, now - 2, now - 3],
      }),
    ).toMatchObject({ ok: false, reason: "CREATION_QUOTA_EXCEEDED" });
    const outsideWindow = now - 24 * 60 * 60 * 1000 - 1;
    expect(
      evaluateCreationQuota({
        ...base,
        rollingWindowTimestampsMs: [
          outsideWindow,
          outsideWindow,
          outsideWindow,
        ],
      }),
    ).toEqual({ ok: true });
  });

  test(`全站 UTC 日 ≥${QUOTA_GLOBAL_DAILY_MAX} → 拒绝`, () => {
    expect(
      evaluateCreationQuota({
        ...base,
        globalTodayCount: QUOTA_GLOBAL_DAILY_MAX,
      }),
    ).toMatchObject({ ok: false, reason: "CREATION_QUOTA_EXCEEDED" });
  });

  test("utcDayKey 为 UTC 日期", () => {
    const ts = Date.UTC(2026, 8, 5, 23, 59, 0);
    expect(utcDayKey(ts)).toBe("2026-09-05");
  });
});

describe("邀请码（CONTRACTS 4.5，只存哈希）", () => {
  const record: InviteCodeRecord = {
    code_hash: "deadbeef",
    expires_at_ms: null,
    revoked: false,
    max_uses: 2,
    used_count: 1,
  };

  test("哈希匹配且未用尽 → 通过", () => {
    expect(evaluateInviteCode(record, "deadbeef", 1000)).toEqual({ ok: true });
  });

  test("不存在 / 哈希不符 / 撤销 / 过期 / 用尽 → 一律拒绝", () => {
    expect(evaluateInviteCode(undefined, "deadbeef", 1000).ok).toBe(false);
    expect(evaluateInviteCode(record, "ffffff", 1000).ok).toBe(false);
    expect(
      evaluateInviteCode({ ...record, revoked: true }, "deadbeef", 1000).ok,
    ).toBe(false);
    expect(
      evaluateInviteCode({ ...record, expires_at_ms: 999 }, "deadbeef", 1000)
        .ok,
    ).toBe(false);
    expect(
      evaluateInviteCode({ ...record, used_count: 2 }, "deadbeef", 1000).ok,
    ).toBe(false);
  });
});
