"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { notFound } from "next/navigation";
import { useState } from "react";
import { personaForRole } from "@/components/three/characters/personas";
import { CAST_ART } from "@/components/three/characters/castArt";
import type { RoleEmotion, RoleStance } from "@/contracts/public";

const InterrogationStage = dynamic(() => import("@/components/three/InterrogationStage"), {
  ssr: false,
});

const FrontRow = dynamic(() => import("@/components/three/PortraitRow"), {
  ssr: false,
});

const STANDIN = (["calm_reporter", "sharp_analyst", "uneasy_engineer", "stern_professor", "smooth_essayist"] as const).map(
  (persona_key, i) => ({
    role_id: `gallery-${i}`,
    display_name: ["沈青梧", "纪云汀", "阿岚", "何叙", "柳成荫"][i],
    public_bio: "角色陈列",
    persona_key,
    voice_id: `g-${i}`,
  }),
);

const EMOTIONS: RoleEmotion[] = ["calm", "uneasy", "defensive", "agitated"];
const STANCES: RoleStance[] = ["answer", "deny", "challenge", "clarify", "evade"];

/** 仅本地开发的角色陈列室：3D 模型与官方立绘并排比对，生产构建直接 404。 */
export default function DevCharactersPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const [emotion, setEmotion] = useState<RoleEmotion>("calm");
  const [stance, setStance] = useState<RoleStance>("answer");
  const [seed, setSeed] = useState("0");
  const [speaking, setSpeaking] = useState(false);

  return (
    <main className="min-h-screen bg-night p-6">
      <h1 className="text-xl font-black text-paper">角色陈列室 · 3D vs 官方立绘（仅本地开发）</h1>

      <div className="mt-3 flex flex-wrap gap-2">
        {EMOTIONS.map((e) => (
          <button key={e} onClick={() => setEmotion(e)} className={`chip cursor-pointer ${emotion === e ? "!bg-amber !text-ink" : "!bg-transparent !text-paper"}`}>
            {e}
          </button>
        ))}
        {STANCES.map((s) => (
          <button key={s} onClick={() => setStance(s)} className={`chip cursor-pointer ${stance === s ? "!bg-coral !text-paper" : "!bg-transparent !text-paper"}`}>
            {s}
          </button>
        ))}
        <button onClick={() => setSpeaking((v) => !v)} className={`chip cursor-pointer ${speaking ? "!bg-teal !text-ink" : "!bg-transparent !text-paper"}`}>
          speaking: {String(speaking)}
        </button>
        <button onClick={() => setSeed(String(Math.random()))} className="chip cursor-pointer !bg-indigo-soft !text-ink">
          触发手势
        </button>
      </div>

      {/* 审讯桌全景 */}
      <div className="mt-4 h-[58vh] rounded-2xl border-2 border-paper/15">
        <InterrogationStage
          roles={STANDIN.map((role, i) => ({
            role,
            emotion,
            stance,
            speaking,
            pressure: i * 18 + 10,
            gestureSeed: seed + i,
          }))}
        />
      </div>

      {/* 正面立绘排：五官与比例比对 */}
      <section className="mt-4">
        <h2 className="text-sm font-black text-paper/80">正面视图（五官比对）</h2>
        <div className="mt-2 h-[420px] rounded-2xl border-2 border-paper/15">
          <FrontRow roles={STANDIN} className="h-full w-full" />
        </div>
      </section>

      {/* 比对区：官方单体立绘 | 官方四视图 */}
      <section className="mt-6">
        <h2 className="text-sm font-black text-paper/80">建模比对基准（官方资产）</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
          {STANDIN.map((standin) => {
            const art = CAST_ART[standin.persona_key];
            const look = personaForRole(standin);
            return (
              <div key={standin.role_id} className="overflow-hidden rounded-xl border border-paper/15 bg-night-deep/60">
                <div className="relative h-64">
                  <Image
                    src={art.portrait}
                    alt={`${standin.display_name} 官方立绘`}
                    fill
                    sizes="240px"
                    className="object-cover object-top"
                  />
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-black text-paper">
                    {standin.display_name} <span className="text-paper/40">· {art.name}</span>
                  </p>
                  <p className="text-[10px] text-paper/45">
                    {look.hairStyle} / {look.outfitStyle} / 眼色 {look.eye}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["calm_reporter", "sharp_analyst", "uneasy_engineer", "stern_professor", "smooth_essayist"] as const).map((k) => (
            <div key={k} className="overflow-hidden rounded-xl border border-paper/15 bg-night-deep/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={CAST_ART[k].fourView} alt={`${CAST_ART[k].name} 四视图`} className="w-full" />
              <p className="px-2 py-1 text-[10px] text-paper/45">{CAST_ART[k].name} · 四视图</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
