import { describe, expect, it } from 'vitest';
import { daysPerYear } from '../../../src/sim/core/time-params';
import { Simulation } from '../../../src/sim/core/simulation';
import { ANOMALY_END, ANOMALY_START } from '../../../src/sim/systems/world/anomalies';
import { seasonSignal } from '../../../src/sim/systems/world/seasons';
import { dataWithSize } from './helpers';

const SIZE = 128;

/** Data for a small map, with frequent abnormal years so they show up in short runs. */
function testData(chancePerRoll = 0.5) {
  const data = dataWithSize(SIZE);
  return { ...data, climate: { ...data.climate, anomalies: { ...data.climate.anomalies, chancePerRoll, tilesPerRoll: 1000, minLandmassTiles: 200 } } };
}

/** Advances to a given day of the year (0-based), from a fresh simulation. */
function simulationAtDay(day: number, chance = 0) {
  const data = testData(chance);
  const simulation = new Simulation(42, data);
  simulation.step(day * data.time.ticksPerDay);
  return simulation;
}

function rowAverage(valueAt: (index: number) => number, row: number): number {
  let sum = 0;
  for (let x = 0; x < SIZE; x++) sum += valueAt(row * SIZE + x);
  return sum / SIZE;
}

const temperatures = (simulation: Simulation) => (index: number) => simulation.climate.temperatureAt(index);
const humidities = (simulation: Simulation) => (index: number) => simulation.climate.humidityAt(index);

describe('seasons', () => {
  const data = testData();
  const year = daysPerYear(data.time);
  const summer = data.climate.seasonalTemperature.warmestDayOfYear;
  const winter = (summer + year / 2) % year;

  it('summer and winter are opposite in the two hemispheres', () => {
    expect(seasonSignal(summer, year, true, data.climate)).toBeGreaterThan(0.9);
    expect(seasonSignal(summer, year, false, data.climate)).toBeLessThan(-0.9);
    expect(seasonSignal(winter, year, true, data.climate)).toBeLessThan(-0.9);
  });

  it('temperatures swing strongly at high latitudes and barely at the equator', () => {
    const hot = simulationAtDay(summer);
    const cold = simulationAtDay(winter);
    const polarRow = 8;
    const equatorRow = SIZE / 2;
    const polarSwing = rowAverage(temperatures(hot), polarRow) - rowAverage(temperatures(cold), polarRow);
    const equatorSwing = Math.abs(rowAverage(temperatures(hot), equatorRow) - rowAverage(temperatures(cold), equatorRow));
    expect(polarSwing).toBeGreaterThan(20);
    expect(equatorSwing).toBeLessThan(3);
  });

  it('snow spreads in the northern winter and retreats in the northern summer', () => {
    const snowyTiles = (simulation: Simulation): number => {
      let count = 0;
      for (let i = 0; i < (SIZE * SIZE) / 2; i++) if (simulation.climate.snowAt(i) > 0.5) count++;
      return count;
    };
    expect(snowyTiles(simulationAtDay(winter))).toBeGreaterThan(2 * snowyTiles(simulationAtDay(summer)));
  });

  it('near the equator, a wet season and a dry season alternate', () => {
    const tropicalRow = Math.round(SIZE / 2 - 0.1 * (SIZE / 2));
    const wet = rowAverage(humidities(simulationAtDay(summer)), tropicalRow);
    const dry = rowAverage(humidities(simulationAtDay(winter)), tropicalRow);
    expect(wet).toBeGreaterThan(dry * 1.5);
  });
});

describe('abnormal years', () => {
  it('are deterministic: same seed => same events', () => {
    const run = () => {
      const simulation = new Simulation(7, testData());
      simulation.step(5 * year(simulation));
      return simulation.journal.all().map((event) => `${event.tick} ${event.text}`);
    };
    expect(run()).toEqual(run());
  });

  it('are published in the journal with a place, and each end is caused by its start', () => {
    const simulation = new Simulation(7, testData());
    simulation.step(5 * year(simulation));
    const events = simulation.journal.all();
    const starts = events.filter((event) => event.type === ANOMALY_START);
    const ends = events.filter((event) => event.type === ANOMALY_END);
    expect(starts.length).toBeGreaterThan(0);
    const regionsPerYear = starts.map((start) => `${start.tick} ${start.place?.label}`);
    expect(new Set(regionsPerYear).size).toBe(regionsPerYear.length);
    for (const start of starts) {
      expect(start.place?.label).toBeTruthy();
      expect(start.text).toContain(start.place?.label ?? '?');
    }
    for (const end of ends) {
      const cause = simulation.journal.get(end.causes[0] ?? -1);
      expect(cause?.type).toBe(ANOMALY_START);
      expect(cause?.details['anomaly']).toBe(end.details['anomaly']);
      expect(end.tick - (cause?.tick ?? 0)).toBe(year(simulation));
    }
  });

  it('change the climate of their region', () => {
    const simulation = new Simulation(7, testData(1));
    const drought = simulation.climate.anomalies.find((anomaly) => simulation.data.climate.anomalies.types[anomaly.type]?.id === 'drought');
    expect(drought).toBeDefined();
    if (!drought) return;
    const i = Math.round(drought.y) * SIZE + Math.round(drought.x);
    expect(simulation.climate.anomalyIndex[i]).toBeGreaterThan(0);
    const calm = new Simulation(7, testData(0));
    expect(simulation.climate.humidityAt(i)).toBeLessThan(calm.climate.humidityAt(i) * 0.7);
  });

  it('never happen when their probability is 0', () => {
    const simulation = new Simulation(7, testData(0));
    simulation.step(3 * year(simulation));
    expect(simulation.journal.size).toBe(0);
  });
});

function year(simulation: Simulation): number {
  return simulation.data.time.ticksPerDay * daysPerYear(simulation.data.time);
}
