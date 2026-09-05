'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type {
  CasePublic,
  SourceDocumentPublic,
  EvidenceFragmentPublic,
  DialogueTurn,
  Accusation,
  GameConfig,
  GameState,
} from '@/contracts/types';
import {
  mockGetPublic,
  mockGetSource,
  mockGameConfig,
  mockDialogues,
  mockEvidences,
} from '@/mock/goldenCase';

interface GameContextType {
  state: GameState;
  casePublic: CasePublic | null;
  sourceDoc: SourceDocumentPublic | null;
  gameConfig: GameConfig;
  dialogues: DialogueTurn[];
  evidences: EvidenceFragmentPublic[];
  selectedRoleId: string | null;
  currentRound: number;
  timeRemaining: number;
  accusation: Accusation | null;
  startGame: () => void;
  goToBriefing: () => void;
  goToInterrogation: () => void;
  goToEvidence: () => void;
  goToAccusation: () => void;
  goToReveal: () => void;
  addDialogue: (d: DialogueTurn) => void;
  setSelectedRoleId: (id: string | null) => void;
  nextRound: () => void;
  submitAccusation: (a: Accusation) => void;
  restart: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [casePublic, setCasePublic] = useState<CasePublic | null>(null);
  const [sourceDoc, setSourceDoc] = useState<SourceDocumentPublic | null>(null);
  const [dialogues, setDialogues] = useState<DialogueTurn[]>([]);
  const [evidences, setEvidences] = useState<EvidenceFragmentPublic[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(90);
  const [accusation, setAccusation] = useState<Accusation | null>(null);

  const startGame = useCallback(() => {
    const caseData = mockGetPublic('case-demo-001');
    const source = mockGetSource('case-demo-001');
    setCasePublic(caseData);
    setSourceDoc(source);
    setDialogues(mockDialogues);
    setEvidences(mockEvidences);
    setCurrentRound(1);
    setTimeRemaining(mockGameConfig.interrogation_time_limit);
    setGameState('briefing');
  }, []);

  const goToBriefing = useCallback(() => setGameState('briefing'), []);
  const goToInterrogation = useCallback(() => setGameState('interrogation'), []);
  const goToEvidence = useCallback(() => setGameState('evidence_review'), []);
  const goToAccusation = useCallback(() => setGameState('accusation'), []);
  const goToReveal = useCallback(() => setGameState('reveal'), []);

  const addDialogue = useCallback((d: DialogueTurn) => {
    setDialogues((prev) => [...prev, d]);
  }, []);

  const nextRound = useCallback(() => {
    setCurrentRound((r) => r + 1);
    setTimeRemaining(mockGameConfig.interrogation_time_limit);
  }, []);

  const submitAccusation = useCallback((a: Accusation) => {
    setAccusation(a);
    setGameState('reveal');
  }, []);

  const restart = useCallback(() => {
    setCasePublic(null);
    setSourceDoc(null);
    setDialogues([]);
    setEvidences([]);
    setSelectedRoleId(null);
    setCurrentRound(1);
    setTimeRemaining(90);
    setAccusation(null);
    setGameState('lobby');
  }, []);

  return (
    <GameContext.Provider value={{
      state: gameState,
      casePublic,
      sourceDoc,
      gameConfig: mockGameConfig,
      dialogues,
      evidences,
      selectedRoleId,
      currentRound,
      timeRemaining,
      accusation,
      startGame,
      goToBriefing,
      goToInterrogation,
      goToEvidence,
      goToAccusation,
      goToReveal,
      addDialogue,
      setSelectedRoleId,
      nextRound,
      submitAccusation,
      restart,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within GameProvider');
  }
  return ctx;
}
