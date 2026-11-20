/**
 * Visual brain (step 10.5): what the simulation sends to draw a decision as a network. Left, what
 * the being feels and knows (nodes); right, the possible actions with their score (options); links
 * say what pushes (green) or holds back (red) each action, their strength the width.
 */
export interface BrainNode {
  id: string;
  label: string;
  /** Column group: "Besoins", "Émotions", "Obligations", "Ambitions", "Traits", "Situation"… */
  group: string;
  /** 0..1, or -1 when it is only a fact ("Saison : hiver"). */
  value: number;
}

export interface BrainLink {
  from: string;
  to: string;
  /** 0..1. */
  strength: number;
  push: boolean;
}

export interface BrainOption {
  id: string;
  label: string;
  score: number;
  /** chosen (what it does), possible, failed (wanted but impossible now), blocked (cannot even think of it). */
  state: 'chosen' | 'possible' | 'failed' | 'blocked';
  /** Detail of the score, one line per factor ("soif 72 % → ×0,90"). */
  why: string[];
}

export interface BrainFacts {
  kind: 'human' | 'animal';
  /** Person index or animal uid. */
  id: number;
  name: string;
  /** Date of the decision shown. */
  when: string;
  /** What it does now. */
  doing: string;
  nodes: BrainNode[];
  options: BrainOption[];
  links: BrainLink[];
  /** The last decisions, most recent first, with the reason of each change. */
  history: { when: string; text: string }[];
  /** Note shown when there is nothing to show yet (dead, never decided since watched…). */
  note: string;
}
