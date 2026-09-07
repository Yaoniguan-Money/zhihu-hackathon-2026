"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useGame } from "@/context/GameContext";
import ErrorPanel from "@/components/ui/ErrorPanel";
import Mascot from "@/components/ui/Mascot";
import { Icon } from "@/components/ui/Icons";
import GameTour from "@/components/onboarding/GameTour";
import {
  BOARD_LANES,
  BOARD_LINK_META,
} from "@/lib/distortions";
import { personaForRole } from "@/components/three/characters/personas";
import type { BoardLane, BoardLink, BoardPlacement, EvidenceFragmentPublic, RolePublic } from "@/contracts/public";

const LANE_META = Object.fromEntries(BOARD_LANES.map((l) => [l.id, l]));

export default function EvidencePage() {
  const {
    casePublic,
    sessionView,
    evidences,
    messages,
    allowedActions,
    phase,
    saveBoard,
    busyTurn,
    presentRecording,
    actionError,
    clearActionError,
    backToLobby,
  } = useGame();

  const boardRef = useRef<HTMLDivElement>(null);
  const [placements, setPlacements] = useState<BoardPlacement[]>([]);
  const [links, setLinks] = useState<BoardLink[]>([]);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confrontTarget, setConfrontTarget] = useState<string | null>(null); // evidence_id

  // 连线模式下 Esc 取消，避免玩家被卡在连线状态。
  useEffect(() => {
    if (!linkFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkFrom]);

  // 服务端板 → 本地编辑副本（CAS：保存需 expected_revision）
  const serverBoard = sessionView?.board;
  useEffect(() => {
    if (!serverBoard || dirty) return;
    // 草稿恢复：路由切换会重挂载本页并丢掉本地编辑，先找回未保存草稿。
    let draft: { placements: typeof placements; links: typeof links } | null = null;
    try {
      const raw = sessionStorage.getItem(`ecw.board.draft.${serverBoard.session_id}`);
      if (raw) draft = JSON.parse(raw);
    } catch {
      draft = null;
    }
    if (draft && (draft.placements.length > 0 || draft.links.length > 0)) {
      setPlacements(draft.placements);
      setLinks(draft.links);
      setDirty(true);
      return;
    }
    setPlacements(serverBoard.placements);
    setLinks(serverBoard.links);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBoard, dirty]);

  // 有未保存改动时写入草稿；保存成功时在 save() 内清除，避免恢复回环。
  const draftSessionId = serverBoard?.session_id;
  useEffect(() => {
    if (!draftSessionId || !dirty) return;
    try {
      sessionStorage.setItem(
        `ecw.board.draft.${draftSessionId}`,
        JSON.stringify({ placements, links }),
      );
    } catch {
      /* 隐私模式等场景下忽略 */
    }
  }, [placements, links, dirty, draftSessionId]);

  const placed = new Set(placements.map((p) => p.evidence_id));
  const pool = evidences.filter((e) => !placed.has(e.evidence_id));

  const roleById = useMemo(() => new Map((casePublic?.roles ?? []).map((r) => [r.role_id, r])), [casePublic]);
  const messageById = useMemo(
    () => new Map(messages.map((m) => [m.message_id, m])),
    [messages],
  );
  const evidenceById = useMemo(
    () => new Map(evidences.map((e) => [e.evidence_id, e])),
    [evidences],
  );

  if (!casePublic || !sessionView) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Mascot motion="computer" size={110} caption="正在铺开证据板…" />
        <Link href="/" className="btn btn-ghost text-sm">返回大厅</Link>
      </div>
    );
  }

  const canEdit = allowedActions.has("update_board") && !busyTurn;

  const addEvidence = (e: EvidenceFragmentPublic, lane: BoardLane = "source") => {
    setPlacements((prev) => {
      // 泳道内竖向排队放置，避免新芯片压住已有芯片。
      const inLane = prev.filter((p) => p.lane === lane).length;
      return [
        ...prev,
        {
          evidence_id: e.evidence_id,
          lane,
          x: 0.5,
          y: Math.min(0.9, 0.16 + inLane * 0.19),
        },
      ];
    });
    setDirty(true);
  };

  const movePlacement = (evidenceId: string, lane: BoardLane, x: number, y: number) => {
    setPlacements((prev) =>
      prev.map((p) => (p.evidence_id === evidenceId ? { ...p, lane, x, y } : p)),
    );
    setDirty(true);
  };

  const removePlacement = (evidenceId: string) => {
    setPlacements((prev) => prev.filter((p) => p.evidence_id !== evidenceId));
    setLinks((prev) => prev.filter((l) => l.from_evidence_id !== evidenceId && l.to_evidence_id !== evidenceId));
    setDirty(true);
  };

  const toggleLinkEnd = (evidenceId: string) => {
    if (!linkFrom) {
      setLinkFrom(evidenceId);
      return;
    }
    if (linkFrom === evidenceId) {
      setLinkFrom(null);
      return;
    }
    setLinkPending(linkFrom);
    setLinkTarget(evidenceId);
    setLinkFrom(null);
  };

  const commitLink = (relation: BoardLink["relation"]) => {
    if (!linkPending || !linkTarget) return;
    setLinks((prev) => [
      ...prev.filter(
        (l) =>
          !(
            (l.from_evidence_id === linkPending && l.to_evidence_id === linkTarget) ||
            (l.from_evidence_id === linkTarget && l.to_evidence_id === linkPending)
          ),
      ),
      {
        link_id: `link-${linkPending}-${linkTarget}`,
        from_evidence_id: linkPending,
        to_evidence_id: linkTarget,
        relation,
      },
    ]);
    setLinkPending(null);
    setLinkTarget(null);
    setDirty(true);
  };

  const save = () => {
    saveBoard(placements, links);
    if (draftSessionId) {
      try {
        sessionStorage.removeItem(`ecw.board.draft.${draftSessionId}`);
      } catch {
        /* ignore */
      }
    }
    setDirty(false);
  };

  // 连线端点：全局百分比坐标
  const endpoint = (evidenceId: string) => {
    const p = placements.find((x) => x.evidence_id === evidenceId);
    if (!p) return null;
    const laneIndex = BOARD_LANES.findIndex((l) => l.id === p.lane);
    return {
      x: ((laneIndex + 0.5) / BOARD_LANES.length + (p.x - 0.5) / BOARD_LANES.length) * 100,
      y: Math.max(6, Math.min(94, p.y * 100)),
    };
  };

  // conflicts_with 高亮：双方都放置且服务端声明冲突
  const conflictPairs: Array<[string, string]> = [];
  for (const p of placements) {
    const e = evidenceById.get(p.evidence_id);
    if (!e) continue;
    for (const c of e.conflicts_with) {
      if (placed.has(c) && !conflictPairs.some(([a, b]) => (a === c && b === p.evidence_id))) {
        conflictPairs.push([p.evidence_id, c]);
      }
    }
  }

  const confrontEvidence = confrontTarget ? evidenceById.get(confrontTarget) : null;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <GameTour tour="evidence" />
      {/* 工具栏 */}
      <div className="flex items-center gap-3 border-b border-paper/10 bg-night-deep/70 px-4 py-2.5">
        <h1 className="flex items-center gap-2 text-sm font-black text-paper">
          <Icon name="board" size={17} className="text-amber" /> 证据板
        </h1>
        <span className="text-[11px] text-paper/45">
          拖动证据入泳道 · 点「连线」再点两块证据建立关系 · 保存需整板提交
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`chip !text-[10px] ${dirty ? "!border-amber !text-amber" : "!border-paper/25 !text-paper/50"}`}>
            rev {serverBoard?.revision ?? 0}{dirty ? " · 未保存" : ""}
          </span>
          {linkFrom && <span className="chip !border-indigo-soft !text-indigo-soft">连线中：再点一块证据</span>}
          <motion.button whileTap={{ scale: 0.94 }} onClick={save} disabled={!canEdit || !dirty} className="btn btn-teal !px-4 !py-1.5 text-xs disabled:opacity-40" data-tour="ev-save">
            <Icon name="check" size={13} /> 保存证据板
          </motion.button>
          {allowedActions.has("accuse") && (
            <Link href="/game/accusation" className="btn btn-coral !px-4 !py-1.5 text-xs">
              <Icon name="bolt" size={13} filled /> 去指控
            </Link>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 证据池 */}
        <div className="flex w-60 shrink-0 flex-col border-r border-paper/10 bg-night-deep/50" data-tour="ev-pool">
          <div className="border-b border-paper/10 px-3 py-2 text-xs font-black text-paper/80">
            证据池 · {pool.length}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
            {pool.length === 0 && (
              <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-paper/40">
                {evidences.length === 0 ? (
                  <>
                    还没有解锁证据。<br />先去审讯盘问角色吧。
                  </>
                ) : (
                  <>
                    证据都已上板。<br />继续审讯解锁更多证据。
                  </>
                )}
              </p>
            )}
            {pool.map((e) => (
              <motion.button
                key={e.evidence_id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => canEdit && addEvidence(e, defaultLaneFor(e))}
                disabled={!canEdit}
                className="card w-full !rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5">
                  <LaneDot type={e.type} />
                  <p className="truncate text-[11px] font-black text-ink">{e.title}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink/60">{e.body}</p>
              </motion.button>
            ))}
          </div>
          {evidences.length === 0 && (
            <div className="p-3">
              <Link href="/game/interrogation" className="btn btn-ghost w-full text-xs">
                先去审讯收集证据
              </Link>
            </div>
          )}
        </div>

        {/* 板面：六泳道 */}
        <div className="relative min-w-0 flex-1 overflow-hidden p-3" data-tour="ev-board">
          <div ref={boardRef} className="relative h-full rounded-2xl border-2 border-paper/10 bg-[#221e40]/70">
            {/* 连线模式横幅：紧贴板面，指引下一步动作 */}
            {linkFrom && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2">
                <div className="card-dark !border-indigo-soft px-4 py-1.5 text-xs font-black text-paper shadow-[var(--shadow-sticker-sm)]">
                  连线中：再点目标证据的「连线」按钮完成关系，Esc 取消
                </div>
              </div>
            )}
            {/* 泳道背景 */}
            <div className="absolute inset-0 grid grid-cols-6">
              {BOARD_LANES.map((lane) => (
                <div key={lane.id} className="relative border-r border-dashed border-paper/10">
                  <div className="sticky top-0 z-[1] flex flex-col items-center gap-0.5 pt-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-black text-night" style={{ background: lane.color }}>
                      {lane.label}
                    </span>
                    <span className="text-[9px] font-bold text-paper/35">{lane.hint}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 关系连线 */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {links.map((l) => {
                const a = endpoint(l.from_evidence_id);
                const b = endpoint(l.to_evidence_id);
                if (!a || !b) return null;
                const meta = BOARD_LINK_META[l.relation];
                return (
                  <g key={l.link_id}>
                    <line x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`} stroke={meta.color} strokeWidth={2.5} strokeDasharray={l.relation === "contradicts" ? "6 4" : undefined} />
                    <text x={`${(a.x + b.x) / 2}%`} y={`${(a.y + b.y) / 2}%`} fill={meta.color} fontSize={10} fontWeight={900} textAnchor="middle" stroke="#191631" strokeWidth={3} paintOrder="stroke">
                      {meta.label}
                    </text>
                  </g>
                );
              })}
              {conflictPairs.map(([aId, bId], i) => {
                const a = endpoint(aId);
                const b = endpoint(bId);
                if (!a || !b) return null;
                return (
                  <line key={`conflict-${i}`} x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`} stroke="#ff5a5a" strokeWidth={2} strokeDasharray="3 5" opacity={0.8} />
                );
              })}
            </svg>

            {/* 已放置证据 */}
            {placements.map((p) => {
              const e = evidenceById.get(p.evidence_id);
              if (!e) return null;
              const laneIndex = BOARD_LANES.findIndex((l) => l.id === p.lane);
              const left = ((laneIndex + p.x) / BOARD_LANES.length) * 100;
              const top = Math.max(8, Math.min(92, p.y * 100));
              const isLinkSource = linkFrom === e.evidence_id;
              return (
                <BoardChip
                  key={p.evidence_id}
                  evidence={e}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  laneIndex={laneIndex}
                  canEdit={canEdit}
                  highlighted={isLinkSource}
                  onRemove={() => removePlacement(p.evidence_id)}
                  onMove={(lane, x, y) => movePlacement(p.evidence_id, lane, x, y)}
                  onLinkStart={() => canEdit && toggleLinkEnd(p.evidence_id)}
                  onConfront={
                    e.type === "quote" && e.source_message_id != null && allowedActions.has("present_recording") && !busyTurn
                      ? () => setConfrontTarget(e.evidence_id)
                      : undefined
                  }
                />
              );
            })}

            {placements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-xl border-2 border-dashed border-paper/20 px-6 py-4 text-sm font-bold text-paper/40">
                  点击左侧证据，把它放上证据板
                </p>
              </div>
            )}
          </div>

          {/* 板级错误 */}
          <AnimatePresence>
            {actionError && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-4 left-1/2 w-[440px] max-w-[92vw] -translate-x-1/2">
                <ErrorPanel
                  error={actionError}
                  onDismiss={clearActionError}
                  onRetry={() => {
                    clearActionError();
                    if (serverBoard) {
                      setPlacements(serverBoard.placements);
                      setLinks(serverBoard.links);
                      setDirty(false);
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 对质目标选择 */}
      <AnimatePresence>
        {confrontEvidence && confrontEvidence.source_message_id && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-night-deep/70 p-4"
            onClick={() => setConfrontTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="card w-[480px] max-w-[94vw] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-coral-deep">Confrontation</p>
              <h3 className="mt-1 text-lg font-black text-ink">把录音递给谁对质？</h3>
              <p className="mt-1 line-clamp-2 rounded-lg bg-paper-dim px-3 py-2 text-xs text-ink/70">
                「{confrontEvidence.title}」：{confrontEvidence.body.slice(0, 60)}…
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {casePublic.roles
                  .filter((r) => {
                    const src = messageById.get(confrontEvidence.source_message_id!);
                    return src?.speaker_type === "role" ? src.speaker_id !== r.role_id : true;
                  })
                  .map((role: RolePublic) => (
                    <button
                      key={role.role_id}
                      onClick={() => {
                        presentRecording(confrontEvidence.evidence_id, role.role_id);
                        setConfrontTarget(null);
                      }}
                      className="flex items-center gap-2 rounded-xl border-2 border-ink bg-paper px-3 py-2 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <span className="h-3 w-3 rounded-full border border-ink/60" style={{ background: personaForRole(role).outfit }} />
                      <span className="truncate text-xs font-black text-ink">{role.display_name}</span>
                    </button>
                  ))}
              </div>
              <button onClick={() => setConfrontTarget(null)} className="btn btn-ghost mt-4 w-full text-xs">
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 关系选择 */}
      <AnimatePresence>
        {linkPending && linkTarget && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2"
          >
            <div className="card flex flex-wrap items-center gap-1.5 p-3">
              <span className="mr-1 text-xs font-black text-ink">两条证据的关系：</span>
              {Object.entries(BOARD_LINK_META).map(([rel, meta]) => (
                <button
                  key={rel}
                  onClick={() => commitLink(rel as BoardLink["relation"])}
                  className="chip cursor-pointer text-[11px] hover:brightness-95"
                  style={{ background: `${meta.color}33`, borderColor: meta.color }}
                >
                  {meta.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setLinkPending(null);
                  setLinkTarget(null);
                }}
                className="chip chip-dark cursor-pointer !bg-ink !text-paper"
              >
                取消
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "failed" && sessionView.terminal_error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-night-deep/85">
          <ErrorPanel error={sessionView.terminal_error} />
          <button onClick={backToLobby} className="btn btn-amber">回大厅</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LaneDot({ type }: { type: EvidenceFragmentPublic["type"] }) {
  const color: Record<string, string> = {
    quote: "#e4685d",
    claim: "#2ea79b",
    source: "#f2b04c",
    timeline: "#8f9bff",
    contradiction: "#c2557a",
  };
  return <span className="h-2 w-2 shrink-0 rounded-full border border-ink/60" style={{ background: color[type] ?? "#999" }} />;
}

function defaultLaneFor(e: EvidenceFragmentPublic): BoardLane {
  switch (e.type) {
    case "quote":
      return "retelling";
    case "source":
      return "source";
    case "timeline":
      return "timeline";
    case "contradiction":
      return "causal";
    default:
      return "source";
  }
}

function BoardChip({
  evidence,
  style,
  laneIndex,
  canEdit,
  highlighted,
  onRemove,
  onMove,
  onLinkStart,
  onConfront,
}: {
  evidence: EvidenceFragmentPublic;
  style: React.CSSProperties;
  laneIndex: number;
  canEdit: boolean;
  highlighted: boolean;
  onRemove: () => void;
  onMove: (lane: BoardLane, x: number, y: number) => void;
  onLinkStart: () => void;
  onConfront?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canEdit) return;
    ref.current?.setPointerCapture?.(e.pointerId);
    const el = ref.current;
    if (!el) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: parseFloat(el.style.left) || 0,
      baseTop: parseFloat(el.style.top) || 0,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const boardEl = ref.current.parentElement as HTMLElement | null;
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    const laneW = rect.width / 6;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    const leftPx = (drag.current.baseLeft / 100) * rect.width + dx;
    const topPct = Math.max(6, Math.min(94, drag.current.baseTop + (dy / rect.height) * 100));
    const laneFloat = leftPx / laneW - 0.5;
    const newLaneIndex = Math.max(0, Math.min(5, Math.round(laneFloat)));
    const x = Math.max(0.12, Math.min(0.88, laneFloat - newLaneIndex + 0.5));
    ref.current.style.left = `${((newLaneIndex + x) / 6) * 100}%`;
    ref.current.style.top = `${topPct}%`;
    ref.current.dataset.laneIndex = String(newLaneIndex);
    ref.current.dataset.x = String(x);
    ref.current.dataset.y = String(topPct / 100);
  };

  const onPointerUp = () => {
    if (!drag.current || !ref.current) {
      setDragging(false);
      return;
    }
    const ds = ref.current.dataset;
    if (ds.laneIndex !== undefined && ds.x !== undefined && ds.y !== undefined) {
      onMove(BOARD_LANES[Number(ds.laneIndex)].id, Number(ds.x), Number(ds.y));
    }
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={ref}
      style={{ ...style, transform: "translate(-50%, -50%)", position: "absolute", zIndex: dragging ? 30 : 10 }}
      data-lane-index={laneIndex}
      className="w-[15.5%] min-w-[150px]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: dragging ? 1.06 : 1, rotate: dragging ? -2 : 0 }}
        className={`cursor-grab rounded-xl border-2 border-ink bg-paper p-2 shadow-[var(--shadow-sticker-sm)] active:cursor-grabbing ${highlighted ? "ring-4 ring-indigo-soft/70" : ""}`}
      >
        <div className="flex items-start gap-1.5">
          <LaneDot type={evidence.type} />
          <p className="min-w-0 flex-1 truncate text-[11px] font-black text-ink">{evidence.title}</p>
          {canEdit && (
            <span className="flex shrink-0 gap-1">
              <button onClick={onLinkStart} title="连线" className="text-ink/40 hover:text-indigo-soft">
                <Icon name="link" size={12} />
              </button>
              {onConfront && (
                <button onClick={onConfront} title="递给角色对质" className="text-ink/40 hover:text-coral">
                  <Icon name="bolt" size={12} />
                </button>
              )}
              <button onClick={onRemove} title="移回证据池" className="text-ink/40 hover:text-coral">
                ✕
              </button>
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-ink/65">{evidence.body}</p>
      </motion.div>
    </div>
  );
}
