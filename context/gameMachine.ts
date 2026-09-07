"use client";

import { assign, fromCallback, fromPromise, setup } from "xstate";
import { api } from "../convex/_generated/api";
import { convexClient, newClientActionId } from "@/lib/convex-client";
import { toPublicError } from "@/lib/convex-errors";
import type {
  BoardLink,
  BoardPlacement,
  BoardState,
  CaseCatalogItemPublic,
  CasePublic,
  FinalAccusation,
  GameEventPublic,
  MessagePublic,
  PublicError,
  PublicRoleTurn,
  QuestionMode,
  QuestionSource,
  RevealResult,
  SessionPhase,
  SessionView,
  SourceDocumentPublic,
  EvidenceFragmentPublic,
} from "@/contracts/public";
import type { RoleId } from "@/contracts/shared";

/**
 * B 端游戏状态机：只镜像服务端 SessionView 与公开事件（ENGINEERING_SPEC §8）。
 * 权限一律读 sessionView.allowed_actions；本机不自造任何阶段判断规则。
 */

export const SESSION_STORAGE_KEY = "ecw.session_id";

export interface Notif {
  id: string;
  kind: "evidence" | "error" | "info" | "success";
  title: string;
  body?: string;
  errorCode?: PublicError["code"];
}

export interface GameContextData {
  sessionId: string | null;
  catalog: CaseCatalogItemPublic[];
  casePublic: CasePublic | null;
  sourceDoc: SourceDocumentPublic | null;
  sessionView: SessionView | null;
  messages: MessagePublic[];
  evidences: EvidenceFragmentPublic[];
  reveal: RevealResult | null;
  thinking: { requestId: string; roleId: RoleId } | null;
  turnBusy: boolean;
  notifs: Notif[];
  catalogError: PublicError | null;
  actionError: PublicError | null;
}

export type GameEventInput =
  | { type: "AUTH_READY" }
  | { type: "RETRY_CATALOG" }
  | { type: "SELECT_CASE"; caseId: string }
  | { type: "START_GAME" }
  | { type: "SNAPSHOT"; view?: SessionView; messages?: MessagePublic[]; evidences?: EvidenceFragmentPublic[] }
  | { type: "EVENTS"; events: GameEventPublic[]; messages?: MessagePublic[]; evidences?: EvidenceFragmentPublic[] }
  | { type: "ASK"; roleId: RoleId; mode: QuestionMode; text: string; source: QuestionSource }
  | { type: "SAVE_RECORDING"; messageId: string }
  | { type: "PRESENT_RECORDING"; evidenceId: string; targetRoleId: RoleId }
  | { type: "BOARD_SAVE"; placements: BoardPlacement[]; links: BoardLink[] }
  | { type: "ACCUSE"; accusation: FinalAccusation }
  | { type: "DISMISS_NOTIF"; id: string }
  | { type: "CLEAR_ACTION_ERROR" }
  | { type: "BACK_TO_LOBBY" };

interface MachineInput {
  storedSessionId: string | null;
}

interface AskFlowInput {
  kind: "ask" | "present";
  sessionId: string;
  args: Record<string, unknown>;
}

interface AskFlowOutput {
  turn: PublicRoleTurn;
  messages: MessagePublic[];
  evidences: EvidenceFragmentPublic[];
}

const emptyContext: GameContextData = {
  sessionId: null,
  catalog: [],
  casePublic: null,
  sourceDoc: null,
  sessionView: null,
  messages: [],
  evidences: [],
  reveal: null,
  thinking: null,
  turnBusy: false,
  notifs: [],
  catalogError: null,
  actionError: null,
};

// ---------------------------------------------------------------------------
// Convex 访问辅助（全部显式失败，不重试不兜底）

async function fetchCaseDocs(caseId: string) {
  const [casePublic, sourceDoc] = await Promise.all([
    convexClient.query(api.cases.getPublic, { case_id: caseId }),
    convexClient.query(api.cases.getSource, { case_id: caseId }),
  ]);
  return casePublic ? { casePublic, sourceDoc } : null;
}

