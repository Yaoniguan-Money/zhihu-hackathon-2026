import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";

// PF0 工具链锁定测试：钉住计划要求的运行时与框架版本线，
// 防止依赖升级无声偏离 DEVELOPER_A_IMPLEMENTATION_PLAN.md 的 PF0 验收。
describe("PF0 工具链固定版本", () => {
  test("Bun 运行时为 1.4.x", () => {
    const [major, minor] = Bun.version.split(".").map(Number);
    expect(major).toBe(1);
    expect(minor).toBe(4);
  });

  test("Next.js 为 16.x，React / react-dom 为 19.x", () => {
    expect(packageJson.dependencies.next).toMatch(/^16\./);
    expect(packageJson.dependencies.react).toMatch(/^19\./);
    expect(packageJson.dependencies["react-dom"]).toMatch(/^19\./);
  });

  test("TypeScript 为 5.9.x，Convex 已显式固定", () => {
    expect(packageJson.devDependencies.typescript).toMatch(/^5\.9\./);
    expect(packageJson.dependencies.convex).toMatch(/^\d+\./);
  });

  test("测试与 typecheck 命令已注册", () => {
    expect(packageJson.scripts.test).toBe("bun test");
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
  });
});
