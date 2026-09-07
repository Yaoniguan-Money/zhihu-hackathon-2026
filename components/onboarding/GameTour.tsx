"use client";

/**
 * 分步聚光灯新手指引（纯前端，B 侧）。
 * - 首次到达页面自动弹出一次（localStorage `ecw.tour.<id>` 记忆），导航「?」可随时重看。
 * - 聚光灯：目标元素定位高亮框 + 巨大 box-shadow 遮罩；目标不存在时降级为居中说明卡。
 * - localStorage 只存「已看过」标记，不含任何对局数据。
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Icon } from "@/components/ui/Icons";

export type TourStep = {
  /** 目标元素的 data-tour 属性值；找不到时降级为居中卡。 */
  target: string;
  title: string;
  body: string;
};

const TOURS: Record<string, TourStep[]> = {
  lobby: [
    { target: "lobby-catalog", title: "① 开始一局", body: "档案室里的每件案件都已由 AI 编译完成。点案件卡直接进入案情简报并开庭。" },
    { target: "lobby-bring", title: "② 带一篇知乎文章来", body: "粘贴知乎链接 + 完整正文 + 邀请码，AI 会把这篇文章编译成一局五角色对局（需要等待编译）。" },
    { target: "lobby-zhihu", title: "③ 从知乎找选题", body: "热榜和搜索帮你物色题材。找到后回到 ②，粘贴文章的完整正文正式开局。" },
    { target: "lobby-score", title: "④ 我的战绩", body: "对局结束后这里能生成你的辨别力战绩卡，复制文案分享到知乎。" },
  ],
  briefing: [
    { target: "briefing-file", title: "案情简报", body: "这是案件档案：来源文章、五名角色和他们的人设。五人中有一位会在陈述里悄悄篡改原文。" },
    { target: "briefing-start", title: "开庭", body: "点「开庭」，AI 会依次呈上五条开场陈述——仔细听，记住每个人的说法。" },
  ],
  interrogation: [
    { target: "int-role", title: "选角色和问法", body: "先点要审讯的角色，再选问法：温和、直接、施压——问法会影响角色的态度和回答。" },
    { target: "int-input", title: "提问", body: "键盘输入或点麦克风语音提问，然后点「发问」。角色只会发布被服务器校验过的发言。" },
    { target: "int-log", title: "审讯记录", body: "每条回答都带情绪与立场徽章。对有用的发言点「存为录音证据」，之后可以递给其他角色对质。" },
  ],
  evidence: [
    { target: "ev-pool", title: "证据池", body: "审讯中解锁的证据都在这里。点一下即可放上证物板。" },
    { target: "ev-board", title: "六泳道证据板", body: "拖动证据到对应泳道（来源/转述/时间/范围/因果/条件），自由摆放；点「连线」再点两块证据建立关系，冲突会自动标红。" },
    { target: "ev-save", title: "保存证据板", body: "整板保存后才能提交指控。发现矛盾时，把录音证据递给其他角色对质。" },
  ],
  accusation: [
    { target: "acc-role", title: "① 指认篡改者", body: "从五名角色中选出一人——你认定是谁改变了事实。" },
    { target: "acc-distort", title: "② 篡改方式", body: "勾选你识破的手法（可多选）：扩大范围、删除条件、因果偷换、断章取义……" },
    { target: "acc-evidence", title: "③ 支撑证据", body: "勾选支持指控的证据链，至少一件。证据越准，证据分越高。" },
    { target: "acc-submit", title: "提交指控", body: "提交后由合议庭判决，不可撤回。揭晓会展示「原文 → 篡改」的逐条对照。" },
  ],
  reveal: [
    { target: "rev-links", title: "被改变的关系", body: "逐条对照原文事实与被篡改后的说法，看清对方动了什么手脚。" },
    { target: "rev-chain", title: "完整真相链", body: "从来源到篡改的完整事实链，按顺序步进呈现。" },
    { target: "rev-score", title: "双维评分", body: "证据分衡量你引用证据的准确度，审讯分衡量追问的覆盖与深度。" },
    { target: "rev-actions", title: "生成战绩卡", body: "对局结果会生成可分享的辨别力战绩卡——去知乎秀出你的侦查成绩。" },
  ],
};

export type TourId = keyof typeof TOURS;

const EVENT_NAME = "ecw:tour-start";

/** 「?」帮助按钮调用：请求当前页重新播放指引。 */
export function requestTour(tour: TourId) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: tour }));
  }
}

type Rect = { top: number; left: number; width: number; height: number };
type CardPos = { left: number; top: number } | { left: number; bottom: number };

