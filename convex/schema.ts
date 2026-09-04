import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// PF1：Convex Auth（Anonymous，见 ADR 0004）所需的固定表集合。
// 业务表在 TB1+ 按 docs/developer-a/CONTRACTS.md 逐阶段增加；
// 本文件不含任何业务契约表。
export default defineSchema({
  ...authTables,
});
