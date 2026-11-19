import type { Simulation } from '../sim/core/simulation';
import type { FaunaSnapshot, FloraSnapshot, Inspection } from '../shared/messages';
import { FLEES_HUMAN_STATE, State } from '../sim/systems/fauna/animal-store';

const PERCENT = 100;
const BYTE_MAX = 255;

export function snapshotFlora(simulation: Simulation): { snapshot: FloraSnapshot; transfer: ArrayBuffer[] } {
  const snapshot = { species: simulation.flora.state.species.slice(), growth: simulation.flora.state.growth.slice() };
  return { snapshot, transfer: [snapshot.species.buffer as ArrayBuffer, snapshot.growth.buffer as ArrayBuffer] };
}

/** Living animals only, packed in compact arrays. */
export function snapshotFauna(simulation: Simulation): { snapshot: FaunaSnapshot; transfer: ArrayBuffer[] } {
  const store = simulation.fauna.store;
  const count = store.living;
  const snapshot: FaunaSnapshot = {
    count,
    uid: new Int32Array(count),
    species: new Uint8Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    gait: new Uint8Array(count),
    state: new Uint8Array(count),
  };
  let k = 0;
  for (let slot = 0; slot < store.slots && k < count; slot++) {
    if (store.alive[slot] === 0) continue;
    snapshot.uid[k] = store.uid[slot]!;
    snapshot.species[k] = store.species[slot]!;
    snapshot.x[k] = store.px[slot]!;
    snapshot.y[k] = store.py[slot]!;
    snapshot.vx[k] = store.vx[slot]!;
    snapshot.vy[k] = store.vy[slot]!;
    snapshot.gait[k] = store.gait[slot]!;
    snapshot.state[k] = store.fleesHuman[slot] === 1 && store.state[slot] === State.Flee ? FLEES_HUMAN_STATE : store.state[slot]!;
    k++;
  }
  const { uid, species, x, y, vx, vy, gait, state } = snapshot;
  return { snapshot, transfer: [uid, species, x, y, vx, vy, gait, state].map((array) => array.buffer as ArrayBuffer) };
}

/** Details of a tile and (optionally) of an animal, for the tooltip. */
export function inspect(simulation: Simulation, requestId: number, tile: number, animalUid: number): Inspection {
  const { flora, fauna } = simulation;
  const size = simulation.world.size;
  const x = tile % size;
  const y = Math.floor(tile / size);
  const plantSpecies = flora.speciesAt(tile);
  const produce = plantSpecies?.produce;
  const inspection: Inspection = {
    requestId,
    tile,
    plant: plantSpecies
      ? {
          species: flora.state.species[tile]! - 1,
          ageDays: flora.state.ageDays[tile]!,
          growth: flora.state.growth[tile]! / BYTE_MAX,
          health: flora.state.health[tile]! / BYTE_MAX,
          produce: produce ? flora.produceAvailable(tile, produce.resource) : 0,
        }
      : null,
    grass: flora.isPlantable(tile) ? Math.round(flora.grassReachable(tile)) : 0,
    fish: fauna.fish.availableNear(x, y),
    animal: null,
  };
  if (animalUid < 0) return inspection;
  const store = fauna.store;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0 || store.uid[slot] !== animalUid) continue;
    inspection.animal = {
      uid: animalUid,
      species: store.species[slot]!,
      ageDays: store.ageDays[slot]!,
      female: store.sex[slot] === 0,
      hunger: Math.round(store.hunger[slot]!),
      thirst: Math.round(store.thirst[slot]!),
      health: Math.round(Math.min(PERCENT, store.health[slot]!)),
      state: store.fleesHuman[slot] === 1 && store.state[slot] === State.Flee ? FLEES_HUMAN_STATE : store.state[slot]!,
      pregnant: store.pregnancy[slot]! > 0,
      groupSize: fauna.groups.size[store.group[slot]!]!,
    };
    break;
  }
  return inspection;
}
