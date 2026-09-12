import {
  assertEvidenceGraphInvariants,
  evidenceGraphPrivateSchema,
  type CanonicalParagraphPrivate,
  type EvidenceGraphPrivate,
} from "@contracts/private/index.js";
import {
  candidateClaimGraphSliceSchema,
  type CandidateClaimGraph,
} from "@server/model/schemas/claim-extraction.js";
import { locateSourceSpan, SourceIngestionError } from "./normalize.js";

/**
 * 将抽取候选落成 Evidence Graph。
 * 模型输出只是候选：摘录必须在 Canonical Source 某段内逐字唯一出现；
 * 对不上的条目丢弃（「宁可少抽」），不做模糊重定位或猜测修复。
 * 全部丢弃则 SOURCE_SPAN_INVALID。
 */

export function tryLocateExactExcerpt(
  canonical: string,
  paragraphs: CanonicalParagraphPrivate[],
  input: { paragraph_index: number; excerpt: string },
): { start: number; end: number; paragraph_index: number } | null {
  try {
    const span = locateSourceSpan(canonical, paragraphs, input);
    return {
      start: span.start,
      end: span.end,
      paragraph_index: input.paragraph_index,
    };
  } catch (error) {
    if (
      !(error instanceof SourceIngestionError) ||
      error.failure.code !== "SOURCE_SPAN_INVALID"
    ) {
      throw error;
    }
  }

  const matches: { start: number; end: number; paragraph_index: number }[] =
    [];
  for (const paragraph of paragraphs) {
    try {
      const span = locateSourceSpan(canonical, paragraphs, {
        paragraph_index: paragraph.paragraph_index,
        excerpt: input.excerpt,
      });
      matches.push({
        start: span.start,
        end: span.end,
        paragraph_index: paragraph.paragraph_index,
      });
    } catch (error) {
      if (
        !(error instanceof SourceIngestionError) ||
        error.failure.code !== "SOURCE_SPAN_INVALID"
      ) {
        throw error;
      }
    }
  }
  if (matches.length === 1) {
    return matches[0]!;
  }
  return null;
}

export function mergeClaimGraphSlices(
  slices: CandidateClaimGraph[],
): CandidateClaimGraph {
  const claims: CandidateClaimGraph["claims"] = [];
  const relations: CandidateClaimGraph["relations"] = [];
  for (const slice of slices) {
    const parsed = candidateClaimGraphSliceSchema.parse(slice);
    const offset = claims.length;
    claims.push(...parsed.claims);
    for (const relation of parsed.relations) {
      relations.push({
        from_claim_index: relation.from_claim_index + offset,
        to_claim_index: relation.to_claim_index + offset,
        type: relation.type,
      });
    }
  }
  return { claims, relations };
}

export function materializeEvidenceGraph(args: {
  case_key: string;
  canonical: string;
  paragraphs: CanonicalParagraphPrivate[];
  candidate: CandidateClaimGraph;
}): EvidenceGraphPrivate {
  const kept: {
    originalIndex: number;
    claim: CandidateClaimGraph["claims"][number];
    span: { start: number; end: number; paragraph_index: number };
  }[] = [];

  args.candidate.claims.forEach((claim, originalIndex) => {
    const span = tryLocateExactExcerpt(
      args.canonical,
      args.paragraphs,
      {
        paragraph_index: claim.paragraph_index,
        excerpt: claim.excerpt,
      },
    );
    if (span) {
      kept.push({ originalIndex, claim, span });
    }
  });

  if (kept.length === 0) {
    throw new SourceIngestionError({
      code: "SOURCE_SPAN_INVALID",
      incident_id: "span:no_verbatim_excerpt",
      detail: "没有可在 Canonical Source 中逐字定位的摘录",
    });
  }

  const indexMap = new Map<number, number>();
  const claims = kept.map((item, newIndex) => {
    indexMap.set(item.originalIndex, newIndex);
    return {
      claim_id: `cl-${newIndex + 1}`,
      proposition: item.claim.proposition,
      ...(item.claim.subject !== undefined && { subject: item.claim.subject }),
      ...(item.claim.predicate !== undefined && {
        predicate: item.claim.predicate,
      }),
      ...(item.claim.object !== undefined && { object: item.claim.object }),
      ...(item.claim.time !== undefined && { time: item.claim.time }),
      ...(item.claim.scope !== undefined && { scope: item.claim.scope }),
      ...(item.claim.condition !== undefined && {
        condition: item.claim.condition,
      }),
      ...(item.claim.modality !== undefined && {
        modality: item.claim.modality,
      }),
      source_span: {
        start: item.span.start,
        end: item.span.end,
        text: item.claim.excerpt,
        paragraph_index: item.span.paragraph_index,
      },
      source_ref: `src-${args.case_key}`,
      confidence: 1,
    };
  });

  const relations: {
    relation_id: string;
    from_claim_id: string;
    to_claim_id: string;
    type: CandidateClaimGraph["relations"][number]["type"];
  }[] = [];
  for (const relation of args.candidate.relations) {
    const fromNew = indexMap.get(relation.from_claim_index);
    const toNew = indexMap.get(relation.to_claim_index);
    if (fromNew === undefined || toNew === undefined || fromNew === toNew) {
      continue;
    }
    relations.push({
      relation_id: `rel-${relations.length + 1}`,
      from_claim_id: claims[fromNew]!.claim_id,
      to_claim_id: claims[toNew]!.claim_id,
      type: relation.type,
    });
  }

  const graph = evidenceGraphPrivateSchema.parse({
    case_id: args.case_key,
    source_id: `src-${args.case_key}`,
    claims,
    relations,
  });
  assertEvidenceGraphInvariants(graph);
  return graph;
}
