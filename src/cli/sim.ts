/**
 * Headless simulation (Node, no window):
 *   npm run sim -- --seed 42 --years 100   run the simulation and print a summary (abnormal years…)
 *   npm run sim -- --seed 42 --world       generate a world and print its statistics
 *   npm run sim -- --seed 42 --load-test   time a game day with 100 … 5 000 humans (several camps)
 *   npm run sim -- --seed 42 --years 200 --ecosystem   plants and animals alone, census every 10 years
 *   npm run sim -- --seed 42 --years 50 --save an50      run, then save the world (sauvegardes/an50.genesis)
 *   npm run sim -- --load an50 --years 30                go on from a save (its own seed and variables)
 */
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { readSaveFile, SAVE_EXTENSION, writeSaveFile } from '../main/save-store';
import { loadWorld, saveWorld } from '../sim/core/save/save';
import type { Simulation } from '../sim/core/simulation';
import { parseArgs } from 'node:util';
import { loadGameData, type GameData } from '../sim/core/game-data';
import { isValidSeed, Rng } from '../sim/core/rng';
import { runHeadless } from '../sim/headless';
import { runEcosystem } from '../sim/ecosystem-report';
import { computeWorldStats } from '../sim/systems/world/stats';
import { generateWorld } from '../sim/systems/world/world';
import { BUDGET_SHARE, ECOSYSTEM_WARMUP_YEARS, LOAD_TEST_DAYS, runLoadTest, X500_DAY_BUDGET_MS } from './load-test';

const DEFAULT_SEED = 42;
const DEFAULT_YEARS = 1;
const MS_PER_SECOND = 1000;
const PERCENT = 100;

const fr = new Intl.NumberFormat('fr-FR');
const fr1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
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

/** "an50" → sauvegardes/an50.genesis; a path with a folder or an extension is kept as it is. */
function savePath(name: string): string {
  const withExtension = path.extname(name) === '' ? `${name}${SAVE_EXTENSION}` : name;
  return path.dirname(name) === '.' ? path.join('sauvegardes', withExtension) : withExtension;
}

async function loadSave(name: string): Promise<Simulation> {
  const file = savePath(name);
  const startedAt = performance.now();
  const { body } = await readSaveFile(file);
  const { simulation } = loadWorld(body);
  console.log(`Sauvegarde chargée : ${file} (${seconds(startedAt).toFixed(1)} s)`);
  return simulation;
}

async function writeSave(name: string, simulation: Simulation): Promise<void> {
  const file = savePath(name);
  const startedAt = performance.now();
  const { meta, body } = saveWorld(simulation);
  await writeSaveFile(file, { ...meta, label: path.basename(file, SAVE_EXTENSION), savedAt: new Date().toISOString() }, body);
  console.log(`Monde sauvegardé : ${file} (${meta.date}, ${meta.population} humains, ${seconds(startedAt).toFixed(1)} s)`);
}

