/**
 * Golden 系统案件种子脚本：把冻结的 case-demo-001 / case-demo-002 标注直接落库。
 * 运行：`bun scripts/seed-golden-case.ts`
 */
import {
  seedGoldenCaseViaAdmin,
  seedSecondGoldenCaseViaAdmin,
} from "../tests/helpers/golden-seed.js";

for (const result of [
  await seedGoldenCaseViaAdmin(),
  await seedSecondGoldenCaseViaAdmin(),
]) {
  console.log(
    result.created
      ? `seeded: ${result.case_key}`
      : `already seeded: ${result.case_key}`,
  );
}
