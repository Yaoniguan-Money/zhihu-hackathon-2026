import type { RolePublic } from "@/contracts/public";

/**
 * 角色 → 卡通外观。已知 persona_key 走精选设定；
 * 用户自建案件的自由文本 persona 用关键词推断；
 * 仍然无法判定时按 role_id 哈希从预设池取一套，保证同角色永远同外观。
 */

export type HairStyle = "short" | "bob" | "bun" | "swept" | "curly" | "hood";
export type HatStyle = "none" | "beret" | "cap" | "beanie";
export type Accessory = "none" | "press-card" | "bowtie" | "scarf" | "necklace" | "lanyard";

export interface PersonaLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: string;
  outfitAccent: string;
  glasses: boolean;
  hat: HatStyle;
  accessory: Accessory;
  beard: boolean;
  blushDefault: number;
}

const baseLook: Omit<PersonaLook, "skin" | "hair" | "hairStyle" | "outfit" | "outfitAccent" | "hat" | "accessory"> = {
  glasses: false,
  beard: false,
  blushDefault: 0.22,
};

export const PERSONA_PRESETS: PersonaLook[] = [
  {
    ...baseLook,
    skin: "#ffdfc4",
    hair: "#4a3226",
    hairStyle: "bob",
    outfit: "#2ea79b",
    outfitAccent: "#f6f1e6",
    glasses: false,
    hat: "none",
    accessory: "press-card",
  },
  {
    ...baseLook,
    skin: "#ffe3c2",
    hair: "#2b2b33",
    hairStyle: "swept",
    outfit: "#5b5bd6",
    outfitAccent: "#c7c9f4",
    glasses: true,
    hat: "none",
    accessory: "necklace",
  },
  {
    ...baseLook,
    skin: "#ffd9b8",
    hair: "#8a4a2f",
    hairStyle: "hood",
    outfit: "#e4685d",
    outfitAccent: "#ffd9a0",
    glasses: false,
    hat: "none",
    accessory: "lanyard",
    blushDefault: 0.4,
  },
  {
    ...baseLook,
    skin: "#f2cfa8",
    hair: "#9a9aa4",
    hairStyle: "short",
    outfit: "#8a6b46",
    outfitAccent: "#c8402f",
    glasses: true,
    hat: "none",
    accessory: "bowtie",
    beard: true,
    blushDefault: 0.15,
  },
  {
    ...baseLook,
    skin: "#ffe0bd",
    hair: "#3d2f4a",
    hairStyle: "curly",
    outfit: "#d9a13b",
    outfitAccent: "#4b3f2f",
    glasses: false,
    hat: "beret",
    accessory: "scarf",
  },
  {
    ...baseLook,
    skin: "#f7cfae",
    hair: "#1f1f28",
    hairStyle: "bun",
    outfit: "#c2557a",
    outfitAccent: "#f2e3c9",
    glasses: true,
    hat: "none",
    accessory: "none",
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
  { test: /撰稿人|作家|评论|观察/, look: PERSONA_PRESETS[4] },
  { test: /编辑|自媒体|运营|策划|规划|理财/, look: PERSONA_PRESETS[5] },
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
