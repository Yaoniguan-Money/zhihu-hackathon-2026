"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { useState } from "react";
import { personaForRole } from "@/components/three/characters/personas";
import type { RoleEmotion, RoleStance } from "@/contracts/public";

const InterrogationStage = dynamic(() => import("@/components/three/InterrogationStage"), {
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

/** 仅本地开发的角色陈列室：生产构建直接 404，不进产品路径。 */
export default function DevCharactersPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const [emotion, setEmotion] = useState<RoleEmotion>("calm");
  const [stance, setStance] = useState<RoleStance>("answer");
  const [seed, setSeed] = useState("0");
  const [speaking, setSpeaking] = useState(true);

  return (
    <main className="min-h-screen bg-night p-6">
      <h1 className="text-xl font-black text-paper">角色陈列室（仅本地开发）</h1>
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
      <div className="mt-4 h-[70vh] rounded-2xl border-2 border-paper/15">
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
      <p className="mt-3 text-xs text-paper/50">
        外观映射：{STANDIN.map((r) => personaForRole(r).hairStyle).join(" / ")} · emotion={emotion} · stance={stance}
      </p>
    </main>
  );
}
