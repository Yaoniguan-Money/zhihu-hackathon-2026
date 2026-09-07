"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMachine } from "@xstate/react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import {
  gameMachine,
  SESSION_STORAGE_KEY,
  type GameContextData,
  type Notif,
} from "./gameMachine";
import type {
  BoardLink,
  BoardPlacement,
  FinalAccusation,
  QuestionMode,
  QuestionSource,
} from "@/contracts/public";
import type { RoleId } from "@/contracts/shared";

/**
 * GameProvider：匿名登录门控 + gameMachine 的 React 适配层。
 * 页面只通过 useGame() 消费镜像状态与显式动作，不直接触达 Convex。
 */

interface GameApi extends GameContextData {
  booted: boolean;
  allowedActions: Set<string>;
  phase: string | null;
  notifList: Notif[];
  /** 角色回合（ask/对质）是否在途。 */
  busyTurn: boolean;
  /** 状态机是否已回到大厅态（用于 /game/* 路由与机器状态脱钩时的回弹）。 */
  matchesLobby: boolean;
  selectCase: (caseId: string) => void;
  startGame: () => void;
  ask: (roleId: RoleId, mode: QuestionMode, text: string, source: QuestionSource) => void;
  saveRecording: (messageId: string) => void;
  presentRecording: (evidenceId: string, targetRoleId: RoleId) => void;
  saveBoard: (placements: BoardPlacement[], links: BoardLink[]) => void;
  accuse: (accusation: FinalAccusation) => void;
  dismissNotif: (id: string) => void;
  clearActionError: () => void;
  backToLobby: () => void;
  retryCatalog: () => void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authActions = useAuthActions();
  const [snapshot, send] = useMachine(gameMachine, {
    input: {
      storedSessionId:
        typeof window !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null,
    },
  });

  // P0 匿名身份：进入页面后建立 Convex Auth 会话（ADR 0004）。
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void authActions.signIn("anonymous");
    }
  }, [isLoading, isAuthenticated, authActions]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      send({ type: "AUTH_READY" });
    }
  }, [isLoading, isAuthenticated, send]);

  const api = useMemo<GameApi>(() => {
    const ctx = snapshot.context;
    return {
      ...ctx,
      booted: !isLoading && isAuthenticated,
      matchesLobby: snapshot.matches("lobby"),
      allowedActions: new Set(ctx.sessionView?.allowed_actions ?? []),
      phase: ctx.sessionView?.phase ?? null,
      notifList: ctx.notifs,
      busyTurn: ctx.turnBusy,
      selectCase: (caseId) => send({ type: "SELECT_CASE", caseId }),
      startGame: () => send({ type: "START_GAME" }),
      ask: (roleId, mode, text, source) => send({ type: "ASK", roleId, mode, text, source }),
      saveRecording: (messageId) => send({ type: "SAVE_RECORDING", messageId }),
      presentRecording: (evidenceId, targetRoleId) =>
        send({ type: "PRESENT_RECORDING", evidenceId, targetRoleId }),
      saveBoard: (placements, links) => send({ type: "BOARD_SAVE", placements, links }),
      accuse: (accusation) => send({ type: "ACCUSE", accusation }),
      dismissNotif: (id) => send({ type: "DISMISS_NOTIF", id }),
      clearActionError: () => send({ type: "CLEAR_ACTION_ERROR" }),
      backToLobby: () => send({ type: "BACK_TO_LOBBY" }),
      retryCatalog: () => send({ type: "RETRY_CATALOG" }),
    };
  }, [snapshot, isLoading, isAuthenticated, send]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame 必须在 GameProvider 内使用");
  return ctx;
}
