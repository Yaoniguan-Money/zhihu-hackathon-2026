"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useGame } from "@/context/GameContext";
import { newClientActionId } from "@/lib/convex-client";
import { toPublicError } from "@/lib/convex-errors";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Mascot from "@/components/ui/Mascot";
import { Icon } from "@/components/ui/Icons";
import type { CaseCompilationStatusPublic } from "@/contracts/public";

const InterrogationStage = dynamic(() => import("@/components/three/InterrogationStage"), {
  ssr: false,
  loading: () => <StageFallback />,
});

function StageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Mascot motion="computer" size={110} caption="侦探事务所准备中…" />
    </div>
  );
}

/** 自定义建案：URL + 完整正文 + 邀请码 → durable 编译 → 进度观察。 */
function CustomCaseForm() {
  const router = useRouter();
  const { selectCase } = useGame();
  const createFromSource = useAction(api.cases.createFromSource);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [invite, setInvite] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<CaseCompilationStatusPublic["error"] | { code: string; message: string } | null>(null);

  // durable 编译进度：直接订阅公开查询。
  const compilation = useQuery(
    api.cases.observeCompilation,
    caseId ? { case_id: caseId } : "skip",
  ) as CaseCompilationStatusPublic | null | undefined;

  useEffect(() => {
    if (compilation?.status === "failed" && compilation.error) {
      setError(compilation.error);
    }
    if (compilation?.status === "succeeded" && caseId) {
      selectCase(caseId);
      router.push("/game/briefing");
    }
  }, [compilation, caseId, selectCase, router]);

  const submit = async () => {
    setError(null);
    try {
      const receipt = await createFromSource({
        source_url: url,
        source_text: text,
        invite_code: invite,
        client_action_id: newClientActionId(),
      });
      setCaseId(receipt.case_id);
    } catch (err) {
      setError(toPublicError(err));
    }
  };

  const canSubmit = /^https:\/\/.+/.test(url) && text.trim().length > 0 && invite.trim().length > 0 && !caseId;

  return (
    <div className="card-dark overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-5 py-4 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper/40 text-paper/80">
          <Icon name="link" size={15} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-black text-paper">带来一篇真实知乎文章</span>
          <span className="block text-xs text-paper/55">需要邀请码 · AI 会把它编译成一局五角色对局</span>
        </span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-paper/60">
          <Icon name="next" size={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-5 pb-5">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://zhuanlan.zhihu.com/p/…"
                className="w-full rounded-xl border-2 border-paper/20 bg-night-deep/60 px-4 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-amber focus:outline-none"
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="粘贴文章的完整正文（必须完整，URL 只作来源记录）"
                rows={5}
                className="w-full resize-none rounded-xl border-2 border-paper/20 bg-night-deep/60 px-4 py-2.5 text-sm leading-relaxed text-paper placeholder:text-paper/30 focus:border-amber focus:outline-none"
              />
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="邀请码"
                className="w-full rounded-xl border-2 border-paper/20 bg-night-deep/60 px-4 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-amber focus:outline-none"
              />
              {caseId && !error && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-amber/60 bg-amber/10 px-4 py-3">
                  <motion.span
                    className="h-4 w-4 rounded-full border-2 border-amber border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  />
                  <span className="text-sm font-bold text-amber">
                    {compilation?.status === "working" ? "AI 正在编译案件…" : "已受理，等待编译…"}
                  </span>
                </div>
              )}
              {error && <ErrorPanel error={error as never} onDismiss={() => { setError(null); setCaseId(null); }} />}
              <button onClick={submit} disabled={!canSubmit} className="btn btn-amber w-full text-sm disabled:opacity-40">
                <Icon name="sparkle" size={15} filled /> 编译案件
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { catalog, catalogError, retryCatalog, selectCase, actionError, clearActionError, booted } = useGame();
  const [activeIdx, setActiveIdx] = useState(-1);
  useEffect(() => {
    retryCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx((prev) => {
        const next = Math.floor(Math.random() * 5);
        return next === prev ? (next + 1) % 5 : next;
      });
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const start = (caseId: string) => {
    selectCase(caseId);
    router.push("/game/briefing");
  };

  return (
    <main className="relative min-h-screen">
      {/* 3D 大厅 */}
      <div className="absolute inset-0">
        <InterrogationStage
          variant="lobby"
          roles={HERO_STANDIN_ROLES.map((role, i) => ({
            role,
            speaking: activeIdx === i,
            emotion: i % 3 === 0 ? "calm" : i % 3 === 1 ? "uneasy" : "calm",
            gestureSeed: activeIdx === i ? `lobby-${activeIdx}` : undefined,
          }))}
        />
      </div>

      {/* 标题浮层 */}
      <div className="pointer-events-none absolute left-0 right-0 top-10 z-10 text-center">
        <motion.h1
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, type: "spring", stiffness: 120 }}
          className="text-5xl font-black tracking-wide text-paper drop-shadow-[0_4px_0_rgba(26,22,38,0.8)] md:text-6xl"
        >
          证据链<span className="text-amber">狼人杀</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="mt-2 text-sm font-bold text-paper/70"
        >
          所有话语都来自原文，但有人悄悄改变了事实的关联
        </motion.p>
      </div>

      {/* 右侧面板 */}
      <div className="absolute bottom-4 right-4 top-4 z-10 flex w-[420px] max-w-[92vw] flex-col gap-3 overflow-y-auto rounded-3xl border-2 border-paper/10 bg-night-deep/70 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-paper">
            <Icon name="mask" size={20} className="mr-2 inline text-amber" />
            选择案件
          </h2>
          {!booted && <span className="text-xs text-paper/50">建立身份中…</span>}
        </div>

        {catalogError && <ErrorPanel error={catalogError} onRetry={retryCatalog} />}

        {catalog.length === 0 && !catalogError && (
          <Mascot motion="sleep" size={92} caption="案件档案室暂时空着…" className="py-8" />
        )}

        <AnimatePresence>
          {catalog.map((c, i) => (
            <motion.button
              key={c.case_id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.02, rotate: -0.4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => start(c.case_id)}
              className="card group relative overflow-hidden p-4 text-left"
            >
              <div className="tape" style={{ top: -8, left: 18, transform: "rotate(-4deg)" }} />
              <p className="mt-2 text-[11px] font-black uppercase tracking-widest text-coral-deep">
                {c.theme}
              </p>
              <h3 className="mt-1 line-clamp-2 text-base font-black leading-snug text-ink">{c.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink/65">{c.summary}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink/45">五名角色 · 一名篡改者</span>
                <span className="btn btn-coral !px-3 !py-1 text-xs">
                  开始 <Icon name="next" size={12} />
                </span>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>

        <CustomCaseForm />

        <div className="card-dark p-4 text-xs leading-relaxed text-paper/60">
          <p className="mb-1 font-black text-paper/80">玩法 · 90 秒看懂</p>
          <p>① 五个 AI 角色围绕圆桌各自开场，只有一人篡改了原文。</p>
          <p>② 温和/直接/施压三种问法审讯，把发言存成录音证据对质。</p>
          <p>③ 在证据板上拼出「来源事实 → 角色转述 → 被改变的关系」。</p>
          <p>④ 提交指控：篡改者 + 篡改方式 + 证据链。</p>
        </div>

        {actionError && <ErrorPanel error={actionError} onDismiss={clearActionError} />}
      </div>

      <footer className="absolute bottom-3 left-4 z-10 text-xs font-bold text-paper/40">
        知乎黑客松 2026 · 跨次元游乐场赛道
      </footer>
    </main>
  );
}

// 大厅氛围角色：案件未选中时没有真实 roles，用稳定的演出身份驱动 3D 大厅。
// 这些身份只存在于大厅舞台，不进入任何对局数据面。
const HERO_STANDIN_ROLES = (["calm_reporter", "sharp_analyst", "uneasy_engineer", "stern_professor", "smooth_essayist"] as const).map(
  (persona_key, i) => ({
    role_id: `lobby-${i}`,
    display_name: ["沈青梧", "纪云汀", "阿岚", "何叙", "柳成荫"][i],
    public_bio: "今晚也围在桌边",
    persona_key,
    voice_id: `lobby-voice-${i}`,
  }),
);
