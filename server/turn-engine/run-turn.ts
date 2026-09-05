import { z } from "zod";
import type { PrivateFailure } from "@contracts/private/index.js";
import {
  roleCandidatePayloadPrivateSchema,
  rolePrivatePolicySchema,
  validationResultPrivateSchema,
} from "@contracts/private/index.js";
import type { ModelGateway } from "@server/model-gateway/openai-compatible-gateway.js";
import {
  ROLE_CANDIDATE_SCHEMA_VERSION,
  ROLE_VALIDATION_SCHEMA_VERSION,
  roleCandidateModelSchema,
  roleGeneratorSystemPrompt,
  roleGeneratorUserPrompt,
  roleValidationModelSchema,
  validatorSystemPrompt,
  validatorUserPrompt,
} from "@server/model/schemas/role-turn.js";

/**
 * 角色回合的生成-校验-重写循环（ENGINEERING_SPEC §7，TB5/TB6）。
 * 通过 ModelGateway Seam 注入生产 Adapter 或测试 Scripted Adapter；
 * 本模块不含 Convex 依赖，可确定性测试。
 *
 * 重写规则（唯一允许的语义恢复）：
 * - Faithful：初始候选 + 最多两次重写（总候选 ≤3）；status=entailed 且
 *   无 unsupported_spans 且支持 Claim 全部可见才通过。
 * - Distorted：不套用重写兜底——单次候选；status=distorted、检测类型非空
 *   且全部属于允许集合才通过；否则立即终止。
 * 协议/请求/校验器失败不属于语义失败：立即终止，不消耗重写。
 */

const MAX_FAITHFUL_ATTEMPTS = 3;

export interface TurnAttemptContext {
  policy: z.infer<typeof rolePrivatePolicySchema>;
  displayName: string;
  visibleClaims: { claim_id: string; proposition: string }[];
  history: string[];
  question: string;
  mode: string;
  incidentRef: string;
}

export type TurnAttemptOutcome =
  | {
      ok: true;
      candidate: z.infer<typeof roleCandidatePayloadPrivateSchema>;
      validation: z.infer<typeof validationResultPrivateSchema>;
      attempts: number;
    }
  | {
      ok: false;
      reason:
        | "VALIDATION_EXHAUSTED"
        | "DISTORTION_POLICY_VIOLATION"
        | "PROTOCOL_FAILURE";
      failure: PrivateFailure;
      attempts: number;
    };

export type TurnAuditEvent =
  | {
      type: "model_call_started";
      task: "role" | "validator";
      attempt_index: number;
    }
  | {
      type: "model_call_completed";
      task: "role" | "validator";
      attempt_index: number;
      duration_ms: number;
    }
  | {
      type: "model_call_failed";
      task: "role" | "validator";
      attempt_index: number;
      duration_ms: number;
      detail_code: string;
    }
  | { type: "candidate_generated"; attempt_index: number }
  | {
      type: "validation_completed";
      attempt_index: number;
      detail_code: string;
    }
  | { type: "rewrite_started"; attempt_index: number };

export type TurnAuditEmitter = (event: TurnAuditEvent) => Promise<void>;

