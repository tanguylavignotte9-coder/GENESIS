/**
 * Benchmark of the player's PC: replays the load test with the compiled code and writes a dated
 * report in rapports/ (readable text + JSON), with the processor, cores, memory and system version.
 * Launched by Benchmark-GENESIS.bat, by the workshop button, or `npm run benchmark`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadGameData } from '../sim/core/game-data';
import { BUDGET_SHARE, LOAD_TEST_DAYS, runLoadTest, X500_DAY_BUDGET_MS, type LoadTestResult } from './load-test';

const SEED = 42;
const BYTES_PER_GB = 1024 * 1024 * 1024;
const MS_PER_SECOND = 1000;
const PERCENT = 100;
const REPORT_PREFIX = 'Rapport écrit : ';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

interface Machine {
  system: string;
  systemVersion: string;
  architecture: string;
  processor: string;
  logicalCores: number;
  memoryGb: number;
  nodeVersion: string;
}

function machine(): Machine {
  const cpus = os.cpus();
  return {
    system: os.version(),
    systemVersion: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    processor: cpus[0]?.model.trim() ?? 'inconnu',
    logicalCores: os.availableParallelism(),
    memoryGb: Math.round((os.totalmem() / BYTES_PER_GB) * 10) / 10,
    nodeVersion: process.versions.node,
  };
}

/** "2026-11-18_14-05-09" in local time. */
function stamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}

function textReport(date: Date, pc: Machine, result: LoadTestResult, totalSeconds: number): string {
  const lines = [
    'GENESIS — rapport du banc d’essai',
    `Date : ${date.toLocaleString('fr-FR')}`,
    '',
    'Ordinateur',
    `  Système      : ${pc.system} (${pc.systemVersion}, ${pc.architecture})`,
    `  Processeur   : ${pc.processor}`,
    `  Cœurs        : ${pc.logicalCores} (logiques)`,
    `  Mémoire      : ${fr.format(pc.memoryGb)} Go`,
    `  Node.js      : ${pc.nodeVersion}`,
    '',
    `Test de charge (graine ${result.seed}, carte complète, réglages par défaut, ${result.days} jours de jeu mesurés par palier)`,
    '  Humains | Camps | Animaux | Plantes | Génération | Calcul d’un jour | Part du temps en x500 | Vitesse max. | Mémoire',
  ];
  for (const step of result.steps) {
    lines.push(
      [
        `  ${fr.format(step.humans).padStart(7)}`,
        String(step.camps).padStart(5),
        fr.format(step.animals).padStart(7),
        fr.format(step.plants).padStart(7),
        `${fr.format(step.generationMs / MS_PER_SECOND)} s`.padStart(10),
        `${Math.round(step.msPerDay)} ms`.padStart(16),
        `${Math.round(step.x500Share * PERCENT)} %`.padStart(21),
        `x${Math.round(step.maxSpeed)}`.padStart(12),
        `${Math.round(step.memoryMb)} Mo`.padStart(7),
      ].join(' | '),
    );
  }
  lines.push(
    '',
    `Plafond conseillé en x500 : environ ${fr.format(result.advisedHumans)} humains (un jour de jeu en moins de ${Math.round(X500_DAY_BUDGET_MS * BUDGET_SHARE)} ms, soit ${BUDGET_SHARE * PERCENT} % de 0,96 s).`,
    '« Vitesse max. » : vitesse que la simulation seule pourrait tenir (x1 = 8 minutes réelles par jour de jeu).',
    `Durée totale du banc d’essai : ${fr.format(totalSeconds)} s.`,
    '',
  );
  return lines.join('\n');
}

function main(): void {
  const startedAt = performance.now();
  const date = new Date();
  const pc = machine();
  console.log('GENESIS — banc d’essai');
  console.log(`Ordinateur : ${pc.processor}, ${pc.logicalCores} cœurs, ${fr.format(pc.memoryGb)} Go, ${pc.system}`);
  console.log(`Test de charge : ${LOAD_TEST_DAYS} jours de jeu par palier, de 100 à 5 000 humains (quelques minutes)…`);
  const result = runLoadTest(SEED, loadGameData(), (step) => {
    console.log(`  ${fr.format(step.humans)} humains : ${Math.round(step.msPerDay)} ms par jour de jeu (${Math.round(step.x500Share * PERCENT)} % du temps en x500)`);
  });
  const totalSeconds = (performance.now() - startedAt) / MS_PER_SECOND;
  const dir = path.join(process.cwd(), 'rapports');
  mkdirSync(dir, { recursive: true });
  const base = `banc-essai_${stamp(date)}`;
  const text = textReport(date, pc, result, totalSeconds);
  writeFileSync(path.join(dir, `${base}.txt`), text, 'utf8');
  const json = { date: date.toISOString(), machine: pc, loadTest: result, totalSeconds };
  writeFileSync(path.join(dir, `${base}.json`), `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log('');
  console.log(text);
  console.log(`${REPORT_PREFIX}rapports/${base}.txt`);
  console.log(`${REPORT_PREFIX}rapports/${base}.json`);
}

try {
  main();
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
