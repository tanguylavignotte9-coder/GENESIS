import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/core/simulation';
import { HumanFlag } from '../../src/shared/messages';
import { describeBuilding } from '../../src/worker/building-snapshots';
import { snapshotHumans } from '../../src/worker/human-snapshots';
import { dataWithSize } from '../sim/world/helpers';

const data = dataWithSize(320);
const hourTicks = data.time.ticksPerDay / 24;

describe('inside a building', () => {
  it('someone asleep in a hut is not drawn on the map; the hut tells who is inside and what they do', () => {
    const simulation = new Simulation(42, data);
    // The middle of the first night.
    simulation.step(hourTicks * 26);
    const { snapshot } = snapshotHumans(simulation);
    const inside = [...snapshot.flags.keys()].filter((p) => (snapshot.flags[p]! & HumanFlag.Inside) !== 0);
    expect(inside.length).toBeGreaterThan(0);
    const { production, humans } = simulation;
    const huts = production.campBuildings(0).filter((b) => production.typeOf(b).def.enclosed);
    const occupants = huts.flatMap((b) => describeBuilding(simulation, 1, b.id)!.occupants);
    expect(occupants.map((o) => o.person).sort((a, b) => a - b)).toEqual(inside);
    expect(occupants.some((o) => o.doing === humans.actions.find((a) => a.def.id === 'sleep')!.def.label)).toBe(true);
    // A lean-to or a fire hides nobody: only closed buildings do.
    for (const building of production.buildings) {
      if (!production.typeOf(building).def.enclosed) expect(describeBuilding(simulation, 1, building.id)!.occupants).toEqual([]);
    }
  });
});

describe('domestic animals on the map', () => {
  it('are flagged for the display (collar and pied coat), wild ones are not', async () => {
    const { snapshotFauna } = await import('../../src/worker/life-snapshots');
    const simulation = new Simulation(42, data);
    const { store } = simulation.fauna;
    let slot = 0;
    while (store.alive[slot] === 0) slot++;
    store.ownerCamp[slot] = 0;
    const { snapshot } = snapshotFauna(simulation);
    const k = [...snapshot.uid].indexOf(store.uid[slot]!);
    expect(snapshot.domestic[k]).toBe(1);
    expect([...snapshot.domestic].filter((d) => d === 1)).toHaveLength(1);
  });
});
