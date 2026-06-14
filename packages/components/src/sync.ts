import { createContext, useContext } from "react";

/**
 * Card-scoped linked-view sync. A composable card whose def has encoding.x
 * provides this context to its children: hovering a categorical mark
 * highlights matching marks in sibling plots; clicking toggles a card-wide
 * filter. This is deliberately CARD-SCOPED presentation behavior — the
 * document-wide sync engine (Zustand/RxJS/custom) remains a Phase 3 decision.
 */
export interface CardSync {
  /** The shared key column (the owning card's encoding.x); null = no sync. */
  syncField: string | null;
  hoverValue: string | null;
  setHoverValue: (value: string | null) => void;
  filterValue: string | null;
  setFilterValue: (value: string | null) => void;
}

const noop = () => undefined;

export const CardSyncContext = createContext<CardSync>({
  syncField: null,
  hoverValue: null,
  setHoverValue: noop,
  filterValue: null,
  setFilterValue: noop,
});

export function useCardSync(): CardSync {
  return useContext(CardSyncContext);
}

/** True when this mark should be dimmed because a sibling mark is hovered. */
export function isDimmed(sync: CardSync, category: string | null): boolean {
  if (!sync.syncField || sync.hoverValue === null || category === null) return false;
  return category !== sync.hoverValue;
}
