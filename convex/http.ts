import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { getSpeech, storeSpeech } from "./voice";

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

export default http;
