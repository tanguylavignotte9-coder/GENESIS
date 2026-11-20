import { AMBITIONS, type AmbitionId } from './params';
import { memoryWeight } from './feelings';
import { single } from './milestones';
import { friendCount } from './relations';
import type { SocialLife } from './social-life';
import { AMBITION_SLOTS, Kin } from './state';

const Ambition = Object.fromEntries(AMBITIONS.map((id, k) => [id, k])) as Record<AmbitionId, number>;

/** An ambition one could take up now, with how much one wants it. */
interface Candidate {
  kind: number;
  target: number;
  want: number;
}

/** Trait effects, as for actions: × (1 + strength × (2 × trait − 1)). */
function personality(life: SocialLife, person: number, traits: Record<string, number>): number {
  let factor = 1;
  for (const [id, strength] of Object.entries(traits)) factor *= Math.max(0, 1 + strength * (2 * life.trait(person, id) - 1));
  return factor;
}

/** Is the ambition still alive (not fulfilled, still possible)? */
function stillWanted(life: SocialLife, person: number, kind: number, target: number): boolean {
  const params = life.params.ambitions;
  switch (AMBITIONS[kind]) {
    case 'makeFriends':
      return friendCount(life, person) < params.friendsGoal;
    case 'findPartner':
      return single(life, person);
    case 'excelSkill':
      return target >= 0 && life.people.skill(person, target) < params.masteryLevel;
    case 'regainEsteem': {
      if (target < 0 || !life.alive(target)) return false;
      // Fulfilled once the other likes them again (they can tell), or once the quarrel is forgotten.
      const theirs = life.state.slotOf(target, person);
      const esteem = theirs >= 0 ? life.state.affection[theirs]! : 0;
      return esteem < life.params.relations.friendAffection && memoryWeight(life, person, 'quarrel', target) > 0;
    }
    case 'avenge':
      // Given by the conflict system: lives as long as the one to punish (the killer or one of theirs).
      return target >= 0 && life.alive(target);
    default:
      // Political ambitions (become chief, found a clan or a tribe): judged by the groups system.
      return life.stillWantsPower(person, AMBITIONS[kind]!);
  }
}

/** Ambitions the situation, the memories and the traits make possible now. */
function candidates(life: SocialLife, person: number): Candidate[] {
  const { people } = life;
  const params = life.params.ambitions;
  const kinds = params.kinds;
  const list: Candidate[] = [];
  const add = (id: AmbitionId, target: number): void => {
    const want = kinds[id].weight * personality(life, person, kinds[id].traits);
    if (want > 0) list.push({ kind: Ambition[id], target, want });
  };
  if (friendCount(life, person) <= params.lonelyFriends) add('makeFriends', -1);
  if (people.ageYears[person]! >= life.params.couples.minAge && single(life, person)) add('findPartner', -1);
  const trade = people.trade(person, life.humanParams.skillLearning.professionMinHours);
  if (trade >= 0 && people.skill(person, trade) < params.masteryLevel) add('excelSkill', trade);
  // A quarrel with someone who mattered: one wants to be liked again.
  const s = life.state;
  let esteemTarget = -1;
  let strongest = 0;
  for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) {
    if (s.memKind[k]! < 0 || life.memoryKindOf(k) !== 'quarrel') continue;
    const other = s.memOther[k]!;
    const slot = s.slotOf(person, other);
    const mattered = slot >= 0 && (s.peakAffection[slot]! >= life.params.relations.friendAffection || (s.kin[slot]! & ~Kin.Spouse) !== 0);
    if (mattered && life.alive(other) && s.memWeight[k]! > strongest) {
      strongest = s.memWeight[k]!;
      esteemTarget = other;
    }
  }
  if (esteemTarget >= 0) add('regainEsteem', esteemTarget);
  return list;
}

/**
 * Every day: fulfilled or impossible ambitions are dropped; a person without ambition takes up the
 * one they want most among those possible, and may take up another now and then (up to the max).
 */
