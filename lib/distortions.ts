import type { BoardLane } from "@/contracts/public";
import type { DistortionType } from "@/contracts/shared";

/** 篡改方式中文释义（REVEAL / ACCUSATION 共用）。 */
export const DISTORTION_META: Record<DistortionType, { name: string; desc: string }> = {
  scope_expand: { name: "范围扩大", desc: "把局部情况说成整体情况" },
  degree_strengthen: { name: "程度加强", desc: "把轻微影响说成严重后果" },
  condition_delete: { name: "条件删除", desc: "去掉前提条件，让结论绝对化" },
  causal_swap: { name: "因果倒置", desc: "把原因和结果颠倒" },
  time_montage: { name: "时间拼接", desc: "把不同时间的事实拼成错误先后" },
  source_splice: { name: "来源拼接", desc: "拼接不同来源形成新结论" },
  context_omit: { name: "语境遗漏", desc: "删除关键上下文改变原意" },
  subject_swap: { name: "主语替换", desc: "偷换行为的主体" },
  concept_shift: { name: "概念偷换", desc: "用相似但不同的概念替换" },
  cherry_pick: { name: "选择性引用", desc: "只引用有利部分，隐藏反例" },
};

export const DISTORTION_ORDER = Object.keys(DISTORTION_META) as DistortionType[];

/** 证据板六泳道（契约 BoardLane）。 */
export const BOARD_LANES: Array<{ id: BoardLane; label: string; hint: string; color: string }> = [
  { id: "source", label: "原文事实", hint: "来自来源材料", color: "#2ea79b" },
  { id: "retelling", label: "角色转述", hint: "角色说过的话", color: "#8f9bff" },
  { id: "timeline", label: "时间轴", hint: "按时间排列", color: "#f2b04c" },
  { id: "scope", label: "范围", hint: "局部还是整体", color: "#c2557a" },
  { id: "causal", label: "因果", hint: "谁导致谁", color: "#e4685d" },
  { id: "condition", label: "条件", hint: "前提是否还在", color: "#4fc3b6" },
];

export const BOARD_LINK_META: Record<string, { label: string; color: string }> = {
  supports: { label: "支持", color: "#2ea79b" },
  contradicts: { label: "矛盾", color: "#e4685d" },
  before: { label: "早于", color: "#f2b04c" },
  after: { label: "晚于", color: "#f2b04c" },
  qualifies: { label: "限定", color: "#8f9bff" },
  claims_causal: { label: "声称因果", color: "#c2557a" },
};

export const EMOTION_META: Record<string, { label: string; color: string }> = {
  calm: { label: "平静", color: "#2ea79b" },
  uneasy: { label: "不安", color: "#f2b04c" },
  defensive: { label: "防御", color: "#8f9bff" },
  agitated: { label: "激动", color: "#e4685d" },
};

export const STANCE_META: Record<string, string> = {
  answer: "回答",
  deny: "否认",
  challenge: "反驳",
  clarify: "澄清",
  evade: "回避",
};
