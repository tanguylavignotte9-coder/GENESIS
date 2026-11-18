import { knowledgeBit, type KnowledgeCatalog } from '../../core/knowledge';
import { INPUTS, type ActionDef, type HumanParams, type Input } from './params';

const Curve = { Linear: 0, Power: 1, Logistic: 2 } as const;
const TOP = 3;

/** An action of the data file, precompiled into arrays for fast scoring. */
export interface CompiledAction {
  def: ActionDef;
  inputs: Uint8Array;
  curves: Uint8Array;
  a: Float64Array;
  b: Float64Array;
  traitIndex: Int8Array;
  traitStrength: Float64Array;
  /** Bit of the knowledge needed (0 = none). */
  requiredBit: number;
  reasonInput: number;
  /** Recipe and item indices of the production catalog (work behaviours). */
  recipes: number[];
  items: number[];
  minAge: number;
}

/** Index lookups of the production catalog (-1 when unknown). */
export interface ProductionLookup {
  recipe(id: string): number;
  item(id: string): number;
}

export function inputIndex(input: Input): number {
  return INPUTS.indexOf(input);
}

export function compileActions(params: HumanParams, knowledge: KnowledgeCatalog, lookup: ProductionLookup): CompiledAction[] {
  const traitIds = params.traits.map((trait) => trait.id);
  return params.actions.map((def) => {
    const traits = Object.entries(def.traits);
    return {
      def,
      inputs: Uint8Array.from(def.considerations, (c) => inputIndex(c.input)),
      curves: Uint8Array.from(def.considerations, (c) => (c.curve === 'linear' ? Curve.Linear : c.curve === 'power' ? Curve.Power : Curve.Logistic)),
      a: Float64Array.from(def.considerations, (c) => c.a),
      b: Float64Array.from(def.considerations, (c) => c.b),
      traitIndex: Int8Array.from(traits, ([id]) => traitIds.indexOf(id)),
      traitStrength: Float64Array.from(traits, ([, strength]) => strength),
      requiredBit: def.requires ? knowledgeBit(knowledge, def.requires) : 0,
      reasonInput: inputIndex(def.reason),
      recipes: (def.recipes ?? []).map((id) => lookup.recipe(id)).filter((k) => k >= 0),
      items: (def.items ?? []).map((id) => lookup.item(id)).filter((k) => k >= 0),
      minAge: def.minAge ?? 0,
    };
  });
}

/** Response curve, clamped to 0..1. */
export function curve(kind: number, a: number, b: number, x: number): number {
  let y: number;
  if (kind === Curve.Linear) y = a * x + b;
  else if (kind === Curve.Power) y = Math.pow(Math.max(0, x), a);
  else y = 1 / (1 + Math.exp(-b * (x - a)));
  return y < 0 ? 0 : y > 1 ? 1 : y;
}

/**
 * Utility score of an action: weight × product of its considerations × personality.
 * `traits` holds the person's trait values (0..1).
 */
export function scoreAction(action: CompiledAction, inputs: Float64Array, traits: Float32Array, traitOffset: number): number {
  let score = action.def.weight;
  for (let k = 0; k < action.inputs.length && score > 0; k++) {
    score *= curve(action.curves[k]!, action.a[k]!, action.b[k]!, inputs[action.inputs[k]!]!);
  }
  for (let k = 0; k < action.traitIndex.length; k++) {
    score *= Math.max(0, 1 + action.traitStrength[k]! * (2 * traits[traitOffset + action.traitIndex[k]!]! - 1));
  }
  return score;
}

/** Fills `order` with the action indices sorted from the best score to the worst (insertion sort: few actions). */
export function rankActions(scores: Float64Array, order: number[]): void {
  order.length = scores.length;
  for (let k = 0; k < scores.length; k++) {
    let at = k;
    while (at > 0 && scores[order[at - 1]!]! < scores[k]!) {
      order[at] = order[at - 1]!;
      at--;
    }
    order[at] = k;
  }
}

export const TOP_ACTIONS = TOP;
