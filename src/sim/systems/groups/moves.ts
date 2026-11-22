import { direction, nearWater } from '../individuals/camp-move';
import { DeathCause } from '../individuals/people';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { capitalize } from './membership';
import { recentSufferings } from './power';
import { scission } from './tribes';
import { deciders, recordDecision } from './decisions';
import { listNames, nameOf } from './texts';
import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';

/** A clan refuses to follow when more than this share of its adults do not obey. */
const REFUSE_SHARE = 0.5;
const MAX_CAUSES = 3;

/**
 * How the group's power decides, given who wants it: a band decides together (enough of the adults
 * must want it), a council by the majority of its members, a chief alone.
 */
export function decide(sys: GroupsSystem, group: Group, wants: (person: number) => boolean): boolean {
  const regime = sys.params.regimes[group.regime]!;
  if (group.leaders.length === 0 || regime.decision === 'consensus') {
    const adults = sys.adults(group);
    return adults.length > 0 && adults.filter(wants).length >= sys.humans.params.campMove.consensusShare * adults.length;
  }
  if (regime.decision === 'council') return group.leaders.filter(wants).length * 2 > group.leaders.length;
  return wants(group.leaders[0]!);
}

/**
 * Moving the camp (replaces the consensus of step 6): each adult who must go further and further to
 * find food wants to leave toward a place where food was found, sooner when the tribe suffered
 * (famines, cold, epidemics); the power decides according to the regime. After many deaths, the
 * tribe migrates far away (toward warmth when the cold killed). A clan that does not obey stays.
 */
export function considerMove(sys: GroupsSystem, tribe: Group): void {
  const { humans, params } = sys;
  const camp = humans.camps[tribe.camp];
  if (!camp) return;
  const rules = humans.params.campMove;
  if (sys.day - camp.settledDay < rules.minDaysBetweenMoves) return;
  const people = humans.people;
  const sufferings = recentSufferings(sys, tribe);
  const hardship = Math.min(1, sufferings / (params.factors.sufferingShare * Math.max(1, tribe.members.length)));
  const curiosity = humans.params.traits.findIndex((trait) => trait.id === 'curiosity');
  const adults = sys.adults(tribe);
  // In the cold season of the place, nobody wants to leave the huts and the fire: the cold kills in
  // days, hunger in weeks. But one knows the seasons: before the cold comes, a tribe that knows a
  // warmer place may go and spend the bad season there (in a land that is cold all year round, the
  // warmer months are when one moves).
  const now = humans.climate.temperatureAt(camp.center);
  const coming = humans.climate.temperatureAhead(camp.center, params.moves.foresightDays);
  if (Math.min(now, coming) < params.moves.winterCelsius && Math.min(now, coming) < yearMean(sys, camp.center)) {
    if (coming < now) winterQuarters(sys, tribe, coming);
    return;
  }
  const proposals = new Map<number, number>();
  for (const p of adults) {
    const eager = curiosity >= 0 ? 2 * people.trait(p, curiosity) - 1 : 0;
    const threshold = rules.forageFarTiles * (1 - rules.curiosityEffect * eager) * (1 - params.moves.sufferingEffect * hardship);
    if (people.forageDistance[p]! > threshold && people.farFood[p]! >= 0) proposals.set(p, people.farFood[p]!);
  }
  const migrate = sufferings >= Math.max(1, params.moves.migrateDeathShare * tribe.members.length);
  if (adults.length < rules.minAdults || (proposals.size === 0 && !migrate)) return;
  const wants = (p: number): boolean => proposals.has(p) || (migrate && sys.grievance[p]! > 0);
  const go = decide(sys, tribe, wants);
  const willing = adults.filter(wants).length;
  recordDecision(tribe, {
    day: sys.day,
    title: 'Déplacement du camp',
    chosen: go ? 1 : 0,
    options: [
      { name: 'Rester', score: adults.length - willing, reasons: [`${adults.length - willing} adulte(s) ne veulent pas partir`] },
      {
        name: migrate ? 'Migrer au loin' : 'Déplacer le camp',
        score: willing,
        reasons: [
          `${proposals.size} adulte(s) doivent aller toujours plus loin pour trouver à manger`,
          ...(migrate ? [`${sufferings} mort(s) de faim, de froid ou de maladie cette année`] : []),
          `il faut ${Math.round(humans.params.campMove.consensusShare * 100)} % des adultes pour une décision commune`,
        ],
      },
    ],
    decidedBy: deciders(sys, tribe),
    note: '',
  });
  if (!go) return;
  const destination = migrate ? migrationSite(sys, tribe, [...proposals.values()]) : meetingSite(sys, [...proposals.values()]);
  const site = destination < 0 ? -1 : nearWater(humans, destination, rules.waterMaxTiles);
  if (site < 0) return;
  const dx = (site % humans.size) - camp.centerX;
  const dy = Math.floor(site / humans.size) - camp.centerY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < rules.minMoveTiles) return;
  // Clans that do not follow their leaders stay behind as a tribe of their own.
  const reason = migrate ? params.causeTexts.suffering.replace('{n}', String(sufferings)) : params.causeTexts.farFood;
  const causes = [...tribe.sufferings.slice(-MAX_CAUSES).map((s) => s.event), tribe.leaderEvent];
  for (const clan of sys.childrenOf(tribe).filter((group) => group.level === 1)) {
    const clanAdults = sys.adults(clan);
    const refusing = clanAdults.filter((p) => sys.obeys[p] === 0).length;
    if (clanAdults.length > 0 && refusing > REFUSE_SHARE * clanAdults.length) scission(sys, tribe, clan, params.causeTexts.disobeyed, causes, true);
  }
  const x = site % humans.size;
  const y = Math.floor(site / humans.size);
  const regime = params.regimes[tribe.regime]!;
  const decision =
    tribe.leaders.length === 0 || regime.decision === 'consensus'
      ? params.causeTexts.decisionConsensus
      : regime.decision === 'council'
        ? params.causeTexts.decisionCouncil
        : params.causeTexts.decisionChief.replace('{nom}', listNames(tribe.leaders.map((leader) => nameOf(sys, leader))));
  const text = fillTemplate(migrate ? params.texts.migration : params.texts.move, {
    decision,
    groupe: tribe.name,
    distance: String(Math.round(Math.sqrt(dx * dx + dy * dy))),
    direction: direction(dx, dy),
    lieu: describeLocation(humans.world, x, y),
    raison: reason,
  });
  humans.moveCampTo(tribe.camp, site, sys.tick, capitalize(text), causes, tribe.leaders);
  tribe.settledDay = sys.day;
}

