import { curve, type CompiledAction } from './brain';
import type { IndividualsSystem } from './individuals-system';

/**
 * Visual brain (step 10.5): the detail of one decision of ONE person — the one whose brain the
 * spectator looks at. It is rebuilt from the same inputs and the same random draws as the decision
 * itself, without drawing anything nor changing anything: watching a brain never changes the story.
 */

/** One factor of an action's score (a multiplication). */
export interface FactorTrace {
  /** What it comes from: an input of the brain, a trait, the culture, an ambition, chance, habit. */
  kind: 'weight' | 'input' | 'trait' | 'culture' | 'ambition' | 'random' | 'keep' | 'work';
  /** Index of the input or trait (-1 otherwise). */
  index: number;
  /** Value of the input or trait (0..1), -1 when it has none. */
  value: number;
  /** What it multiplies the score by. */
  factor: number;
}

export interface ActionTrace {
  action: number;
  score: number;
  /** Why it was impossible to even consider ("knowledge": unknown, "age": too young), '' otherwise. */
  blocked: '' | 'knowledge' | 'age';
  /** Tried and impossible right now (nothing to do it with, no way there). */
  failed: boolean;
  factors: FactorTrace[];
}

export interface BrainTrace {
  person: number;
  /** Game tick of the decision. */
  tick: number;
  /** Values of all the inputs (order of INPUTS). */
  inputs: number[];
  actions: ActionTrace[];
  /** Action chosen (or kept), and the one before. */
  chosen: number;
  previous: number;
}

/** Who is watched, and the detail of their last decision (never saved: it is the spectator's). */
export class BrainWatch {
  person = -1;
  trace: BrainTrace | null = null;
}

/** What `think` knew when it scored the actions. */
export interface DecisionContext {
  inputs: Float64Array;
  /** Random draw (0..1) of each action. */
  noise: Float64Array;
  scores: Float64Array;
  wantedSkill: number;
  current: number;
  working: boolean;
  chosen: number;
  failed: readonly number[];
}

/** The detail of a decision: every action with each factor of its score. */
export function traceDecision(sys: IndividualsSystem, person: number, context: DecisionContext): BrainTrace {
  const { people, params } = sys;
  const traitOffset = person * people.traitCount;
  const actions: ActionTrace[] = sys.actions.map((action, k) => {
    const blocked = blockedBy(sys, person, action);
    const trace: ActionTrace = { action: k, score: context.scores[k]!, blocked, failed: context.failed.includes(k), factors: [] };
    if (blocked) return trace;
    const factors = trace.factors;
    factors.push({ kind: 'weight', index: -1, value: -1, factor: action.def.weight });
    for (let c = 0; c < action.inputs.length; c++) {
      const input = action.inputs[c]!;
      const value = context.inputs[input]!;
      factors.push({ kind: 'input', index: input, value, factor: curve(action.curves[c]!, action.a[c]!, action.b[c]!, value) });
    }
    for (let t = 0; t < action.traitIndex.length; t++) {
      const trait = action.traitIndex[t]!;
      const value = people.traits[traitOffset + trait]!;
      factors.push({ kind: 'trait', index: trait, value, factor: Math.max(0, 1 + action.traitStrength[t]! * (2 * value - 1)) });
    }
    const culture = sys.ideas.actionFactor(person, k);
    if (culture !== 1) factors.push({ kind: 'culture', index: -1, value: -1, factor: culture });
    if (context.wantedSkill >= 0 && action.skills.includes(context.wantedSkill)) factors.push({ kind: 'ambition', index: -1, value: -1, factor: 1 + sys.social.params.ambitions.skillBonus });
    factors.push({ kind: 'random', index: -1, value: -1, factor: 1 + params.decision.randomness * (context.noise[k]! * 2 - 1) });
    if (k === context.current) {
      factors.push({ kind: 'keep', index: -1, value: -1, factor: 1 + params.decision.keepCurrentBonus });
      if (context.working) factors.push({ kind: 'work', index: -1, value: -1, factor: 1 + params.decision.keepWorkBonus });
    }
    return trace;
  });
  return { person, tick: sys.social.tick, inputs: Array.from(context.inputs), actions, chosen: context.chosen, previous: context.current };
}

function blockedBy(sys: IndividualsSystem, person: number, action: CompiledAction): ActionTrace['blocked'] {
  if (action.requiredBit !== 0 && (sys.ideas.knowledge(person) & action.requiredBit) === 0) return 'knowledge';
  if (sys.people.ageYears[person]! < action.minAge) return 'age';
  return '';
}
