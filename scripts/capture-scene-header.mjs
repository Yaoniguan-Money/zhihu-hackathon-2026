import { chromium } from "@playwright/test";

/** 抓取大厅 3D 实景作为简报页头图资产。输出: public/assets/scenes/detective-room-3d.png */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);
// 等待 R3F 完成 resize（画布宽度 > 1200）
for (let i = 0; i < 10; i++) {
  const w = await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    if (!cs.length) return 0;
    return Math.round(cs.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0].getBoundingClientRect().width);
  });
  if (w > 1200) break;
  await page.waitForTimeout(1500);
}
// 隐藏非 canvas 链上的 DOM
await page.evaluate(() => {
  const canvas = [...document.querySelectorAll("canvas")].sort(
    (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
  )[0];
  const chain = new Set();
  let el = canvas;
  while (el) {
    chain.add(el);
    el = el.parentElement;
  }
  document.querySelectorAll("body *").forEach((n) => {
    if (!chain.has(n)) n.style.visibility = "hidden";
  });
  document.body.style.background = "#171430";
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "public/assets/scenes/detective-room-3d.png" });
await browser.close();
console.log("scene header captured");
