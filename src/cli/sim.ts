/**
 * Headless simulation (Node, no window):
 *   npm run sim -- --seed 42 --years 100   run the simulation and print a summary (abnormal years…)
 *   npm run sim -- --seed 42 --world       generate a world and print its statistics
 */
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { loadGameData, type GameData } from '../sim/core/game-data';
import { isValidSeed, Rng } from '../sim/core/rng';
import { runHeadless } from '../sim/headless';
import { computeWorldStats } from '../sim/systems/world/stats';
import { generateWorld } from '../sim/systems/world/world';

const DEFAULT_SEED = 42;
const DEFAULT_YEARS = 1;
const MS_PER_SECOND = 1000;
const PERCENT = 100;

const fr = new Intl.NumberFormat('fr-FR');
const pct = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function parseIntegerOption(name: string, text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`L'option --${name} attend un nombre entier positif (reçu : « ${text} »).`);
  }
  return value;
}

function seconds(startedAt: number): number {
  return (performance.now() - startedAt) / MS_PER_SECOND;
}

function printWorld(seed: number, data: GameData): void {
  const startedAt = performance.now();
  const world = generateWorld(data.worldgen, data.biomes, new Rng(seed));
  const duration = seconds(startedAt);
  const stats = computeWorldStats(world, data.worldgen);

  console.log('GENESIS — génération d\'un monde');
  console.log(`  Graine                : ${seed}`);
  console.log(`  Taille                : ${world.size} × ${world.size} tuiles`);
  console.log(`  Terres émergées       : ${pct.format(stats.landShare * PERCENT)} %`);
  console.log(`  Masses de terre       : ${stats.landmasses.continents} continent(s), ${stats.landmasses.islands} île(s)`);
  console.log(`  Rivières              : ${fr.format(stats.riverCount)} (${fr.format(stats.riverTiles)} tuiles)`);
  console.log(`  Lacs                  : ${fr.format(stats.lakeCount)}`);
  console.log('  Biomes (part de la carte) :');
  for (const biome of stats.biomeShares) {
    console.log(`    ${biome.name.padEnd(18)} ${pct.format(biome.share * PERCENT).padStart(5)} %`);
  }
  console.log(`  Temps de génération   : ${duration.toFixed(2)} s`);
}

/** Beyond this many abnormal years, only the first and last ones are listed. */
const MAX_LISTED_ANOMALIES = 30;

function printRun(seed: number, years: number, data: GameData): void {
  const startedAt = performance.now();
  const report = runHeadless(seed, years, data);
  const duration = seconds(startedAt);
  const { anomalies } = report;
  const total = anomalies.lines.length;

  console.log('GENESIS — simulation sans écran');
  console.log(`  Graine                : ${report.seed}`);
  console.log(`  Monde                 : ${report.worldSize} × ${report.worldSize} tuiles, ${report.riverCount} rivières, ${report.lakeCount} lacs`);
  console.log(`  Durée simulée         : ${fr.format(report.years)} an(s) = ${fr.format(report.ticks)} tics`);
  console.log(`  Date finale           : ${report.finalDate}`);
  console.log('  Population            : 0 (les individus arrivent à l\'étape 4)');
  console.log(`  Événements du journal : ${fr.format(report.journalEvents)}`);
  console.log(`  Années anormales      : ${fr.format(total)}`);
  for (const { name, count } of anomalies.countsByType) console.log(`    ${name.padEnd(20)} ${fr.format(count)}`);
  if (total > 0) {
    console.log('  Années anormales survenues :');
    const half = MAX_LISTED_ANOMALIES / 2;
    const listed = total <= MAX_LISTED_ANOMALIES ? anomalies.lines : [...anomalies.lines.slice(0, half), `… (${total - MAX_LISTED_ANOMALIES} autres) …`, ...anomalies.lines.slice(-half)];
    for (const line of listed) console.log(`    ${line}`);
  }
  console.log(`  Empreinte aléatoire   : ${report.randomFingerprint.join(' ')}`);
  console.log(`  Durée de calcul       : ${duration.toFixed(2)} s (génération du monde comprise)`);
}

function main(): void {
  const { values } = parseArgs({
    options: { seed: { type: 'string' }, years: { type: 'string' }, world: { type: 'boolean' } },
  });
  const seed = parseIntegerOption('seed', values.seed, DEFAULT_SEED);
  if (!isValidSeed(seed)) throw new Error(`La graine doit être comprise entre 0 et 4294967295 (reçu : ${seed}).`);
  const data = loadGameData();
  if (values.world) printWorld(seed, data);
  else printRun(seed, parseIntegerOption('years', values.years, DEFAULT_YEARS), data);
}

try {
  main();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
