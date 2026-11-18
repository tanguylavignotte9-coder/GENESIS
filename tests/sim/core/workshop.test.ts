import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { resolveKey } from '../../../src/sim/core/variables';
import { VARIABLE_CHANGED, Workshop } from '../../../src/sim/core/workshop';

const SIZE = 256;
const hourTicks = 4800 / 24;

/** A workshop with a small map and a running world. */
function running(): { workshop: Workshop; simulation: Simulation } {
  const workshop = new Workshop();
  expect(workshop.set('worldgen.json', 'size', SIZE).ok).toBe(true);
  const simulation = new Simulation(42, workshop.dataForNewWorld());
  workshop.attach(simulation);
  return { workshop, simulation };
}

const variable = (workshop: Workshop, file: string, key: string) => workshop.variables().find((v) => v.file === file && v.key === key)!;

describe('variables catalog', () => {
  it('lists every variable with its documentation, value and default, grouped by system and file', () => {
    const workshop = new Workshop();
    const wolfHunger = variable(workshop, 'animals.json', 'species.wolf.hungerPerDay');
    expect(wolfHunger).toMatchObject({ system: 'Faune', section: 'Espèces › Loup', label: 'Faim', unit: 'points/jour', apply: 'live', min: 0, max: 100 });
    expect(wolfHunger.value).toBe(wolfHunger.defaultValue);
    const size = variable(workshop, 'worldgen.json', 'size');
    expect(size).toMatchObject({ system: 'Monde', apply: 'newWorld', kind: 'integer' });
    expect(variable(workshop, 'animals.json', 'species.horse.migratory').kind).toBe('boolean');
    expect(variable(workshop, 'plants.json', 'species.oak.kind').values).toEqual(['tree', 'shrub', 'herb']);
    expect(variable(workshop, 'humans.json', 'tribe.adultAge.1').label).toContain('(max)');
  });

  it('finds a variable again from its key (list entries by id)', () => {
    const workshop = new Workshop();
    const wolf = variable(workshop, 'animals.json', 'species.wolf.moveChance');
    expect(resolveKey({ species: [{ id: 'deer' }, { id: 'wolf', moveChance: 1 }] }, 'species.wolf.moveChance')).toEqual(['species', 1, 'moveChance']);
    expect(wolf.path[0]).toBe('species');
  });
});

describe('the variables workshop', () => {
  it('applies a live change to the running world and writes it in the journal', () => {
    const { workshop, simulation } = running();
    const wolf = simulation.data.fauna.species.findIndex((species) => species.id === 'wolf');
    expect(workshop.set('animals.json', 'species.wolf.hungerPerDay', 20).ok).toBe(true);
    expect(simulation.data.fauna.species[wolf]!.hungerPerDay).toBe(20);
    const event = simulation.journal.all().find((entry) => entry.type === VARIABLE_CHANGED)!;
    expect(event.text).toBe('Variable modifiée : Faune › Espèces › Loup › Faim : 12 → 20 points/jour.');
    simulation.step(hourTicks);
  });

  it('keeps a "new world" change for the next world, with a clear mention', () => {
    const { workshop, simulation } = running();
    expect(workshop.set('humans.json', 'tribe.size', 12).ok).toBe(true);
    expect(simulation.data.humans.tribe.size).toBe(30);
    expect(variable(workshop, 'humans.json', 'tribe.size')).toMatchObject({ value: 12, worldValue: 30 });
    expect(simulation.journal.all().at(-1)!.text).toContain('(au prochain monde)');
    const next = new Simulation(7, workshop.dataForNewWorld());
    expect(next.humans.people.count).toBe(12);
  });

  it('refuses a value out of bounds, with a French explanation, and changes nothing', () => {
    const { workshop, simulation } = running();
    const result = workshop.set('animals.json', 'species.wolf.moveChance', 3);
    expect(result.ok).toBe(false);
    expect(result.messages.join(' ')).toContain('doit être un nombre compris entre 0 et 1');
    expect(variable(workshop, 'animals.json', 'species.wolf.moveChance').value).toBe(1);
    expect(simulation.journal.all().some((entry) => entry.type === VARIABLE_CHANGED && entry.text.includes('Vitesse'))).toBe(false);
  });

  it('resets a variable, or everything, to the default values', () => {
    const { workshop, simulation } = running();
    workshop.set('animals.json', 'species.deer.thirstPerDay', 30);
    workshop.set('plants.json', 'grass.growthPerDay', 2);
    workshop.reset('animals.json', 'species.deer.thirstPerDay');
    expect(variable(workshop, 'animals.json', 'species.deer.thirstPerDay').value).toBe(20);
    expect(simulation.data.fauna.species[0]!.thirstPerDay).toBe(20);
    workshop.resetAll();
    expect(workshop.variables().filter((v) => v.value !== v.defaultValue)).toEqual([]);
    expect(simulation.data.flora.grass.growthPerDay).toBe(1.2);
    expect(workshop.presetName).toBeNull();
  });

  it('saves only the differences in a preset and loads it back', () => {
    const { workshop } = running();
    workshop.set('animals.json', 'species.lion.huntSuccess', 0.2);
    workshop.set('climate.json', 'anomalies.chancePerRoll', 0.3);
    const preset = workshop.toPreset('Lions redoutables');
    expect(preset).toEqual({
      nom: 'Lions redoutables',
      valeurs: { 'worldgen.json': { size: SIZE }, 'climate.json': { 'anomalies.chancePerRoll': 0.3 }, 'animals.json': { 'species.lion.huntSuccess': 0.2 } },
    });
    workshop.resetAll();
    const result = workshop.loadPreset({ ...preset, valeurs: { ...preset.valeurs, 'animals.json': { ...preset.valeurs['animals.json'], 'species.dragon.size': 3 } } });
    expect(result.messages).toEqual(['Variable inconnue ignorée : animals.json › species.dragon.size.']);
    expect(workshop.toPreset('x').valeurs).toEqual(preset.valeurs);
    expect(workshop.presetName).toBe('Lions redoutables');
    expect(workshop.modified).toBe(false);
  });

  it('every live variable can be changed while the world runs (one entry of each list)', () => {
    const { workshop, simulation } = running();
    const live = workshop.variables().filter((v) => v.apply === 'live' && (v.kind === 'number' || v.kind === 'integer') && !v.path.some((segment) => typeof segment === 'number' && segment > 0));
    expect(live.length).toBeGreaterThan(150);
    let applied = 0;
    for (const v of live) {
      const value = v.value as number;
      const span = (v.max ?? value + 1) - (v.min ?? value - 1);
      let next = value + span * 0.1 <= (v.max ?? Infinity) ? value + span * 0.1 : value - span * 0.1;
      if (v.kind === 'integer') next = Math.round(next) === value ? value + (value < (v.max ?? Infinity) ? 1 : -1) : Math.round(next);
      if (workshop.set(v.file, v.key, next).ok) applied++;
      simulation.step(hourTicks / 4);
      workshop.reset(v.file, v.key);
    }
    // A few changes break a rule between two values (min above max…): they are refused, not applied.
    expect(applied).toBeGreaterThan(live.length * 0.9);
    simulation.step(hourTicks * 24);
  });
});
