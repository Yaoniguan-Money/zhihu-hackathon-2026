import { describe, expect, test } from "bun:test";
import { extractParagraphs, SourceIngestionError } from "@server/source/normalize.js";
import {
  materializeEvidenceGraph,
  mergeClaimGraphSlices,
  tryLocateExactExcerpt,
} from "@server/source/materialize-claims.js";
import {
  claimExtractionParagraphBatches,
  claimExtractionUserPrompt,
  CLAIM_EXTRACTION_PARAGRAPH_BATCH_SIZE,
} from "@server/model/schemas/claim-extraction.js";

describe("tryLocateExactExcerpt", () => {
  const canonical = "甲段锚点文本\n\n乙段目标句子在这里";
  const paragraphs = extractParagraphs(canonical);

  test("声称段块命中则用该段", () => {
    const span = tryLocateExactExcerpt(canonical, paragraphs, {
      paragraph_index: 1,
      excerpt: "目标句子",
    });
    expect(span).toEqual({
      start: canonical.indexOf("目标句子"),
      end: canonical.indexOf("目标句子") + "目标句子".length,
      paragraph_index: 1,
    });
  });

  test("段块编号错但摘录在另一段内唯一出现 → 纠正编号", () => {
    const span = tryLocateExactExcerpt(canonical, paragraphs, {
      paragraph_index: 0,
      excerpt: "目标句子",
    });
    expect(span?.paragraph_index).toBe(1);
    expect(canonical.slice(span!.start, span!.end)).toBe("目标句子");
  });

  test("摘录不存在或段内不唯一 → null", () => {
    expect(
      tryLocateExactExcerpt(canonical, paragraphs, {
        paragraph_index: 0,
        excerpt: "不存在的句子",
      }),
    ).toBeNull();
    const dup = "重复重复文本";
    expect(
      tryLocateExactExcerpt(dup, extractParagraphs(dup), {
        paragraph_index: 0,
        excerpt: "重复",
      }),
    ).toBeNull();
  });
});

describe("mergeClaimGraphSlices / materializeEvidenceGraph", () => {
  const canonical = "第一段含有可核验事实甲。\n\n第二段含有可核验事实乙。";
  const paragraphs = extractParagraphs(canonical);

  test("分片下标按偏移合并", () => {
    const merged = mergeClaimGraphSlices([
      {
        claims: [
          {
            paragraph_index: 0,
            excerpt: "可核验事实甲",
            proposition: "甲成立",
          },
        ],
        relations: [],
      },
      {
        claims: [
          {
            paragraph_index: 1,
            excerpt: "可核验事实乙",
            proposition: "乙成立",
          },
        ],
        relations: [{ from_claim_index: 0, to_claim_index: 0, type: "supports" }],
      },
    ]);
    expect(merged.claims).toHaveLength(2);
    expect(merged.relations[0]).toEqual({
      from_claim_index: 1,
      to_claim_index: 1,
      type: "supports",
    });
  });

  test("无法逐字定位的候选丢弃，关系端点随之丢弃", () => {
    const graph = materializeEvidenceGraph({
      case_key: "case-x",
      canonical,
      paragraphs,
      candidate: {
        claims: [
          {
            paragraph_index: 0,
            excerpt: "可核验事实甲",
            proposition: "甲成立",
          },
          {
            paragraph_index: 1,
            excerpt: "模型编造的摘录",
            proposition: "编造",
          },
          {
            paragraph_index: 1,
            excerpt: "可核验事实乙",
            proposition: "乙成立",
          },
        ],
        relations: [
          { from_claim_index: 0, to_claim_index: 1, type: "supports" },
          { from_claim_index: 0, to_claim_index: 2, type: "qualifies" },
        ],
      },
    });
    expect(graph.claims.map((claim) => claim.claim_id)).toEqual(["cl-1", "cl-2"]);
    expect(graph.relations).toHaveLength(1);
    expect(graph.relations[0]).toMatchObject({
      from_claim_id: "cl-1",
      to_claim_id: "cl-2",
      type: "qualifies",
    });
  });

  test("全部摘录无法定位 → SOURCE_SPAN_INVALID", () => {
    expect(() =>
      materializeEvidenceGraph({
        case_key: "case-x",
        canonical,
        paragraphs,
        candidate: {
          claims: [
            {
              paragraph_index: 0,
              excerpt: "编造摘录",
              proposition: "无效",
            },
          ],
          relations: [],
        },
      }),
    ).toThrow(SourceIngestionError);
  });
});

describe("claimExtractionParagraphBatches / user prompt", () => {
  test("按批切开且覆盖全部段块", () => {
    const batches = claimExtractionParagraphBatches(84);
    expect(batches[0]).toEqual({ start: 0, end: CLAIM_EXTRACTION_PARAGRAPH_BATCH_SIZE });
    expect(batches.at(-1)).toEqual({ start: 72, end: 84 });
    expect(batches).toHaveLength(7);
  });

  test("prompt 使用全局段块编号", () => {
    const prompt = claimExtractionUserPrompt({
      numberedParagraphs: ["零", "一", "二", "三"],
      range: { start: 2, end: 4 },
    });
    expect(prompt).toContain("[2] 二");
    expect(prompt).toContain("[3] 三");
    expect(prompt).not.toContain("[0] 二");
  });
});
