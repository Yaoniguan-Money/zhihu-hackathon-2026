import { describe, expect, test } from "bun:test";
import {
  zhihuProfilePublicSchema,
  zhihuAuthorizeReceiptSchema,
} from "@contracts/public/index.js";
import {
  ZHIHU_AUTHORIZE_ENDPOINT,
  buildZhihuAuthorizeUrl,
  buildZhihuTokenExchangeForm,
  buildZhihuCallbackRedirect,
  extractZhihuUidLossless,
  generateZhihuState,
  parseZhihuProfileResponse,
  parseZhihuTokenResponse,
  zhihuAppOrigin,
} from "@server/zhihu/oauth.js";

/**
 * AUTH1 定向测试：OAuth 协议纯函数层。
 * 覆盖官方文档的硬性要求——表单字段名、access_token 成功判定、
 * uid int64 无损解析、无标识不建立会话、回跳 stage 枚举。
 */

describe("AUTH1：授权 URL 构造", () => {
  test("response_type=code 且参数逐项编码", () => {
    const receipt = buildZhihuAuthorizeUrl({
      app_id: "10001",
      redirect_uri: "https://zhihu-hackathon-2026.vercel.app/api/auth/zhihu/callback",
      state: "s-t-a-t-e",
    });
    expect(receipt.authorize_url.startsWith(ZHIHU_AUTHORIZE_ENDPOINT)).toBe(true);
    const url = new URL(receipt.authorize_url);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://zhihu-hackathon-2026.vercel.app/api/auth/zhihu/callback",
    );
    expect(url.searchParams.get("app_id")).toBe("10001");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("s-t-a-t-e");
  });

  test("回执经契约 schema 校验", () => {
    const receipt = buildZhihuAuthorizeUrl({
      app_id: "10001",
      redirect_uri: "https://example.com/cb",
      state: "abc",
    });
    expect(zhihuAuthorizeReceiptSchema.parse(receipt).authorize_url).toBe(
      receipt.authorize_url,
    );
  });

  test("state 为 128-bit base64url 字符集且两次生成不同", async () => {
    const a = await generateZhihuState();
    const b = await generateZhihuState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });
});

describe("AUTH1：token 交换", () => {
  test("表单字段名固定：grant_type 枚举、code 承载授权码", () => {
    const form = buildZhihuTokenExchangeForm({
      config: {
        app_id: "10001",
        app_key: "K".repeat(32),
        redirect_uri: "https://example.com/cb",
      },
      authorization_code: "auth-code-1",
    });
    expect(form.get("app_id")).toBe("10001");
    expect(form.get("app_key")).toBe("K".repeat(32));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("redirect_uri")).toBe("https://example.com/cb");
    expect(form.get("code")).toBe("auth-code-1");
    expect(form.has("authorization_code")).toBe(false);
  });

  test("根字段 access_token 判定成功并读取 expires_in", () => {
    const t = parseZhihuTokenResponse(
      JSON.stringify({ access_token: "tok-1", expires_in: 3600 }),
    );
    expect(t).toEqual({ access_token: "tok-1", expires_in: 3600 });
  });

  test("data 信封里的 access_token 同样成功（code:20000 不是失败）", () => {
    const t = parseZhihuTokenResponse(
      JSON.stringify({
        code: 20000,
        data: { access_token: "tok-2", expires_in: 7200 },
      }),
    );
    expect(t.access_token).toBe("tok-2");
    expect(t.expires_in).toBe(7200);
  });

  test("无 access_token 显式失败；expires_in 缺失为 null 而非编造", () => {
    expect(() =>
      parseZhihuTokenResponse(JSON.stringify({ code: 20000, data: "ok" })),
    ).toThrow();
    const t = parseZhihuTokenResponse(
      JSON.stringify({ access_token: "tok-3" }),
    );
    expect(t.expires_in).toBeNull();
  });

  test("非 JSON 响应显式失败", () => {
    expect(() => parseZhihuTokenResponse("<html>bad gateway</html>")).toThrow();
  });
});