export function updateAmbitions(life: SocialLife, person: number): void {
  const s = life.state;
  const max = Math.min(AMBITION_SLOTS, life.params.ambitions.max);
  let active = 0;
  for (let k = person * AMBITION_SLOTS; k < (person + 1) * AMBITION_SLOTS; k++) {
    const kind = s.ambition[k]!;
    if (kind < 0) continue;
    if (k - person * AMBITION_SLOTS >= max || !stillWanted(life, person, kind, s.ambitionTarget[k]!)) {
      s.ambition[k] = -1;
      s.ambitionTarget[k] = -1;
    } else active++;
  }
  if (active >= max) return;
  if (active > 0 && life.rng.nextFloat() >= life.params.ambitions.dailyChance) return;
  const options = candidates(life, person).filter((c) => !hasAmbition(life, person, c.kind));
  if (options.length === 0) return;
  // The first ambition is the one wanted most; later ones are drawn in proportion to the wish.
  const chosen = active === 0 ? mostWanted(options) : drawn(life, options);
  for (let k = person * AMBITION_SLOTS; k < person * AMBITION_SLOTS + max; k++) {
    if (s.ambition[k]! >= 0) continue;
    s.ambition[k] = chosen.kind;
    s.ambitionTarget[k] = chosen.target;
    s.ambitionSince[k] = life.day;
    return;
  }
}

function mostWanted(options: readonly Candidate[]): Candidate {
  let best = options[0]!;
  for (const option of options) if (option.want > best.want) best = option;
  return best;
}

function drawn(life: SocialLife, options: readonly Candidate[]): Candidate {
  const total = options.reduce((sum, option) => sum + option.want, 0);
  let roll = life.rng.nextFloat() * total;
  for (const option of options) {
    roll -= option.want;
    if (roll <= 0) return option;
  }
  return options[options.length - 1]!;
}

/**
 * The groups system gives a person a political ambition born of their situation (a free slot, or in
 * place of the newest other ambition). Returns true if the ambition is new.
 */
export function offerAmbition(life: SocialLife, person: number, id: AmbitionId, target: number): boolean {
  const kind = Ambition[id];
  if (hasAmbition(life, person, kind)) return false;
  const s = life.state;
  const max = Math.min(AMBITION_SLOTS, life.params.ambitions.max);
  const want = life.params.ambitions.kinds[id].weight * personality(life, person, life.params.ambitions.kinds[id].traits);
  if (want <= 0) return false;
  let slot = -1;
  let newest = -1;
  for (let k = person * AMBITION_SLOTS; k < person * AMBITION_SLOTS + max; k++) {
    if (s.ambition[k]! < 0) {
      slot = k;
      break;
    }
    if (s.ambitionSince[k]! > newest) {
      newest = s.ambitionSince[k]!;
      slot = k;
    }
  }
  if (slot < 0) return false;
  s.ambition[slot] = kind;
  s.ambitionTarget[slot] = target;
  s.ambitionSince[slot] = life.day;
  return true;
}

export function hasAmbition(life: SocialLife, person: number, kind: number): boolean {
  const s = life.state;
  for (let k = person * AMBITION_SLOTS; k < (person + 1) * AMBITION_SLOTS; k++) if (s.ambition[k] === kind) return true;
  return false;
}

/** Target of an ambition of the person (-1 if they do not have it). */
export function ambitionTarget(life: SocialLife, person: number, id: AmbitionId): number {
  const s = life.state;
  for (let k = person * AMBITION_SLOTS; k < (person + 1) * AMBITION_SLOTS; k++) if (s.ambition[k] === Ambition[id]) return s.ambitionTarget[k]!;
  return -1;
}

export function wants(life: SocialLife, person: number, id: AmbitionId): boolean {
  return hasAmbition(life, person, Ambition[id]);
}
