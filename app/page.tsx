"use client";

import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
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
import GameTour, { requestTour } from "@/components/onboarding/GameTour";

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

/**
 * 建案输入净化：玩家常直接粘贴 markdown 源码，装饰性标记会让 claim 抽取的
 * source span 与段落错位（曾触发 SOURCE_SPAN_INVALID）。提交前只删装饰、不改文字。
 */
function stripMarkdownDecorations(text: string): string {
  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return "";
    return line.replace(/^(\s{0,3}#{1,6}\s+)/, "");
  });
  let out = lines.join("\n");
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/`([^`\n]+)`/g, "$1");
  return out;
}

/** 自定义建案：URL + 完整正文 + 邀请码 → durable 编译 → 进度观察。 */
function CustomCaseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectCase } = useGame();
  const createFromSource = useAction(api.cases.createFromSource);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [invite, setInvite] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<CaseCompilationStatusPublic["error"] | { code: string; message: string } | null>(null);

  // 知乎支线（热榜/搜索）带链接跳回：预填来源 URL 并展开表单。
  useEffect(() => {
    const prefill = searchParams.get("prefill_url");
    if (prefill) {
      setUrl(prefill);
      setOpen(true);
    }
  }, [searchParams]);

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
        source_text: stripMarkdownDecorations(text),
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
    <div className="card-dark overflow-hidden" data-tour="lobby-bring">
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
  const [howtoOpen, setHowtoOpen] = useState(false);

  /** 我的作品架：当前身份自己编译的案件（见 cases.listMine）。 */
  function MyCases({ onStart }: { onStart: (caseId: string) => void }) {
    const mine = useQuery(api.cases.listMine);
    if (!mine || mine.length === 0) return null;
    return (
      <div className="mt-1">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-paper/60">
          <Icon name="board" size={12} className="text-amber" /> 我的案件 · 自己带来的文章
        </p>
        {mine.map((c) => (
          <button
            key={c.case_id}
            onClick={() => onStart(c.case_id)}
            className="card mt-2 w-full p-3 text-left transition-transform hover:-translate-y-0.5"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-coral-deep">{c.theme}</p>
            <h3 className="mt-0.5 line-clamp-1 text-sm font-black text-ink">{c.title}</h3>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-ink/55">{c.summary}</p>
          </button>
        ))}
      </div>
    );
  }
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
        {/* ① 开始一局：案件目录 */}
        <div className="flex items-center justify-between" data-tour="lobby-catalog">
          <h2 className="text-lg font-black text-paper">
            <Icon name="mask" size={20} className="mr-2 inline text-amber" />
            ① 开始一局
          </h2>
          <div className="flex items-center gap-2">
            {!booted && <span className="text-xs text-paper/50">建立身份中…</span>}
            <button
              onClick={() => requestTour("lobby")}
              title="新手指引"
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper/25 text-xs font-black text-paper/60 transition-colors hover:border-amber hover:text-amber"
            >
              ?
            </button>
          </div>
        </div>
        <p className="-mt-2 text-[11px] leading-relaxed text-paper/45">
          从档案室挑一件案件，点击即可进入案情简报并开庭。
        </p>

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

        {/* 我的案件：自己带文章编译的案件（错过提交页自动跳转后仍可找回） */}
        <MyCases onStart={start} />

        {/* ② 带一篇知乎文章来：正式建案（Suspense 包裹 useSearchParams） */}
        <SectionLabel index="②" icon="link" title="带一篇知乎文章来" />
        <Suspense fallback={null}>
          <CustomCaseForm />
        </Suspense>

        {/* ③ 从知乎找选题：热榜 / 搜索 */}
        <SectionLabel index="③" icon="magnifier" title="从知乎找选题" />
        <p className="-mt-2 text-[11px] leading-relaxed text-paper/45">
          先用热榜、搜索物色题材；正式开局仍回到 ②，粘贴文章完整正文与邀请码。
        </p>
        <div className="grid grid-cols-2 gap-3" data-tour="lobby-zhihu">
          <a href="/zhihu/hot" className="card-dark flex flex-col items-center gap-1 p-4 text-center transition-colors hover:border-amber/40">
            <Icon name="bolt" size={22} className="text-amber" />
            <span className="text-xs font-black text-paper">今日热案</span>
            <span className="text-[10px] text-paper/50">知乎热榜找题材</span>
          </a>
          <a href="/zhihu/search" className="card-dark flex flex-col items-center gap-1 p-4 text-center transition-colors hover:border-amber/40">
            <Icon name="magnifier" size={22} className="text-amber" />
            <span className="text-xs font-black text-paper">知乎搜索</span>
            <span className="text-[10px] text-paper/50">搜文章与答主</span>
          </a>
        </div>

        {/* ④ 我的战绩：成绩卡 */}
        <SectionLabel index="④" icon="scale" title="我的战绩" />
        <a href="/zhihu/score-card" className="card-dark -mt-2 flex items-center gap-3 p-4 text-left transition-colors hover:border-amber/40" data-tour="lobby-score">
          <Icon name="pin" size={22} className="text-amber" />
          <div className="flex-1">
            <span className="block text-xs font-black text-paper">辨别力战绩卡</span>
            <span className="block text-[10px] text-paper/50">对局结束后生成成绩 · 分享到知乎</span>
          </div>
          <Icon name="next" size={14} className="text-paper/40" />
        </a>

        {/* 玩法说明：默认折叠 */}
        <button
          onClick={() => setHowtoOpen((o) => !o)}
          className="card-dark flex items-center gap-2 px-4 py-3 text-left transition-colors hover:border-amber/40"
        >
          <Icon name="quote" size={16} className="text-amber" />
          <span className="flex-1 text-xs font-black text-paper">玩法 · 90 秒看懂</span>
          <motion.span animate={{ rotate: howtoOpen ? 90 : 0 }} className="text-paper/50">
            <Icon name="next" size={14} />
          </motion.span>
        </button>
        <AnimatePresence>
          {howtoOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="-mt-1 overflow-hidden"
            >
              <div className="card-dark p-4 text-xs leading-relaxed text-paper/60">
                <p>① 五个 AI 角色围绕圆桌各自开场，只有一人篡改了原文。</p>
                <p>② 温和/直接/施压三种问法审讯，把发言存成录音证据对质。</p>
                <p>③ 在证据板上拼出「来源事实 → 角色转述 → 被改变的关系」。</p>
                <p>④ 提交指控：篡改者 + 篡改方式 + 证据链。</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {actionError && <ErrorPanel error={actionError} onDismiss={clearActionError} />}

        {/* 新手指引（首次自动弹出，「?」重看） */}
        <GameTour tour="lobby" enabled={booted} />
      </div>

      <footer className="absolute bottom-3 left-4 z-10 text-xs font-bold text-paper/40">
        知乎黑客松 2026 · 跨次元游乐场赛道
      </footer>
    </main>
  );
}

/** 右栏小节标题：编号 + 图标 + 标题 + 延伸线，统一动线语言。 */
function SectionLabel({
  index,
  icon,
  title,
}: {
  index: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber/20 text-[10px] font-black text-amber">
        {index}
      </span>
      <span className="text-xs font-black uppercase tracking-widest text-paper/70">
        <Icon name={icon} size={13} className="mr-1 inline text-amber/80" />
        {title}
      </span>
      <span className="h-px flex-1 bg-paper/10" />
    </div>
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
