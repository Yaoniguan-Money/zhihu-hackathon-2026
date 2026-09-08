import { describe, test, expect, beforeEach } from "bun:test";

/**
 * lib/sfx 音效引擎纯逻辑测试（合成/播放本体依赖 WebAudio，浏览器端人工验收）。
 * 这里只测：节流窗口、静音持久化、播放路径在 AudioContext 缺失时不抛错。
 */

// ---- 最小 window/localStorage 打桩（Bun 无 DOM） ----
const store = new Map<string, string>();
class FakeLS {
  getItem(k: string) {
    return store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    store.set(k, v);
  }
  removeItem(k: string) {
    store.delete(k);
  }
}
class FakePerformance {
  private t = 0;
  now() {
    this.t += 1;
    return this.t;
  }
}

(globalThis as Record<string, unknown>).localStorage = new FakeLS();
(globalThis as Record<string, unknown>).performance = new FakePerformance();
(globalThis as Record<string, unknown>).window = {
  localStorage: (globalThis as unknown as { localStorage: FakeLS }).localStorage,
};

// sfx.ts 顶层读取 window/localStorage/performance，桩必须先于导入就位
const { isSfxMuted, setSfxMuted, toggleSfxMuted, playSfx } = await import("../lib/sfx");

describe("lib/sfx 纯逻辑", () => {
  beforeEach(() => {
    store.clear();
    setSfxMuted(false);
  });

  test("静音状态可切换并持久化", () => {
    expect(isSfxMuted()).toBe(false);
    setSfxMuted(true);
    expect(isSfxMuted()).toBe(true);
    expect(store.get("ecw.sfx.muted")).toBe("1");
    setSfxMuted(false);
    expect(store.get("ecw.sfx.muted")).toBe("0");
  });

  test("toggleSfxMuted 返回切换后的状态", () => {
    const after1 = toggleSfxMuted();
    expect(after1).toBe(true);
    const after2 = toggleSfxMuted();
    expect(after2).toBe(false);
  });

  test("静音时 playSfx 静默跳过且不抛错", () => {
    setSfxMuted(true);
    expect(() => playSfx("click")).not.toThrow();
    expect(() => playSfx("reveal")).not.toThrow();
  });

  test("无 AudioContext 环境（Node 桩）下 playSfx 不抛错", () => {
    expect(() => playSfx("click")).not.toThrow();
    expect(() => playSfx("unlock")).not.toThrow();
    expect(() => playSfx("error")).not.toThrow();
  });

  test("同名音效节流：type 间隔内只走一次配方（无异常即通过）", () => {
    expect(() => {
      playSfx("type");
      playSfx("type"); // 节流窗口内被跳过
      playSfx("type");
    }).not.toThrow();
  });
});

describe("calcDiscernmentLevel 分档", () => {
  // 独立导入，避免与 window 桩互相影响
  const { calcDiscernmentLevel } = require("../lib/score-card");
  test("边界分档", () => {
    expect(calcDiscernmentLevel(0)).toBe(1);
    expect(calcDiscernmentLevel(39.4)).toBe(1);
    expect(calcDiscernmentLevel(40)).toBe(2);
    expect(calcDiscernmentLevel(59.9)).toBe(2);
    expect(calcDiscernmentLevel(60)).toBe(3);
    expect(calcDiscernmentLevel(74.9)).toBe(3);
    expect(calcDiscernmentLevel(75)).toBe(4);
    expect(calcDiscernmentLevel(89.9)).toBe(4);
    expect(calcDiscernmentLevel(90)).toBe(5);
    expect(calcDiscernmentLevel(100)).toBe(5);
  });
});
