/**
 * One world of the final validation (Claude Code's tool, not part of the game):
 *   npx tsx src/cli/validate.ts <seed> <years> <out.json>
 * Runs the world from its start and writes the measures of the validation in a JSON file.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadGameData } from '../sim/core/game-data';
import type { Simulation } from '../sim/core/simulation';
import { runHeadless } from '../sim/headless';
import { Family } from '../sim/systems/ideas/idea';

const [seedText, yearsText, out] = process.argv.slice(2);
const seed = Number(seedText ?? 1);
const years = Number(yearsText ?? 100);
const extra: Record<string, unknown> = {};
const report = runHeadless(seed, years, loadGameData(), () => performance.now(), {
  onDone: (sim: Simulation) => {
    const discovered = sim.ideas.ideas.filter((idea) => idea.family === Family.Knowledge && idea.founder >= 0);
    extra['discovered'] = [...new Set(discovered.map((idea) => idea.name))];
    extra['endedTribes'] = sim.groups.groups
      .filter((g) => g.level === 0 && !g.alive)
      .map((g) => ({ name: g.name, members: g.members.length, end: sim.journal.get(g.endEvent)?.text ?? '' }));
  },
});
const deaths = report.humans.deaths.reduce((sum, d) => sum + d.count, 0);
const thirst = report.humans.deaths.find((d) => d.cause === 'soif')?.count ?? 0;
const result = {
  seed,
  years,
  population: report.humans.alive,
  peak: report.humans.peak,
  deaths,
  deathCauses: report.humans.deaths,
  thirstShare: deaths > 0 ? thirst / deaths : 0,
  tribes: report.groups.tribesAlive,
  exileCamps: report.groups.exileCamps,
  tribesEver: report.groups.tribesEver,
  regimes: report.groups.regimes,
  groupCounts: report.groups.counts,
  conflict: report.conflict.counts,
  violentDeaths: report.conflict.violentDeaths,
  ideas: { discoveries: report.ideas.discoveries, cultures: report.ideas.cultures, languages: report.ideas.languages, religions: report.ideas.religions, unbelievers: report.ideas.unbelievers, currencies: report.ideas.currencies, known: report.ideas.knowledgeKnown },
  husbandry: report.husbandry,
  predators: report.predators,
  animals: report.animals.map((a) => ({ name: a.name, start: a.start, end: a.end, min: a.min })),
  msPerDay: report.msPerDay,
  timeline: report.humans.timeline,
  ...extra,
};
writeFileSync(out ?? `validate-${seed}.json`, JSON.stringify(result, null, 1));
console.log(`graine ${seed} : ${report.humans.alive} habitants, ${report.groups.tribesAlive} tribu(s), ${Math.round(report.msPerDay)} ms/jour`);