/** Mean temperature of a place over the year (the seasons only). */
function yearMean(sys: GroupsSystem, tile: number): number {
  const climate = sys.humans.climate;
  const days = climate.daysPerYear;
  let sum = 0;
  for (let k = 0; k < YEAR_SAMPLES; k++) sum += climate.temperatureAhead(tile, Math.floor((k * days) / YEAR_SAMPLES));
  return sum / YEAR_SAMPLES;
}
const YEAR_SAMPLES = 4;

/**
 * Winter quarters: the cold season is coming; the adults who know a place clearly warmer at that
 * time of year (a place where they found food or water), within a few days' walk, want to go and
 * spend it there. The power decides according to the regime.
 */
function winterQuarters(sys: GroupsSystem, tribe: Group, coming: number): void {
  const { humans, params } = sys;
  const camp = humans.camps[tribe.camp]!;
  const people = humans.people;
  const size = humans.size;
  const rules = params.moves;
  const known = new Map<number, number>();
  for (const person of sys.adults(tribe)) {
    let best = -1;
    let bestWarmth = coming + rules.winterQuarterGain;
    const look = (tile: number): void => {
      if (tile < 0 || !humans.terrain.walkable(tile) || humans.world.landmasses.idOf[tile] !== humans.world.landmasses.idOf[camp.center]) return;
      const d = Math.hypot((tile % size) - camp.centerX, Math.floor(tile / size) - camp.centerY);
      if (d < humans.params.campMove.minMoveTiles || d > rules.winterQuarterMaxTiles) return;
      const warmth = humans.climate.temperatureAhead(tile, rules.foresightDays);
      if (warmth >= bestWarmth) {
        bestWarmth = warmth;
        best = tile;
      }
    };
    for (let k = person * people.foodSlots; k < (person + 1) * people.foodSlots; k++) look(people.foodMemory[k]!);
    for (let k = person * people.waterSlots; k < (person + 1) * people.waterSlots; k++) look(people.waterMemory[k]!);
    if (best >= 0) known.set(person, best);
  }
  const adults = sys.adults(tribe);
  if (adults.length < humans.params.campMove.minAdults || known.size === 0) return;
  const go = decide(sys, tribe, (p) => known.has(p));
  recordDecision(tribe, {
    day: sys.day,
    title: 'Quartiers d’hiver',
    chosen: go ? 1 : 0,
    options: [
      { name: 'Rester', score: adults.length - known.size, reasons: [`${adults.length - known.size} adulte(s) ne connaissent pas d’endroit plus chaud`] },
      { name: 'Hiverner au chaud', score: known.size, reasons: [`le froid arrive (${Math.round(coming)} °C prévus au camp)`, `${known.size} adulte(s) connaissent un endroit plus chaud`] },
    ],
    decidedBy: deciders(sys, tribe),
    note: '',
  });
  if (!go) return;
  const site = nearWater(humans, meetingSite(sys, [...known.values()]), humans.params.campMove.waterMaxTiles);
  if (site < 0) return;
  const dx = (site % size) - camp.centerX;
  const dy = Math.floor(site / size) - camp.centerY;
  const regime = params.regimes[tribe.regime]!;
  const decision =
    tribe.leaders.length === 0 || regime.decision === 'consensus'
      ? params.causeTexts.decisionConsensus
      : regime.decision === 'council'
        ? params.causeTexts.decisionCouncil
        : params.causeTexts.decisionChief.replace('{nom}', listNames(tribe.leaders.map((leader) => nameOf(sys, leader))));
  const text = fillTemplate(params.texts.move, {
    decision,
    groupe: tribe.name,
    distance: String(Math.round(Math.sqrt(dx * dx + dy * dy))),
    direction: direction(dx, dy),
    lieu: describeLocation(humans.world, site % size, Math.floor(site / size)),
    raison: params.causeTexts.winterQuarters,
  });
  humans.moveCampTo(tribe.camp, site, sys.tick, capitalize(text), [tribe.leaderEvent], tribe.leaders);
  tribe.settledDay = sys.day;
}

