import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { getSpeech, storeSpeech } from "./voice";
import { zhihuCallback } from "./zhihuAuth";

const http = httpRouter();

auth.addHttpRoutes(http);

// P1-2：TTS 结果文件存取——仅由本地同源 Next Route 以用户 Bearer 调用；
// Browser 不直连本地 Worker（CONTRACTS 14 / SPEC 5.6）。
http.route({
  path: "/api/voice/stored-speech",
  method: "POST",
  handler: storeSpeech,
});
http.route({
  path: "/api/voice/stored-speech",
  method: "GET",
  handler: getSpeech,
});

// AUTH1：知乎 OAuth 回调完成端点。赛事登记回调是产品域名的 Next Route
// （app/api/auth/zhihu/callback），由其 302 透传到这里；state 是本端点的
// 唯一能力凭证（单次消费、5 分钟 TTL），不依赖调用方 Cookie。
http.route({
  path: "/api/auth/zhihu/callback",
  method: "GET",
  handler: zhihuCallback,
});

export default http;
