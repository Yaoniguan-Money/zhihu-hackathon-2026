import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:3000/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const info = await page.evaluate(() => {
  const canvas = [...document.querySelectorAll("canvas")].at(-1);
  if (!canvas) return { canvas: false };
  const chain = [];
  let el = canvas;
  while (el && el.tagName !== "BODY") {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    chain.push({
      tag: el.tagName,
      cls: (el.className || "").toString().slice(0, 60),
      position: cs.position,
      top: cs.top,
      bottom: cs.bottom,
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
    el = el.parentElement;
  }
  return { canvas: true, chain, stylesheets: document.styleSheets.length };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