/** The proposal closest to the others' mean place. */
function meetingSite(sys: GroupsSystem, proposals: readonly number[]): number {
  const size = sys.humans.size;
  if (proposals.length === 0) return -1;
  const meanX = proposals.reduce((sum, tile) => sum + (tile % size), 0) / proposals.length;
  const meanY = proposals.reduce((sum, tile) => sum + Math.floor(tile / size), 0) / proposals.length;
  let chosen = proposals[0]!;
  let best = Infinity;
  for (const tile of proposals) {
    const d = Math.hypot((tile % size) - meanX, Math.floor(tile / size) - meanY);
    if (d < best) {
      best = d;
      chosen = tile;
    }
  }
  return chosen;
}

/**
 * Far away, but only where someone of the tribe knows there is food (one does not lead the tribe
 * into the unknown): the farthest known place, warmer if the cold killed. -1 if nobody knows any.
 */
function migrationSite(sys: GroupsSystem, tribe: Group, proposals: readonly number[]): number {
  const { humans, params } = sys;
  const camp = humans.camps[tribe.camp]!;
  const size = humans.size;
  const people = humans.people;
  const minTiles = humans.params.campMove.minMoveTiles;
  const coldShare = recentSufferings(sys, tribe, DeathCause.Cold) / Math.max(1, recentSufferings(sys, tribe));
  const candidates = [...proposals];
  for (const person of sys.adults(tribe)) {
    for (let k = person * people.foodSlots; k < (person + 1) * people.foodSlots; k++) if (people.foodMemory[k]! >= 0) candidates.push(people.foodMemory[k]!);
  }
  let best = -1;
  let bestScore = -Infinity;
  const here = humans.climate.temperatureAt(camp.center);
  for (const tile of candidates) {
    const d = Math.hypot((tile % size) - camp.centerX, Math.floor(tile / size) - camp.centerY);
    if (d < minTiles || !humans.terrain.walkable(tile) || humans.world.landmasses.idOf[tile] !== humans.world.landmasses.idOf[camp.center]) continue;
    const warmth = humans.climate.temperatureAt(tile) - here;
    const score = d / params.moves.migrateMinTiles + params.moves.migrateWarmth * coldShare * warmth;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}