describe("AUTH1：用户资料解析（uid 无损）", () => {
  const RAW_PROFILE = JSON.stringify({
    uid: 969570047710216200,
    hash_id: "0e4f7a9c",
    fullname: "用户昵称",
    gender: "male",
    headline: "一句话介绍",
    avatar_path: "https://picx.zhimg.com/example.jpg",
    url: "https://openapi.zhihu.com/users/969570047710216200",
    email: "",
    extra_field: true,
  });

  test("uid 超过 Number 安全整数仍无损提取", () => {
    // 官方文档示例值（恰好可被 double 往返表示）直接提取一致。
    expect(extractZhihuUidLossless(RAW_PROFILE)).toBe("969570047710216200");
    // 一般 int64（如 2^63-1）经 JSON.parse 必然丢精度：对照证明正则路径是必要的。
    const lossyRaw = '{"uid":9223372036854775807}';
    const lossy = String(JSON.parse(lossyRaw).uid);
    expect(lossy).not.toBe("9223372036854775807");
    expect(extractZhihuUidLossless(lossyRaw)).toBe("9223372036854775807");
  });

  test("uid 位于对象末尾也能提取", () => {
    expect(extractZhihuUidLossless('{"a":1,"uid":123456789012345678}')).toBe(
      "123456789012345678",
    );
  });

  test("hash_id 优先作为稳定标识", () => {
    const p = parseZhihuProfileResponse(RAW_PROFILE);
    expect(p.stable_id).toBe("0e4f7a9c");
    expect(p.fullname).toBe("用户昵称");
    expect(p.avatar_url).toBe("https://picx.zhimg.com/example.jpg");
  });

  test("hash_id 缺省时回退无损 uid 字符串", () => {
    const raw = JSON.stringify({
      uid: 969570047710216200,
      fullname: "u",
    });
    const p = parseZhihuProfileResponse(raw);
    expect(p.stable_id).toBe("969570047710216200");
    expect(p.headline).toBe("");
  });

  test("无有效标识（鉴权失败等）不得建立会话", () => {
    expect(() =>
      parseZhihuProfileResponse(JSON.stringify({ code: 404, data: "User don't exist" })),
    ).toThrow();
    expect(() => parseZhihuProfileResponse("{}")).toThrow();
  });

  test("缺省字段归一为空字符串，扩展字段容忍", () => {
    const p = parseZhihuProfileResponse('{"uid":42,"future":"x"}');
    expect(p).toEqual({
      stable_id: "42",
      fullname: "",
      headline: "",
      avatar_url: "",
      profile_url: "",
    });
  });
});

describe("AUTH1：回跳与 origin", () => {
  test("成功只带 success 标识，失败带 stage 枚举", () => {
    expect(buildZhihuCallbackRedirect({
      app_origin: "https://zhihu-hackathon-2026.vercel.app",
      outcome: { ok: true },
    })).toBe("https://zhihu-hackathon-2026.vercel.app/?zhihu_auth=success");
    expect(buildZhihuCallbackRedirect({
      app_origin: "https://zhihu-hackathon-2026.vercel.app",
      outcome: { ok: false, stage: "token_exchange_failed" },
    })).toBe(
      "https://zhihu-hackathon-2026.vercel.app/?zhihu_auth=failed&stage=token_exchange_failed",
    );
  });

  test("登记回调必须是 HTTPS，否则显式失败", () => {
    expect(
      zhihuAppOrigin("https://zhihu-hackathon-2026.vercel.app/cb"),
    ).toBe("https://zhihu-hackathon-2026.vercel.app");
    expect(() => zhihuAppOrigin("http://127.0.0.1:4173/cb")).toThrow();
  });
});

describe("AUTH1：公开投影契约", () => {
  test("ZhihuProfilePublic 接受标准投影且 expires_at 可为 null", () => {
    const base = {
      stable_id: "0e4f7a9c",
      fullname: "用户昵称",
      headline: "",
      avatar_url: "https://picx.zhimg.com/example.jpg",
      profile_url: "https://openapi.zhihu.com/users/1",
      bound_at: "2026-09-13T12:00:00+00:00",
    };
    expect(zhihuProfilePublicSchema.parse({ ...base, expires_at: null })).toBeTruthy();
    expect(
      zhihuProfilePublicSchema.parse({
        ...base,
        expires_at: "2026-09-13T13:00:00+00:00",
      }),
    ).toBeTruthy();
    // 服务端字段不在公开契约中：多一个 access_token 即拒绝。
    expect(
      zhihuProfilePublicSchema.safeParse({
        ...base,
        expires_at: null,
        access_token: "tok",
      }).success,
    ).toBe(false);
    expect(zhihuProfilePublicSchema.safeParse({ ...base }).success).toBe(false);
  });
});
