/**
 * Golden 系统案件种子脚本（TB2a）：把冻结的 case-demo-001 标注直接落库。
 * 运行：`bun scripts/seed-golden-case.ts`
 */
import { seedGoldenCaseViaAdmin } from "../tests/helpers/golden-seed.js";

const result = await seedGoldenCaseViaAdmin();
console.log(
  result.created
    ? `seeded: ${result.case_key}`
    : `already seeded: ${result.case_key}`,
);