async function fetchSnapshot(sessionId: string) {
  const [messages, evidences] = await Promise.all([
    convexClient.query(api.messages.listPublic, { session_id: sessionId }),
    convexClient.query(api.evidence.getAll, { session_id: sessionId }),
  ]);
  return { messages, evidences };
}

function notif(
  kind: Notif["kind"],
  title: string,
  body?: string,
  errorCode?: PublicError["code"],
): Notif {
  return { id: newClientActionId(), kind, title, body, errorCode };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** ask / presentRecording 共用的回合提交 + 观察循环：直到 Ticket 终态。 */
async function runRoleTurn(
  kind: "ask" | "present",
  args: Record<string, unknown>,
  sessionId: string,
): Promise<AskFlowOutput> {
  const receipt =
    kind === "ask"
      ? await convexClient.action(api.roleTurns.ask, args as never)
      : await convexClient.action(api.roleTurns.presentRecording, args as never);
  const requestId = (receipt as { request_id: string }).request_id;

  // 观察上限 3 分钟；超时按显式失败呈现（服务端 lease 会给出终态，不自动重试）。
  const deadline = Date.now() + 180_000;
  let turn: PublicRoleTurn | null = null;
  while (Date.now() < deadline) {
    await sleep(1200);
    turn = await convexClient.query(api.roleTurns.observe, { request_id: requestId });
    if (turn && (turn.status === "succeeded" || turn.status === "failed")) break;
  }
  if (!turn || (turn.status !== "succeeded" && turn.status !== "failed")) {
    throw { code: "SERVICE_UNAVAILABLE", message: "回应观察超时，请稍后重试" };
  }
  const snapshot = await fetchSnapshot(sessionId);
  return { turn, ...snapshot };
}

// ---------------------------------------------------------------------------
// Actors

const catalogLoader = fromPromise(async () => {
  return convexClient.query(api.cases.listPublic, {});
});

const createSessionLoader = fromPromise(async ({ input }: { input: { caseId: string } }) => {
  const view = await convexClient.mutation(api.sessions.create, {
    case_id: input.caseId,
    client_action_id: newClientActionId(),
  });
  const caseDocs = await fetchCaseDocs(view.case_id);
  return { view, caseDocs };
});

const startGameLoader = fromPromise(async ({ input }: { input: { sessionId: string } }) => {
  const result = await convexClient.mutation(api.game.start, {
    session_id: input.sessionId,
    client_action_id: newClientActionId(),
  });
  const view = await convexClient.query(api.sessions.getPublic, { session_id: input.sessionId });
  return { result, view };
});

const restoreLoader = fromPromise(async ({ input }: { input: { sessionId: string } }) => {
  const view = await convexClient.query(api.sessions.getPublic, { session_id: input.sessionId });
  if (!view) return null;
  const [caseDocs, snapshot] = await Promise.all([
    fetchCaseDocs(view.case_id),
    fetchSnapshot(input.sessionId),
  ]);
  return { view, caseDocs, ...snapshot };
});

const roleTurnLoader = fromPromise(async ({ input }: { input: AskFlowInput }) =>
  runRoleTurn(input.kind, input.args, input.sessionId),
);

const saveRecordingLoader = fromPromise(async ({ input }: { input: { sessionId: string; messageId: string } }) => {
  const evidence = await convexClient.mutation(api.evidence.saveRecording, {
    session_id: input.sessionId,
    message_id: input.messageId,
    client_action_id: newClientActionId(),
  });
  const evidences = await convexClient.query(api.evidence.getAll, { session_id: input.sessionId });
  return { evidence, evidences };
});

const boardSaver = fromPromise(async ({ input }: { input: { sessionId: string; placements: BoardPlacement[]; links: BoardLink[]; expectedRevision: number } }) => {
  const board: BoardState = await convexClient.action(api.evidence.updateBoard, {
    session_id: input.sessionId,
    placements: input.placements,
    links: input.links,
    expected_revision: input.expectedRevision,
    client_action_id: newClientActionId(),
  });
  return board;
});

const accuser = fromPromise(async ({ input }: { input: { sessionId: string; accusation: FinalAccusation } }) => {
  const result = await convexClient.action(api.game.accuse, {
    session_id: input.sessionId,
    suspect_role_id: input.accusation.suspect_role_id,
    distortion_types: input.accusation.distortion_types,
    evidence_ids: input.accusation.evidence_ids,
    note: input.accusation.note,
    client_action_id: newClientActionId(),
  });
  const view = await convexClient.query(api.sessions.getPublic, { session_id: input.sessionId });
  return { result, view };
});

const revealLoader = fromPromise(async ({ input }: { input: { sessionId: string } }) => {
  const reveal = await convexClient.query(api.game.getReveal, { session_id: input.sessionId });
  return reveal;
});

const sessionPoller = fromCallback<{ type: "SNAPSHOT"; view: SessionView }, { sessionId: string }>(
  ({ sendBack, input }) => {
    let stopped = false;
    const tick = async () => {
      try {
        const view = await convexClient.query(api.sessions.getPublic, { session_id: input.sessionId });
        if (!stopped && view) sendBack({ type: "SNAPSHOT", view });
      } catch {
        // 网络抖动：不伪造状态，等下一个周期。
      }
    };
    const id = setInterval(tick, 2500);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  },
);

const eventsWatcher = fromCallback<
  { type: "EVENTS"; events: GameEventPublic[]; messages?: MessagePublic[]; evidences?: EvidenceFragmentPublic[] },
  { sessionId: string; lastSeq: number }
>(({ sendBack, input }) => {
  let stopped = false;
  let lastSeq = input.lastSeq;
  const tick = async () => {
    try {
      const events = await convexClient.query(api.events.listPublic, {
        session_id: input.sessionId,
        after_sequence: lastSeq,
      });
      if (stopped || events.length === 0) return;
      lastSeq = events[events.length - 1].sequence;
      const snapshot = await fetchSnapshot(input.sessionId);
      if (!stopped) sendBack({ type: "EVENTS", events, ...snapshot });
    } catch {
      // 轮询失败不产生假成功。
    }
  };
  const id = setInterval(tick, 1800);
  void tick();
  return () => {
    stopped = true;
    clearInterval(id);
  };
});

// ---------------------------------------------------------------------------
// Helpers

function phaseIs(phase: SessionPhase) {
  return ({ context }: { context: GameContextData }) => context.sessionView?.phase === phase;
}

function pushNotif(notifs: Notif[], entry: Notif): Notif[] {
  return [...notifs, entry].slice(-4);
}

// ---------------------------------------------------------------------------
// Machine

export const gameMachine = setup({
  types: {
    context: {} as GameContextData,
    events: {} as GameEventInput,
    input: {} as MachineInput,
  },
  actors: {
    catalogLoader,
    createSessionLoader,
    startGameLoader,
    restoreLoader,
    roleTurnLoader,
    saveRecordingLoader,
    boardSaver,
    accuser,
    revealLoader,
    sessionPoller,
    eventsWatcher,
  },
  guards: {
    phaseBriefing: phaseIs("briefing"),
    phaseOpening: phaseIs("opening_statements"),
    phaseInvestigation: phaseIs("investigation"),
    phaseJudging: phaseIs("judging"),
    phaseRevealed: phaseIs("revealed"),
    phaseFailed: phaseIs("failed"),
  },
  actions: {
    persistSession: ({ context }) => {
      if (context.sessionId && typeof localStorage !== "undefined") {
        localStorage.setItem(SESSION_STORAGE_KEY, context.sessionId);
      }
    },
    clearPersisted: () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    },
    clearSessionData: assign(() => ({ ...emptyContext })),
  },
}).createMachine({
  id: "game",
  context: ({ input }) => ({ ...emptyContext, sessionId: input.storedSessionId }),
  initial: "authWait",
  on: {
    DISMISS_NOTIF: {
      actions: assign({
        notifs: ({ context, event }) => context.notifs.filter((n) => n.id !== event.id),
      }),
    },
    RETRY_CATALOG: { target: "#game.lobby.loadingCatalog" },
    SELECT_CASE: {
      target: "#game.creating",
      actions: assign({ sessionId: null, casePublic: null, sourceDoc: null, reveal: null }),
    },
  },
  states: {
    authWait: {
      on: {
        AUTH_READY: [
          { target: "restoring", guard: ({ context }) => Boolean(context.sessionId) },
          { target: "lobby" },
        ],
      },
    },

    // ------------------------------------------------------------------ lobby
    lobby: {
      entry: assign({ catalogError: null, actionError: null, reveal: null }),
      initial: "loadingCatalog",
      states: {
        loadingCatalog: {
          invoke: {
            src: "catalogLoader",
            onDone: {
              actions: assign({ catalog: ({ event }) => event.output }),
            },
            onError: {
              actions: assign({ catalogError: ({ event }) => toPublicError(event.error) }),
            },
          },
        },
      },
      on: {
        RETRY_CATALOG: { target: ".loadingCatalog" },
      },
    },

    creating: {
      invoke: {
        src: "createSessionLoader",
        input: ({ event }) => {
          if (event.type !== "SELECT_CASE") throw new Error("SELECT_CASE required");
          return { caseId: event.caseId };
        },
        onDone: {
          target: "#game.session",
          actions: [
            assign(({ event }) => ({
              sessionId: event.output.view.session_id,
              sessionView: event.output.view,
              casePublic: event.output.caseDocs?.casePublic ?? null,
              sourceDoc: event.output.caseDocs?.sourceDoc ?? null,
              messages: [],
              evidences: [],
              thinking: null,
              actionError: null,
            })),
            { type: "persistSession" },
          ],
        },
        onError: {
          target: "#game.lobby",
          actions: assign({ actionError: ({ event }) => toPublicError(event.error) }),
        },
      },
    },

    restoring: {
      invoke: {
        src: "restoreLoader",
        input: ({ context }) => ({ sessionId: context.sessionId as string }),
        onDone: [
          {
            guard: ({ event }) => event.output !== null,
            target: "#game.session",
            actions: [
              assign(({ event }) => ({
                sessionView: event.output?.view ?? null,
                casePublic: event.output?.caseDocs?.casePublic ?? null,
                sourceDoc: event.output?.caseDocs?.sourceDoc ?? null,
                messages: event.output?.messages ?? [],
                evidences: event.output?.evidences ?? [],
                thinking: null,
              })),
              { type: "persistSession" },
            ],
          },
          {
            target: "lobby",
            actions: [{ type: "clearPersisted" }, assign({ sessionId: null })],
          },
        ],
        onError: {
          target: "lobby",
          actions: [
            { type: "clearPersisted" },
            assign({
              sessionId: null,
              actionError: ({ event }) => toPublicError(event.error),
            }),
          ],
        },
      },
    },

    // ----------------------------------------------------------------- session
    session: {
      initial: "routing",
      invoke: [
        {
          src: "sessionPoller",
          input: ({ context }) => ({ sessionId: context.sessionId as string }),
        },
        {
          src: "eventsWatcher",
          input: ({ context }) => ({
            sessionId: context.sessionId as string,
            lastSeq: context.sessionView?.last_event_sequence ?? 0,
          }),
        },
      ],
      on: {
        SNAPSHOT: {
          actions: assign(({ context, event }) => ({
            sessionView: event.view ?? context.sessionView,
            messages: event.messages ?? context.messages,
            evidences: event.evidences ?? context.evidences,
          })),
        },
        EVENTS: {
          actions: assign(({ context, event }) => {
            let notifs = context.notifs;
            let thinking = context.thinking;
            for (const e of event.events) {
              const p = e.payload;
              if (p.type === "evidence_unlocked") {
                notifs = pushNotif(
                  notifs,
                  notif("evidence", "解锁了新证据", `${p.evidence_ids.length} 条证据已加入证据池`),
                );
              }
              if (p.type === "recording_saved") {
                notifs = pushNotif(notifs, notif("success", "录音证据已保存", "可以在证据板查看"));
              }
              if (p.type === "role_turn_working") {
                thinking = { requestId: p.request_id, roleId: p.role_id };
              }
              if (p.type === "role_message_published" || p.type === "role_turn_failed") {
                if (thinking?.requestId === p.request_id) thinking = null;
              }
              if (p.type === "role_turn_failed") {
                notifs = pushNotif(notifs, notif("error", "这条回应失败了", p.error.message, p.error.code));
              }
              if (p.type === "session_failed") {
                notifs = pushNotif(notifs, notif("error", "对局异常终止", p.error.message, p.error.code));
              }
            }
            return {
              messages: event.messages ?? context.messages,
              evidences: event.evidences ?? context.evidences,
              notifs,
              thinking,
            };
          }),
        },
        CLEAR_ACTION_ERROR: { actions: assign({ actionError: null }) },
        BACK_TO_LOBBY: {
          target: "#game.lobby",
          actions: [{ type: "clearPersisted" }, { type: "clearSessionData" }],
        },
      },

      states: {
        routing: {
          always: [
            { target: "briefing", guard: "phaseBriefing" },
            { target: "openingStatements", guard: "phaseOpening" },
            { target: "investigation", guard: "phaseInvestigation" },
            { target: "judging", guard: "phaseJudging" },
            { target: "revealed", guard: "phaseRevealed" },
            { target: "failed", guard: "phaseFailed" },
          ],
        },

        briefing: {
          initial: "startingIdle",
          on: {
            START_GAME: { target: ".starting" },
          },
          states: {
            startingIdle: {},
            starting: {
              invoke: {
                src: "startGameLoader",
                input: ({ context }) => ({ sessionId: context.sessionId as string }),
                onDone: {
                  target: "#game.session.routing",
                  actions: assign(({ context, event }) => ({
                    sessionView: event.output.view ?? context.sessionView,
                  })),
                },
                onError: {
                  target: "startingIdle",
                  actions: assign({ actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
          },
        },

        openingStatements: {
          always: [
            { target: "investigation", guard: "phaseInvestigation" },
            { target: "failed", guard: "phaseFailed" },
          ],
        },

        investigation: {
          initial: "idle",
          states: {
            idle: {},
            asking: {
              invoke: {
                src: "roleTurnLoader",
                input: ({ context, event }) => {
                  if (event.type !== "ASK") throw new Error("ASK required");
                  return {
                    kind: "ask" as const,
                    sessionId: context.sessionId as string,
                    args: {
                      session_id: context.sessionId,
                      role_id: event.roleId,
                      mode: event.mode,
                      text: event.text,
                      source: event.source,
                      client_action_id: newClientActionId(),
                    },
                  };
                },
                onDone: {
                  target: "idle",
                  actions: assign(({ context, event }) => {
                    let notifs = context.notifs;
                    if (event.output.turn.status === "failed") {
                      notifs = pushNotif(
                        notifs,
                        notif(
                          "error",
                          "这条回应失败了",
                          event.output.turn.error.message,
                          event.output.turn.error.code,
                        ),
                      );
                    }
                    return {
                      messages: event.output.messages,
                      evidences: event.output.evidences,
                      notifs,
                      thinking: null,
                      turnBusy: false,
                      actionError: null,
                    };
                  }),
                },
                onError: {
                  target: "idle",
                  actions: assign({ turnBusy: false, actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
            presenting: {
              invoke: {
                src: "roleTurnLoader",
                input: ({ context, event }) => {
                  if (event.type !== "PRESENT_RECORDING") throw new Error("PRESENT_RECORDING required");
                  return {
                    kind: "present" as const,
                    sessionId: context.sessionId as string,
                    args: {
                      session_id: context.sessionId,
                      evidence_id: event.evidenceId,
                      target_role_id: event.targetRoleId,
                      client_action_id: newClientActionId(),
                    },
                  };
                },
                onDone: {
                  target: "idle",
                  actions: assign(({ context, event }) => ({
                    messages: event.output.messages,
                    evidences: event.output.evidences,
                    notifs:
                      event.output.turn.status === "failed"
                        ? pushNotif(
                            context.notifs,
                            notif("error", "对质没有成功", event.output.turn.error.message, event.output.turn.error.code),
                          )
                        : pushNotif(context.notifs, notif("info", "对质完成", "对方的回应已加入对话记录")),
                    thinking: null,
                    turnBusy: false,
                    actionError: null,
                  })),
                },
                onError: {
                  target: "idle",
                  actions: assign({ turnBusy: false, actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
            savingRecording: {
              invoke: {
                src: "saveRecordingLoader",
                input: ({ context, event }) => {
                  if (event.type !== "SAVE_RECORDING") throw new Error("SAVE_RECORDING required");
                  return { sessionId: context.sessionId as string, messageId: event.messageId };
                },
                onDone: {
                  target: "idle",
                  actions: assign(({ event }) => ({
                    evidences: event.output.evidences,
                    turnBusy: false,
                    actionError: null,
                  })),
                },
                onError: {
                  target: "idle",
                  actions: assign({ turnBusy: false, actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
            savingBoard: {
              invoke: {
                src: "boardSaver",
                input: ({ context, event }) => {
                  if (event.type !== "BOARD_SAVE") throw new Error("BOARD_SAVE required");
                  return {
                    sessionId: context.sessionId as string,
                    placements: event.placements,
                    links: event.links,
                    expectedRevision: context.sessionView?.board.revision ?? 0,
                  };
                },
                onDone: {
                  target: "idle",
                  actions: assign(({ context, event }) => ({
                    sessionView: context.sessionView
                      ? { ...context.sessionView, board: event.output }
                      : context.sessionView,
                    notifs: pushNotif(context.notifs, notif("success", "证据板已保存")),
                    turnBusy: false,
                    actionError: null,
                  })),
                },
                onError: {
                  target: "idle",
                  actions: assign({ turnBusy: false, actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
            accusing: {
              invoke: {
                src: "accuser",
                input: ({ context, event }) => {
                  if (event.type !== "ACCUSE") throw new Error("ACCUSE required");
                  return { sessionId: context.sessionId as string, accusation: event.accusation };
                },
                onDone: {
                  target: "idle",
                  actions: assign(({ context, event }) => ({
                    sessionView: event.output.view ?? context.sessionView,
                    notifs: pushNotif(context.notifs, notif("success", "指控已提交", "合议庭正在裁决，即将进入揭底")),
                    turnBusy: false,
                    actionError: null,
                  })),
                },
                onError: {
                  target: "idle",
                  actions: assign({ turnBusy: false, actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
          },
          always: [
            { target: "judging", guard: "phaseJudging" },
            { target: "revealed", guard: "phaseRevealed" },
            { target: "failed", guard: "phaseFailed" },
          ],
          on: {
            ASK: { target: ".asking", actions: assign({ turnBusy: true, actionError: null }) },
            PRESENT_RECORDING: { target: ".presenting", actions: assign({ turnBusy: true, actionError: null }) },
            SAVE_RECORDING: { target: ".savingRecording", actions: assign({ turnBusy: true, actionError: null }) },
            BOARD_SAVE: { target: ".savingBoard", actions: assign({ turnBusy: true, actionError: null }) },
            ACCUSE: { target: ".accusing", actions: assign({ turnBusy: true, actionError: null }) },
          },
        },

        judging: {
          always: [
            { target: "revealed", guard: "phaseRevealed" },
            { target: "failed", guard: "phaseFailed" },
          ],
        },

        revealed: {
          initial: "loading",
          states: {
            loading: {
              invoke: {
                src: "revealLoader",
                input: ({ context }) => ({ sessionId: context.sessionId as string }),
                onDone: {
                  target: "done",
                  actions: assign({ reveal: ({ event }) => event.output }),
                },
                onError: {
                  target: "done",
                  actions: assign({ actionError: ({ event }) => toPublicError(event.error) }),
                },
              },
            },
            done: {},
          },
        },

        failed: {},
      },
    },
  },
});
