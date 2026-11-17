/**
 * Headless simulation: `npm run sim -- --seed 42 --years 100`
 * Prints a summary in French. Runs in Node (no window).
 */
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { loadGameData } from '../sim/core/game-data';
import { isValidSeed } from '../sim/core/rng';
import { runHeadless } from '../sim/headless';

const DEFAULT_SEED = 42;
const DEFAULT_YEARS = 1;
const MS_PER_SECOND = 1000;

const fr = new Intl.NumberFormat('fr-FR');

function parseIntegerOption(name: string, text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`L'option --${name} attend un nombre entier positif (reçu : « ${text} »).`);
  }
  return value;
}

function main(): void {
  const { values } = parseArgs({
    options: { seed: { type: 'string' }, years: { type: 'string' } },
  });
  const seed = parseIntegerOption('seed', values.seed, DEFAULT_SEED);
  const years = parseIntegerOption('years', values.years, DEFAULT_YEARS);
  if (!isValidSeed(seed)) throw new Error(`La graine doit être comprise entre 0 et 4294967295 (reçu : ${seed}).`);

  const data = loadGameData();
  const startedAt = performance.now();
  const report = runHeadless(seed, years, data);
  const seconds = (performance.now() - startedAt) / MS_PER_SECOND;
  const ticksPerSecond = seconds > 0 ? Math.round(report.ticks / seconds) : report.ticks;

  console.log('GENESIS — simulation sans écran');
  console.log(`  Graine                : ${report.seed}`);
  console.log(`  Durée simulée         : ${fr.format(report.years)} an(s) = ${fr.format(report.ticks)} tics`);
  console.log(`  Tic final             : ${fr.format(report.finalTick)}`);
  console.log('  Population            : 0 (les individus arrivent à l\'étape 4)');
  console.log('  Événements marquants  : aucun (le journal arrive à l\'étape 2)');
  console.log(`  Empreinte aléatoire   : ${report.randomFingerprint.join(' ')}`);
  console.log(`  Durée de calcul       : ${seconds.toFixed(3)} s (${fr.format(ticksPerSecond)} tics/s)`);
}

try {
  main();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