function printRun(seed: number, years: number, data: GameData, from?: Simulation, onDone?: (simulation: Simulation) => void): void {
  const startedAt = performance.now();
  const report = runHeadless(seed, years, data, () => performance.now(), { stopWhenExtinct: true, from, onDone });
  const duration = seconds(startedAt);
  const { anomalies } = report;
  const totalAnimals = report.animals.reduce((sum, line) => sum + line.end, 0);
  const totalPlants = report.plants.reduce((sum, line) => sum + line.count, 0);
  const total = anomalies.lines.length;

  console.log('GENESIS — simulation sans écran');
  console.log(`  Graine                : ${report.seed}`);
  console.log(`  Monde                 : ${report.worldSize} × ${report.worldSize} tuiles, ${report.riverCount} rivières, ${report.lakeCount} lacs`);
  console.log(`  Durée simulée         : ${fr.format(report.years)} an(s) = ${fr.format(report.ticks)} tics`);
  console.log(`  Date finale           : ${report.finalDate}`);
  const h = report.humans;
  const deaths = h.deaths.map((death) => `${fr.format(death.count)} (${death.cause})`).join(', ');
  console.log(`  Humains               : ${fr.format(h.start)} au départ, ${fr.format(h.alive)} en vie (au plus ${fr.format(h.peak)})${h.alive === 0 ? ' · TRIBU ÉTEINTE' : ''}`);
  console.log(`  Naissances            : ${fr.format(h.births)} (+ ${fr.format(h.stillbirths)} mort-nés) · mortalité avant 1 an ${pct.format(h.infantMortality * PERCENT)} %, avant l'âge adulte ${pct.format(h.childMortality * PERCENT)} %`);
  console.log(`  Morts                 : ${deaths || 'aucune'}`);
  console.log(`  Âge moyen au décès    : ${fr1.format(h.adultLifespan)} ans (adultes) · doyen : ${fr1.format(h.oldest)} ans`);
  console.log(`  Épidémies, famines    : ${fr.format(h.epidemics)} épidémie(s), ${fr.format(h.famines)} famine(s), ${fr.format(h.adoptions)} orphelin(s) recueilli(s)`);
  console.log(`  Population (tous les 10 ans) : ${h.timeline.map((point) => `an ${point.year} : ${point.alive}`).join(' · ')}`);
  console.log(`  Calcul par jour (tous les 10 ans) : ${h.timeline.map((point) => `${point.msPerDay.toFixed(0)} ms`).join(' · ')}`);
  const lifeShown = h.lifeEvents.length <= MAX_LISTED_ANOMALIES ? h.lifeEvents : [...h.lifeEvents.slice(0, MAX_LISTED_ANOMALIES / 2), '…', ...h.lifeEvents.slice(-MAX_LISTED_ANOMALIES / 2)];
  console.log(`  Cycle de vie (journal) : ${fr.format(h.lifeEvents.length)} événement(s) (épidémies, famines, orphelins recueillis)`);
  for (const line of lifeShown) console.log(`    ${line}`);
  const work = report.production;
  const stock = work.stock.map((line) => `${line.name} ${fr1.format(line.qty)}`).join(', ');
  console.log(`  Stock du camp (fin)   : ${stock || 'vide'}`);
  const built = work.built.map((line) => `${fr.format(line.count)} ${line.name.toLowerCase()}`).join(', ');
  console.log(`  Bâtiments construits  : ${built || 'aucun'}${work.openSites > 0 ? ` (+ ${work.openSites} chantier(s) en cours)` : ''}`);
  console.log(`  Déplacements du camp  : ${fr.format(work.campMoves.length)}`);
  for (const line of work.campMoves) console.log(`    ${line}`);
  console.log(`  Premiers objets       : ${fr.format(work.firstItems.length)}`);
  for (const line of work.firstItems) console.log(`    ${line}`);
  console.log(`  Vie sociale           : ${fr.format(work.social.length)} événement(s) (couples, grandes amitiés, brouilles, séparations, deuils)`);
  const shown = work.social.length <= MAX_LISTED_ANOMALIES ? work.social : [...work.social.slice(0, MAX_LISTED_ANOMALIES / 2), '…', ...work.social.slice(-MAX_LISTED_ANOMALIES / 2)];
  for (const line of shown) console.log(`    ${line}`);
  const g = report.groups;
  const c = g.counts;
  console.log(`  Groupes               : ${fr.format(g.tribesAlive)} tribu(s) en vie (${fr.format(g.tribesEver)} au total), ${fr.format(g.clansEver)} clan(s) formé(s)`);
  console.log(`  Régimes apparus       : ${g.regimes.map((regime) => `${regime.name} (${regime.groups})`).join(', ') || 'aucun'}`);
  console.log(`  Vie politique         : ${c.leader} désignation(s), ${c.regime} changement(s) de régime, ${c.contested} contestation(s), ${c.overthrown} renversement(s), ${c.succession} crise(s) de succession, ${c.scission} scission(s), ${c.fusion} fusion(s), ${c.alliance} alliance(s), ${c.betrayal} départ(s) vers une autre tribu, ${c.contact} rencontre(s), ${c.move} déplacement(s), ${c.rule} règle(s), ${c.strategy} stratégie(s)`);
  const politics = g.events.length <= MAX_LISTED_ANOMALIES ? g.events : [...g.events.slice(0, MAX_LISTED_ANOMALIES / 2), '…', ...g.events.slice(-MAX_LISTED_ANOMALIES / 2)];
  for (const line of politics) console.log(`    ${line}`);
  const i = report.ideas;
  console.log(`  Idées                 : ${i.discoveries} découverte(s), ${i.lost} savoir(s) perdu(s) ; cultures ${i.cultures.alive}/${i.cultures.ever}, langues ${i.languages.alive}/${i.languages.ever}, religions ${i.religions.alive}/${i.religions.ever} (vivantes/apparues) ; biens d’échange : ${i.currencies.join(', ') || 'aucun'} ; ${i.places} lieu(x) nommé(s)`);
  console.log(`  Savoirs portés (fin)  : ${i.knowledgeKnown.join(', ') || 'aucun'}`);
  const ideaLines = i.events.length <= MAX_LISTED_ANOMALIES * 2 ? i.events : [...i.events.slice(0, MAX_LISTED_ANOMALIES), '…', ...i.events.slice(-MAX_LISTED_ANOMALIES)];
  for (const line of ideaLines) console.log(`    ${line}`);
  console.log(`  Animaux               : ${fr.format(totalAnimals)} (début → fin, minimum–maximum observés)`);
  for (const line of report.animals) {
    console.log(`    ${line.name.padEnd(18)} ${fr.format(line.start).padStart(6)} → ${fr.format(line.end).padStart(6)}   (${fr.format(line.min)}–${fr.format(line.max)})`);
  }
  console.log(`  Plantes               : ${fr.format(totalPlants)}`);
  for (const line of report.plants) console.log(`    ${line.name.padEnd(18)} ${fr.format(line.count).padStart(8)}`);
  const events = report.faunaEvents;
  console.log(`  Faune (journal)       : ${fr.format(events.migrations)} grandes migrations, ${fr.format(events.extinctions)} disparitions locales, ${fr.format(events.collapses)} effondrements`);
  for (const example of events.examples) console.log(`    ${example}`);
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
  console.log(`  Temps moyen d'un jour : ${report.msPerDay.toFixed(1)} ms (${fr.format(report.humans.start)} humains au départ, ${fr.format(report.humans.alive)} à la fin, ${fr.format(totalAnimals)} animaux, ${fr.format(totalPlants)} plantes)`);
}

