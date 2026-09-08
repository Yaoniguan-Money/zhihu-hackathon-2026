import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = "http://127.0.0.1:3000";
const outDir = "out/qa/flow";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });

// 大厅：跳过引导 → 截图
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
for (let i = 0; i < 6; i++) {
  const dlg = page.locator('[role="dialog"]');
  if ((await dlg.count()) === 0) break;
  const next = dlg.getByRole("button", { name: /下一步|开始/ }).first();
  if ((await next.count()) > 0) await next.click().catch(() => {});
  else break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1000);
await shot("01-lobby");

// 开始第一案 → 简报
const startBtn = page.locator("button", { hasText: "开始" }).last();
await page.getByRole("button", { name: /开始\s*⟩?/ }).first().click().catch(() => {});
await page.waitForTimeout(4000);
await shot("02-briefing-top");
await page.mouse.wheel(0, 900);
await page.waitForTimeout(1200);
await shot("03-briefing-roles");

// 开庭 → 开场陈述（骨架/卡片）
const kaiting = page.getByRole("button", { name: /开庭/ });
if ((await kaiting.count()) === 1) await kaiting.click();
await page.waitForTimeout(7000);
await shot("04-opening-generating");
// 跳过最多 5 条
for (let i = 0; i < 6; i++) {
  const skipVoice = page.getByRole("button", { name: /跳过朗读/ });
  const skipStmt = page.getByRole("button", { name: /^跳过/ });
  if ((await skipVoice.count()) >= 1) await skipVoice.first().click().catch(() => {});
  else if ((await skipStmt.count()) >= 1) await skipStmt.first().click().catch(() => {});
  await page.waitForTimeout(2500);
}
await shot("05-interrogation-investigation");

// 选角 + 提问（触发聚焦镜头/气泡/回答）
const chip = page.getByRole("button", { name: "纪云汀" });
if ((await chip.count()) === 1) await chip.click();
await page.waitForTimeout(2200);
await shot("06-focus-camera");
const input = page.getByPlaceholder(/提问/);
if ((await input.count()) === 1) await input.fill("裁员潮里资本先替换哪类岗位？");
const ask = page.getByRole("button", { name: /发问/ });
if ((await ask.count()) === 1) await ask.click();
await page.waitForTimeout(12000);
await shot("07-answer-waiting");
await page.waitForTimeout(30000);
await shot("08-answer-arrived");

// 证据板
await page.goto(base + "/game/evidence", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
for (let i = 0; i < 6; i++) {
  const dlg = page.locator('[role="dialog"]');
  if ((await dlg.count()) === 0) break;
  await page.evaluate(() => document.querySelector('[role="dialog"] button.btn-amber')?.click());
  await page.waitForTimeout(500);
}
const poolChip = page.locator("button", { hasText: "裁员" }).first();
if ((await poolChip.count()) > 0) await poolChip.click().catch(() => {});
await page.waitForTimeout(1000);
await shot("09-evidence-board");

// 指控页（角色立柱 h-64）
await page.goto(base + "/game/accusation", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
await page.evaluate(() => document.querySelector('[role="dialog"] button.btn-amber')?.click());
await page.waitForTimeout(1500);
await shot("10-accusation");

// 角色渲染成本隔离（5 角色立柱场景）
await page.waitForTimeout(1000);
const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);
console.log("portrait diagnostics:", JSON.stringify(diag));

await browser.close();
console.log("flow capture done");