const PAD = 8;
const CARD_W = 300;

export default function GameTour({
  tour,
  enabled = true,
}: {
  tour: TourId;
  /** 仅在页面主内容就绪时允许自动弹出（手动「?」始终可用）。 */
  enabled?: boolean;
}) {
  const steps = TOURS[tour] ?? [];
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<CardPos | null>(null);
  const [center, setCenter] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const storageKey = `ecw.tour.${tour}`;
  const step = steps[index];

  // portal 挂到 body：逃开含 backdrop-blur / transform 的祖先（它们会把 fixed 变成相对自身定位）。
  useEffect(() => setPortalMounted(true), []);

  const measure = useCallback(
    (scrollToTarget: boolean) => {
      if (!step || typeof window === "undefined") return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        setCenter(true);
        setRect(null);
        setPos({ left: Math.max(16, (vw - CARD_W) / 2), top: Math.round(vh * 0.38) });
        return;
      }
      // 只在换步时把目标滚进视野；滚动/resize 引发的重测绝不重新锚定，
      // 否则 scrollIntoView → scroll 事件 → 再 scrollIntoView 会与用户滚动形成死锁。
      if (scrollToTarget) {
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
      const r = el.getBoundingClientRect();
      const below = r.bottom + PAD + 12 + 190 < vh;
      const left = Math.min(Math.max(16, r.left), Math.max(16, vw - CARD_W - 16));
      setCenter(false);
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setPos(
        below
          ? { left, top: Math.max(12, r.bottom + PAD + 12) }
          : // 说明卡贴在目标上方时，夹在视口内，避免被算到屏幕外看不见。
            { left, bottom: Math.max(12, Math.min(vh - r.top - PAD - 12, vh - 170)) },
      );
    },
    [step],
  );

  const finish = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(storageKey, "seen");
    } catch {
      /* 隐私模式等场景下忽略 */
    }
  }, [storageKey]);

  // 首次自动弹出（只弹一次）+「?」重放事件。
  useEffect(() => {
    if (steps.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (enabled && !localStorage.getItem(storageKey)) {
        timer = setTimeout(() => {
          setIndex(0);
          setActive(true);
        }, 700);
      }
    } catch {
      /* ignore */
    }
    const onStart = (e: Event) => {
      if ((e as CustomEvent).detail === tour) {
        setIndex(0);
        setActive(true);
      }
    };
    window.addEventListener(EVENT_NAME, onStart);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(EVENT_NAME, onStart);
    };
  }, [tour, enabled, storageKey, steps.length]);

  // 打开/换步时：滚动定位目标并测量（双次兜底布局与滚动动画）。
  useEffect(() => {
    if (!active) return;
    const t1 = setTimeout(() => measure(true), 60);
    const t2 = setTimeout(() => measure(true), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, index, measure]);

  // 窗口/容器滚动变化时只重测位置，绝不重新锚定滚动。
  useEffect(() => {
    if (!active) return;
    const onScrollOrResize = () => measure(false);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [active, measure]);

  // Esc 退出。
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!portalMounted || !active || !step || !pos) return null;

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cardStyle: React.CSSProperties = { position: "fixed", width: CARD_W, ...pos };

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="新手指引">
      {/* 聚光灯：高亮框 + 巨大投影遮罩；降级时用全屏遮罩 */}
      {center || !rect ? (
        <div className="absolute inset-0 bg-night-deep/70" onClick={finish} />
      ) : (
        <div
          className="absolute rounded-2xl border-2 border-amber"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(12,10,20,0.74)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* 说明卡 */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={cardStyle}
        className="card-dark p-4"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber/20 text-[11px] font-black text-amber">
            {index + 1}
          </span>
          <p className="flex-1 text-sm font-black text-paper">
            <Icon name="mask" size={14} className="mr-1 inline text-amber" />
            {step.title}
          </p>
          <span className="text-[10px] font-bold text-paper/40">
            {index + 1} / {steps.length}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-paper/70">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={finish} className="text-[11px] font-bold text-paper/40 transition-colors hover:text-paper/70">
            跳过指引
          </button>
          <div className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="btn btn-ghost !px-3 !py-1 text-xs"
              >
                <Icon name="back" size={13} /> 上一步
              </button>
            )}
            <button
              onClick={() => (index + 1 < steps.length ? setIndex((i) => i + 1) : finish())}
              className="btn btn-amber !px-3 !py-1 text-xs"
            >
              {index + 1 < steps.length ? (
                <>
                  下一步 <Icon name="next" size={13} />
                </>
              ) : (
                <>
                  <Icon name="check" size={13} /> 开始
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