function printLoadTest(seed: number, data: GameData): void {
  console.log('GENESIS — test de charge (humains, faune et flore, carte complète)');
  console.log(`  Graine : ${seed} · faune et flore mises en route pendant ${ECOSYSTEM_WARMUP_YEARS} ans, puis ${LOAD_TEST_DAYS} jours de jeu mesurés par palier`);
  const result = runLoadTest(seed, data, (step) => {
    const share = Math.round(step.x500Share * PERCENT);
    console.log(`  ${fr.format(step.humans).padStart(6)} humains (${step.camps} camps) : ${step.msPerDay.toFixed(0).padStart(5)} ms par jour de jeu (${share} % du temps disponible en x500)`);
  });
  const budget = X500_DAY_BUDGET_MS * BUDGET_SHARE;
  console.log(`  Plafond conseillé en x500 : environ ${fr.format(result.advisedHumans)} humains (un jour de jeu en moins de ${budget.toFixed(0)} ms, soit ${BUDGET_SHARE * PERCENT} % de 0,96 s)`);
}

/** Years between two censuses of the ecosystem report. */
const ECOSYSTEM_EVERY_YEARS = 10;

function printEcosystem(seed: number, years: number, data: GameData, from?: Simulation, onDone?: (simulation: Simulation) => void): void {
  const startedAt = performance.now();
  const report = runEcosystem(seed, years, ECOSYSTEM_EVERY_YEARS, data, () => performance.now(), { from, onDone });
  console.log('GENESIS — écosystème seul (faune et flore, sans humains)');
  console.log(`  Graine : ${seed} · ${years} ans · recensement tous les ${ECOSYSTEM_EVERY_YEARS} ans`);
  const header = report.samples.map((s) => `an ${s.year}`.padStart(8)).join('');
  console.log(`  Animaux${' '.repeat(12)}${header}`);
  report.animalNames.forEach((name, k) => console.log(`    ${name.padEnd(17)}${report.samples.map((s) => fr.format(s.animals[k]!).padStart(8)).join('')}`));
  console.log('  Causes de mort des animaux sur la période :');
  report.animalNames.forEach((name, k) => {
    const deaths = report.deaths[k]!;
    const total = deaths.reduce((a, b) => a + b, 0);
    const parts = report.causeNames.flatMap((cause, c) => (deaths[c]! > 0 ? [`${cause} ${Math.round((deaths[c]! / total) * PERCENT)} %`] : []));
    console.log(`    ${name.padEnd(17)}${fr.format(total).padStart(8)} morts : ${parts.join(', ')}`);
  });
  console.log(`  Plantes${' '.repeat(12)}${header}`);
  report.plantNames.forEach((name, k) => console.log(`    ${name.padEnd(17)}${report.samples.map((s) => fr.format(s.plants[k]!).padStart(8)).join('')}`));
  console.log(`  Temps moyen d'un jour : ${report.msPerDay.toFixed(1)} ms · durée totale ${seconds(startedAt).toFixed(0)} s`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string' },
      years: { type: 'string' },
      world: { type: 'boolean' },
      'load-test': { type: 'boolean' },
      ecosystem: { type: 'boolean' },
      save: { type: 'string' },
      load: { type: 'string' },
    },
  });
  const seed = parseIntegerOption('seed', values.seed, DEFAULT_SEED);
  if (!isValidSeed(seed)) throw new Error(`La graine doit être comprise entre 0 et 4294967295 (reçu : ${seed}).`);
  const data = loadGameData();
  if (values['load-test']) printLoadTest(seed, data);
  else if (values.world) printWorld(seed, data);
  else {
    const from = values.load === undefined ? undefined : await loadSave(values.load);
    let done: Simulation | undefined;
    const keep = (simulation: Simulation): void => {
      done = simulation;
    };
    const years = parseIntegerOption('years', values.years, DEFAULT_YEARS);
    if (values.ecosystem) printEcosystem(seed, years, data, from, keep);
    else printRun(seed, years, data, from, keep);
    if (values.save !== undefined && done) await writeSave(values.save, done);
  }
}

main().catch((error: unknown) => {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