export async function runGenerationAttempts(
  gateway: ModelGateway,
  context: TurnAttemptContext,
  emit?: TurnAuditEmitter,
): Promise<TurnAttemptOutcome> {
  const faithful = context.policy.fidelity === "faithful";
  const maxAttempts = faithful ? MAX_FAITHFUL_ATTEMPTS : 1;
  const visibleIds = new Set(context.visibleClaims.map((c) => c.claim_id));
  let lastFeedback = "";
  const record = async (event: TurnAuditEvent): Promise<void> => {
    if (emit) await emit(event);
  };

  for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
    if (attemptIndex > 1) {
      await record({ type: "rewrite_started", attempt_index: attemptIndex });
    }
    let candidate;
    const roleCallStart = Date.now();
    await record({
      type: "model_call_started",
      task: "role",
      attempt_index: attemptIndex,
    });
    try {
      candidate = roleCandidateModelSchema.parse(
        await gateway.generateStructured({
          task: "role",
          schemaName: ROLE_CANDIDATE_SCHEMA_VERSION,
          system: roleGeneratorSystemPrompt({
            displayName: context.displayName,
            goal: context.policy.goal,
            faithful,
          }),
          prompt:
            roleGeneratorUserPrompt({
              visibleClaims: context.visibleClaims,
              history: context.history,
              question: context.question,
              questionMode: context.mode,
            }) +
            (lastFeedback
              ? `\n\n上一次候选未通过校验，请修正后重新输出：${lastFeedback}`
              : ""),
          schema: roleCandidateModelSchema,
        }),
      );
    } catch (error) {
      await record({
        type: "model_call_failed",
        task: "role",
        attempt_index: attemptIndex,
        duration_ms: Date.now() - roleCallStart,
        detail_code:
          error instanceof z.ZodError
            ? "MODEL_PROTOCOL_INVALID"
            : "MODEL_REQUEST_FAILED",
      });
      return {
        ok: false,
        reason: "PROTOCOL_FAILURE",
        failure: {
          code: "MODEL_REQUEST_FAILED",
          incident_id: `turn:${context.incidentRef}`,
          detail: `任务 role 的模型请求失败（attempt ${attemptIndex}）`,
        },
        attempts: attemptIndex,
      };
    }
    await record({
      type: "model_call_completed",
      task: "role",
      attempt_index: attemptIndex,
      duration_ms: Date.now() - roleCallStart,
    });
    await record({
      type: "candidate_generated",
      attempt_index: attemptIndex,
    });

    // 服务器前置检查：支持 Claim 必须存在且属于可见集合。
    const supportVisible = candidate.support_claim_ids.every((id) =>
      visibleIds.has(id),
    );

    let validation;
    const validatorCallStart = Date.now();
    await record({
      type: "model_call_started",
      task: "validator",
      attempt_index: attemptIndex,
    });
    try {
      validation = roleValidationModelSchema.parse(
        await gateway.generateStructured({
          task: "validator",
          schemaName: ROLE_VALIDATION_SCHEMA_VERSION,
          system: validatorSystemPrompt({
            faithful,
            allowedDistortionTypes: context.policy.allowed_distortion_types,
          }),
          prompt: validatorUserPrompt({
            visibleClaims: context.visibleClaims,
            speech: candidate.speech,
            supportClaimIds: candidate.support_claim_ids,
          }),
          schema: roleValidationModelSchema,
        }),
      );
    } catch (error) {
      await record({
        type: "model_call_failed",
        task: "validator",
        attempt_index: attemptIndex,
        duration_ms: Date.now() - validatorCallStart,
        detail_code:
          error instanceof z.ZodError
            ? "VALIDATOR_PROTOCOL_INVALID"
            : "VALIDATOR_REQUEST_FAILED",
      });
      return {
        ok: false,
        reason: "PROTOCOL_FAILURE",
        failure: {
          code: "VALIDATOR_REQUEST_FAILED",
          incident_id: `turn:${context.incidentRef}`,
          detail: `任务 validator 的校验请求失败（attempt ${attemptIndex}）`,
        },
        attempts: attemptIndex,
      };
    }
    await record({
      type: "model_call_completed",
      task: "validator",
      attempt_index: attemptIndex,
      duration_ms: Date.now() - validatorCallStart,
    });
    await record({
      type: "validation_completed",
      attempt_index: attemptIndex,
      detail_code: validation.status,
    });

    if (faithful) {
      if (
        supportVisible &&
        validation.status === "entailed" &&
        validation.unsupported_spans.length === 0
      ) {
        return { ok: true, candidate, validation, attempts: attemptIndex };
      }
      lastFeedback = JSON.stringify(validation);
      continue;
    }

    // Distorted：单次候选，无重写兜底。
    if (
      validation.status === "distorted" &&
      validation.detected_distortion_types.length > 0 &&
      supportVisible &&
      validation.detected_distortion_types.every((type) =>
        context.policy.allowed_distortion_types.includes(type),
      )
    ) {
      return { ok: true, candidate, validation, attempts: attemptIndex };
    }
    const policyViolation = validation.detected_distortion_types.some(
      (type) => !context.policy.allowed_distortion_types.includes(type),
    );
    return {
      ok: false,
      reason: policyViolation
        ? "DISTORTION_POLICY_VIOLATION"
        : "VALIDATION_EXHAUSTED",
      failure: {
        code: policyViolation
          ? "DISTORTION_POLICY_VIOLATION"
          : "VALIDATION_EXHAUSTED",
        incident_id: `turn:${context.incidentRef}`,
        detail: policyViolation
          ? "候选使用了未授权的篡改方式"
          : "候选未构成获准的篡改",
      },
      attempts: attemptIndex,
    };
  }

  return {
    ok: false,
    reason: "VALIDATION_EXHAUSTED",
    failure: {
      code: "VALIDATION_EXHAUSTED",
      incident_id: `turn:${context.incidentRef}`,
      detail: `语义校验未通过，共 ${maxAttempts} 次候选`,
    },
    attempts: maxAttempts,
  };
}
