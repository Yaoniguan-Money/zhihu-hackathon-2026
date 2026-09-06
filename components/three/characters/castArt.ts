/**
 * persona_key → 官方立绘资产（public/assets/cast/）。
 * 3D 模型是对这些立绘的程序化还原；2D 页面直接使用立绘本体。
 */
export const CAST_ART: Record<string, { portrait: string; fourView: string; name: string }> = {
  calm_reporter: {
    portrait: "/assets/cast/shen-qingwu.png",
    fourView: "/assets/cast/four-views/shen-qingwu.png",
    name: "沈青梧",
  },
  sharp_analyst: {
    portrait: "/assets/cast/ji-yunting.png",
    fourView: "/assets/cast/four-views/ji-yunting.png",
    name: "纪云汀",
  },
  uneasy_engineer: {
    portrait: "/assets/cast/a-lan.png",
    fourView: "/assets/cast/four-views/a-lan.png",
    name: "阿岚",
  },
  stern_professor: {
    portrait: "/assets/cast/he-xu.png",
    fourView: "/assets/cast/four-views/he-xu.png",
    name: "何叙",
  },
  smooth_essayist: {
    portrait: "/assets/cast/liu-chengyin.png",
    fourView: "/assets/cast/four-views/liu-chengyin.png",
    name: "柳成荫",
  },
};

export const SCENE_ART = "/assets/scenes/detective-room.png";

export function castArtFor(personaKey: string): { portrait: string; fourView: string; name: string } | null {
  return CAST_ART[personaKey] ?? null;
}
