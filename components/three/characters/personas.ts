import type { RolePublic } from "@/contracts/public";

/**
 * 角色 → 外观设定（对齐官方立绘资产 public/assets/cast/*.png 的盲盒渲染风）。
 * 已知 persona_key 走精选设定；用户自建案件的自由文本 persona 用关键词推断；
 * 仍然无法判定时按 role_id 哈希从预设池取一套，保证同角色永远同外观。
 */

export type HairStyle = "bob" | "tousledBob" | "messy" | "swept" | "curly";
export type OutfitStyle = "trench" | "suit" | "hoodie" | "professor";
export type ShoeStyle = "flat" | "heel" | "sneaker";
export type GlassesStyle = "none" | "round" | "oval";
export type CastProp =
  | "pressCard"
  | "lanyard"
  | "bowtie"
  | "scarf"
  | "plaidScarf"
  | "book"
  | "notebook"
  | "laptop"
  | "satchel"
  | "shoulderBag"
  | "watch"
  | "necklace"
  | "earrings";

export interface PersonaLook {
  skin: string;
  /** 腮红基色 */
  blush: string;
  hair: string;
  /** 眉毛/睫毛等深色发饰 */
  hairDark: string;
  /** 虹膜基色 */
  eye: string;
  hairStyle: HairStyle;
  outfitStyle: OutfitStyle;
  outfit: string;
  outfitAccent: string;
  trousers: string;
  shoes: string;
  shoeStyle: ShoeStyle;
  /** true=双手捧物在胸前（教授的书），手臂摆动幅度收小 */
  holdFront: boolean;
  glasses: GlassesStyle;
  hat: "none" | "beret";
  props: CastProp[];
  beard: boolean;
}

export const PERSONA_PRESETS: PersonaLook[] = [
  {
    // 沈青梧 · 财经调查记者
    skin: "#ffdfc0",
    blush: "#ff9d94",
    hair: "#6d4a33",
    hairDark: "#452c1c",
    eye: "#7c4a28",
    hairStyle: "bob",
    outfitStyle: "trench",
    outfit: "#5a7f76",
    outfitAccent: "#efe8d6",
    trousers: "#547a70",
    shoes: "#2c2830",
    shoeStyle: "flat",
    glasses: "none",
    hat: "none",
    props: ["pressCard", "shoulderBag"],
    beard: false,
    holdFront: false,
  },
  {
    // 纪云汀 · 行业分析师
    skin: "#ffdcbd",
    blush: "#ff9d94",
    hair: "#4a3b33",
    hairDark: "#2c211c",
    eye: "#5d4638",
    hairStyle: "tousledBob",
    outfitStyle: "suit",
    outfit: "#464b6d",
    outfitAccent: "#cfbde9",
    trousers: "#3c4160",
    shoes: "#252230",
    shoeStyle: "heel",
    glasses: "oval",
    hat: "none",
    props: ["notebook", "watch", "necklace"],
    beard: false,
    holdFront: false,
  },
  {
    // 阿岚 · 前端工程师
    skin: "#ffd9b8",
    blush: "#ff9d90",
    hair: "#a55d38",
    hairDark: "#6b381e",
    eye: "#6f4425",
    hairStyle: "messy",
    outfitStyle: "hoodie",
    outfit: "#c55e48",
    outfitAccent: "#efb64b",
    trousers: "#34333d",
    shoes: "#e9e3d5",
    shoeStyle: "sneaker",
    glasses: "none",
    hat: "none",
    props: ["lanyard", "laptop"],
    beard: false,
    holdFront: false,
  },
  {
    // 何叙 · 政治经济学教授
    skin: "#f8d2b0",
    blush: "#f2988d",
    hair: "#bcb6ae",
    hairDark: "#8d867d",
    eye: "#504337",
    hairStyle: "swept",
    outfitStyle: "professor",
    outfit: "#6b5441",
    outfitAccent: "#9d3040",
    trousers: "#594636",
    shoes: "#2f221a",
    shoeStyle: "flat",
    glasses: "round",
    hat: "none",
    props: ["bowtie", "scarf", "book"],
    beard: true,
    holdFront: true,
  },
  {
    // 柳成荫 · 自由撰稿人
    skin: "#ffdcbc",
    blush: "#ff9d94",
    hair: "#5d4469",
    hairDark: "#3f2f4c",
    eye: "#5c4055",
    hairStyle: "curly",
    outfitStyle: "trench",
    outfit: "#d7a843",
    outfitAccent: "#f0e6d1",
    trousers: "#4c3c31",
    shoes: "#34251d",
    shoeStyle: "heel",
    glasses: "none",
    hat: "beret",
    props: ["plaidScarf", "satchel", "earrings"],
    beard: false,
    holdFront: false,
  },
  {
    // 哈希兜底：档案管理员式中性外观
    skin: "#ffdfc6",
    blush: "#ff9d94",
    hair: "#2f2a36",
    hairDark: "#1d1922",
    eye: "#3f3a44",
    hairStyle: "tousledBob",
    outfitStyle: "suit",
    outfit: "#7a6a54",
    outfitAccent: "#e8dfc8",
    trousers: "#423c4a",
    shoes: "#2c2830",
    shoeStyle: "flat",
    glasses: "none",
    hat: "none",
    props: ["notebook"],
    beard: false,
    holdFront: false,
  },
];

const CURATED: Record<string, PersonaLook> = {
  calm_reporter: PERSONA_PRESETS[0],
  sharp_analyst: PERSONA_PRESETS[1],
  uneasy_engineer: PERSONA_PRESETS[2],
  stern_professor: PERSONA_PRESETS[3],
  smooth_essayist: PERSONA_PRESETS[4],
};

const KEYWORD_LOOKS: Array<{ test: RegExp; look: PersonaLook }> = [
  { test: /记者|调查|媒体人/, look: PERSONA_PRESETS[0] },
  { test: /分析师|研究员|数据|博士|学者/, look: PERSONA_PRESETS[1] },
  { test: /工程师|程序员|职工|上班|员工|打工/, look: PERSONA_PRESETS[2] },
  { test: /教授|专家|经济学家|导师/, look: PERSONA_PRESETS[3] },
  { test: /撰稿人|作家|评论|观察|编辑|自媒体|运营|策划|理财/, look: PERSONA_PRESETS[4] },
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function personaForRole(role: RolePublic): PersonaLook {
  const curated = CURATED[role.persona_key];
  if (curated) return curated;

  const haystack = `${role.display_name} ${role.public_bio} ${role.persona_key}`;
  for (const entry of KEYWORD_LOOKS) {
    if (entry.test.test(haystack)) return entry.look;
  }
  return PERSONA_PRESETS[hashString(role.role_id) % PERSONA_PRESETS.length];
}
