const CONVEX_SITE = "https://agile-turtle-860.convex.site";
const GAME_ORIGIN = "https://zhihu-hackathon.yaoniguan56.workers.dev";

function html(title, detail, callback) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#171430;color:#f4efe6;margin:0;padding:48px 24px;line-height:1.6}code{background:#2a2548;padding:2px 6px;border-radius:6px;word-break:break-all}</style>
</head><body><h1>${title}</h1><p>${detail}</p><p>回调地址：<br><code>${callback}</code></p></body></html>`;
}

function toGameLobby(source) {
  const out = new URL("/", GAME_ORIGIN);
  try {
    const loc = typeof source === "string" ? new URL(source, GAME_ORIGIN) : source;
    loc.searchParams.forEach((value, key) => {
      out.searchParams.set(key, value);
    });
  } catch {
    /* keep lobby origin */
  }
  return out.toString();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const callback = `${url.origin}/api/auth/zhihu/callback`;

    if (url.pathname === "/api/auth/zhihu/callback") {
      if (!url.searchParams.has("authorization_code") && !url.searchParams.has("code")) {
        return new Response(
          html(
            "知乎登录回调已就绪",
            "把这个地址填进赛事页的授权回调 URL。真正登录请在游戏大厅点「知乎登录」。",
            callback,
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
        );
      }
      const target = new URL("/api/auth/zhihu/callback", CONVEX_SITE);
      url.searchParams.forEach((value, key) => {
        target.searchParams.set(key, value);
      });
      const upstream = await fetch(target.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "Cache-Control": "no-store" },
      });
      const location =
        upstream.headers.get("Location") ?? upstream.headers.get("location");
      if (location) {
        return Response.redirect(toGameLobby(location), 302);
      }
      const body = await upstream.text();
      let stage = "service_not_configured";
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed.stage === "string") stage = parsed.stage;
      } catch {
        /* keep default */
      }
      return Response.redirect(
        toGameLobby(`/?zhihu_auth=failed&stage=${encodeURIComponent(stage)}`),
        302,
      );
    }

    const auth = url.searchParams.get("zhihu_auth");
    if (auth === "success" || auth === "failed") {
      return Response.redirect(toGameLobby(url), 302);
    }
    return new Response(
      html("证据链狼人杀", "这是知乎 OAuth 回调入口。赛事页请登记下方地址。", callback),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
};
