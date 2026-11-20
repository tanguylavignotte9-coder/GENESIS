import { appendColumns, grownTo } from '../../../core/columns';
import type { Journal } from '../../../core/journal';
import type { Rng } from '../../../core/rng';
import type { TimeParams } from '../../../core/time-params';
import type { World } from '../../world/world';
import type { IndividualsSystem } from '../individuals-system';
import type { HumanParams } from '../params';
import type { People } from '../people';
import { ambitionTarget, updateAmbitions, wants } from './ambitions';
import { talk } from './conversation';
import { fadeMemories, liveFeelings, memoryWeight, remember, stir } from './feelings';
import { attracted, learnDeath, single } from './milestones';
import { discoverDeaths, forgetNews, fuzzyTile, learn, NewsBoard, witness, type Fact } from './news';
import { CONVERSATIONS, EMOTIONS, MEMORY_KINDS, type ConversationKind, type MemoryKind, type SocialParams } from './params';
import { affectionFor, feel, relationSlot, wearRelations } from './relations';
import { EMOTION_INDEX, Kin, SocialState } from './state';
export { SOCIAL_INPUTS } from './inputs';

const FULL = 100;
const NEUTRAL_TRAIT = 0.5;



/** Who one would talk to (one per kind of conversation) or give to, found when thinking. */
const CANDIDATE_KINDS = CONVERSATIONS.length + 1;
const GIVE = CONVERSATIONS.length;

/**
 * Social life of the humans (step 7): relations, emotions, memories, conversations, limited
 * knowledge carried by word of mouth, sharing and ambitions. Owned by the individuals system:
 * it reads and writes only the people's social data (and their traits, which great events shape).
 */
export class SocialLife {
  readonly state: SocialState;
  readonly news = new NewsBoard();
  readonly people: People;
  readonly world: World;
  readonly size: number;
  /** Emotion index of each memory kind. */
  readonly memoryEmotion: Int8Array;
  private readonly traitIndices = new Map<string, number>();
  private candidates: Int32Array;
  /** Item a person would give (-1 = food). */
  private giftItem: Int32Array;
  /** What the person saw around at the last look (inputs after the emotions), and when (step). */
  private seen: Float32Array;
  private seenAt: Int32Array;
  day = 0;
  tick = 0;
  /** Today's conversations, as pairs (speaker, listener): what the ideas system reads (teaching, influence). */
  readonly talkLog: number[] = [];
  /** Pairs who quarrelled since the conflict system last looked (a quarrel may turn to blows). */
  readonly quarrelLog: number[] = [];

  constructor(
    private readonly sys: IndividualsSystem,
    public params: SocialParams,
    readonly time: TimeParams,
    readonly rng: Rng,
    readonly journal: Journal,
  ) {
    this.people = sys.people;
    this.world = sys.world;
    this.size = sys.size;
    const people = sys.people;
    this.state = new SocialState(people.count, people.traitCount, params.relations.slots, params.memories.slots, params.news.slots);
    this.memoryEmotion = Int8Array.from(MEMORY_KINDS, (kind) => EMOTION_INDEX[params.memories.kinds[kind].emotion]);
    this.candidates = new Int32Array(people.count * CANDIDATE_KINDS).fill(-1);
    this.giftItem = new Int32Array(people.count).fill(-1);
    this.seen = new Float32Array(people.count * SEEN_VALUES);
    this.seenAt = new Int32Array(people.count).fill(NEVER);
    this.refreshParams(params);
    this.state.birthTraits.set(people.traits);
    for (let p = 0; p < people.count; p++) this.state.sameSex[p] = rng.nextFloat() < params.couples.sameSexShare ? 1 : 0;
    this.knitTribes();
  }

  /** Political ambitions are judged by the groups system (step 9). */
  stillWantsPower(person: number, id: string): boolean {
    return this.sys.groups?.stillWants(person, id) ?? false;
  }

  /** Room for the people born since (the arrays grow with the population). */
  grow(): void {
    const capacity = this.people.capacity;
    if (this.seenAt.length >= capacity) return;
    const s = this.state;
    appendColumns(s, new SocialState(capacity - s.count, this.people.traitCount, s.relationSlots, s.memorySlots, s.newsSlots));
    s.count = capacity;
    this.candidates = grownTo(this.candidates, capacity * CANDIDATE_KINDS, -1);
    this.giftItem = grownTo(this.giftItem, capacity, -1);
    this.seen = grownTo(this.seen, capacity * SEEN_VALUES, 0);
    this.seenAt = grownTo(this.seenAt, capacity, NEVER);
  }

  get humanParams(): HumanParams {
    return this.sys.params;
  }

  refreshParams(params: SocialParams): void {
    this.params = params;
    this.traitIndices.clear();
    this.sys.params.traits.forEach((trait, t) => this.traitIndices.set(trait.id, t));
    this.memoryEmotion.set(MEMORY_KINDS.map((kind) => EMOTION_INDEX[params.memories.kinds[kind].emotion]));
  }

  // ----- facts about people ----------------------------------------------------------------

  alive(person: number): boolean {
    return person >= 0 && this.people.alive[person] === 1;
  }

  name(person: number): string {
    return this.people.names[person] ?? '?';
  }

  female(person: number): boolean {
    return this.people.female[person] === 1;
  }

  tileOf(person: number): number {
    return this.sys.tileOf(person);
  }

  traitIndex(id: string): number {
    return this.traitIndices.get(id) ?? -1;
  }

  /** Trait value (0..1) by id; neutral if the trait does not exist. */
  trait(person: number, id: string): number {
    const t = this.traitIndex(id);
    return t < 0 ? NEUTRAL_TRAIT : this.people.trait(person, t);
  }

  memoryKindOf(slot: number): MemoryKind | undefined {
    return MEMORY_KINDS[this.state.memKind[slot]!];
  }

  /** Family ties of `person` with `other` (bits of Kin). */
  kinOf(person: number, other: number): number {
    const { people } = this;
    let kin = 0;
    if (person < 0 || other < 0 || person === other) return 0;
    if (people.spouse[person] === other) kin |= Kin.Spouse;
    if (people.mother[person] === other || people.father[person] === other) kin |= Kin.Parent;
    if (people.mother[other] === person || people.father[other] === person) kin |= Kin.Child;
    const sameMother = people.mother[person]! >= 0 && people.mother[person] === people.mother[other];
    const sameFather = people.father[person]! >= 0 && people.father[person] === people.father[other];
    if (sameMother || sameFather) kin |= Kin.Sibling;
    return kin;
  }

  /** Living people within `radius` tiles (real distance) of the point (x, y), in decimal tiles. */
  forEachNear(x: number, y: number, radius: number, visit: (person: number) => void): void {
    const { people } = this;
    this.sys.grid.forEachNear(x, y, radius, (person) => {
      if (people.alive[person] !== 1) return;
      if (people.distanceTo(person, x, y) <= radius) visit(person);
    });
  }

  knowsDeathOf(person: number, dead: number): boolean {
    const s = this.state;
    for (let k = person * s.newsSlots; k < (person + 1) * s.newsSlots; k++) {
      const fact = this.news.facts.get(s.newsFact[k]!);
      if (fact && fact.kind === 'death' && fact.subject === dead) return true;
    }
    return false;
  }

  griefFor(person: number, dead: number): number {
    return memoryWeight(this, person, 'grief', dead);
  }

  /** Journal event of the strongest grief of a person (-1 if none). */
  griefEvent(person: number): number {
    const s = this.state;
    const grief = MEMORY_KINDS.indexOf('grief');
    let best = -1;
    let weight = 0;
    for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) {
      if (s.memKind[k] === grief && s.memWeight[k]! > weight) {
        weight = s.memWeight[k]!;
        best = s.memEvent[k]!;
      }
    }
    return best;
  }

  // ----- the starting tribes ---------------------------------------------------------------

  /** Members of a starting tribe know each other: family ties, and feelings drawn around a mean. */
  private knitTribes(): void {
    const { rng, params } = this;
    const { startingMean, startingSpread } = params.relations;
    for (let camp = 0; camp < this.sys.camps.length; camp++) {
      const members = this.sys.campMembers(camp);
      for (const p of members) {
        const others = members.filter((q) => q !== p);
        // Family first, then the others in a random order (only the relations that count are kept).
        const kin = others.filter((q) => this.kinOf(p, q) !== 0);
        const rest = others.filter((q) => this.kinOf(p, q) === 0);
        for (let k = rest.length - 1; k > 0; k--) {
          const j = rng.nextIntInclusive(0, k);
          [rest[k], rest[j]] = [rest[j]!, rest[k]!];
        }
        for (const q of [...kin, ...rest].slice(0, params.relations.slots)) {
          const draw = (): number => startingMean + startingSpread * (rng.nextFloat() + rng.nextFloat() - 1);
          feel(this, p, q, { affection: draw(), trust: draw(), respect: draw() }, 'tribe');
        }
      }
    }
  }

  // ----- the passing of time ---------------------------------------------------------------

  /**
   * Every hour of a person: emotions calm down, loneliness grows, hunger may leave a mark, and a
   * body lying near the way is found.
   */
  liveHour(person: number, asleep: boolean): void {
    liveFeelings(this, person, 1, !asleep, this.trait(person, 'sociability'));
    if (this.people.hunger[person]! >= FULL) remember(this, person, 'starving', -1, 1);
    if (this.news.unfoundDeaths.length === 0) return;
    discoverDeaths(this, person, this.people.px[person]!, this.people.py[person]!, this.sys.params.body.perceptionTiles);
  }

  /** Every day: relations wear, memories fade, old news is forgotten, ambitions are reconsidered. */
  newDay(day: number): void {
    this.day = day;
    // Yesterday's conversations were read by the ideas system at the turn of the day.
    this.talkLog.length = 0;
    wearRelations(this);
    fadeMemories(this);
    forgetNews(this);
    for (let p = 0; p < this.people.count; p++) if (this.alive(p)) updateAmbitions(this, p);
  }

  // ----- what happens to people ------------------------------------------------------------

  /** A death: witnesses learn it at once; the body can be found for a while; talks with the dead end. */
  onDeath(person: number, cause: number, event: number): void {
    const fact = this.news.add('death', person, -1, this.tileOf(person), this.day, event, cause);
    this.news.unfoundDeaths.push(fact);
    witness(this, fact, this.people.px[person]!, this.people.py[person]!);
    const s = this.state;
    s.talkWith[person] = -1;
    for (let p = 0; p < this.people.count; p++) if (s.talkWith[p] === person) s.talkWith[p] = -1;
  }

  /** Attacked by a predator and alive: fear, a lasting memory, and a danger others may hear of. */
  onAttacked(person: number): void {
    remember(this, person, 'attacked', -1, 1);
    const fact = this.news.add('danger', person, -1, this.tileOf(person), this.day, -1);
    learn(this, person, fact, 0, -1);
    witness(this, fact, this.people.px[person]!, this.people.py[person]!);
  }

  /** A predator seen: a danger worth telling (once a day at most per person). */
  onThreat(person: number, x: number, y: number): void {
    const s = this.state;
    if (s.lastDangerNewsDay[person] === this.day) return;
    s.lastDangerNewsDay[person] = this.day;
    const fact = this.news.add('danger', person, -1, y * this.size + x, this.day, -1);
    learn(this, person, fact, 0, -1);
  }

  /** Food found far from the camp: a place worth telling (once a day at most per person). */
  onFoodFound(person: number, tile: number, distance: number): void {
    const s = this.state;
    if (distance < this.params.news.foodFactMinTiles || s.lastFoodNewsDay[person] === this.day) return;
    s.lastFoodNewsDay[person] = this.day;
    const fact = this.news.add('food', person, -1, tile, this.day, -1);
    fact.knowers++;
    // The finder keeps the news to tell it (the place is already in their own memory).
    const slot = this.freeNewsSlot(person);
    if (slot >= 0) {
      s.newsFact[slot] = fact.id;
      s.newsDetail[slot] = 0;
    } else fact.knowers--;
    if (fact.knowers <= 0) this.news.facts.delete(fact.id);
  }

  private freeNewsSlot(person: number): number {
    const s = this.state;
    for (let k = person * s.newsSlots; k < (person + 1) * s.newsSlots; k++) if (s.newsFact[k]! < 0) return k;
    return -1;
  }

  /** What learning a fact brings about (called by the news). */
  onLearn(person: number, fact: Fact, detail: number, from: number): void {
    switch (fact.kind) {
      case 'death':
        learnDeath(this, person, fact, from);
        return;
      case 'couple':
        for (const [loved, partner] of [
          [fact.subject, fact.other],
          [fact.other, fact.subject],
        ] as const) {
          if (single(this, person) && attracted(this, person, loved) && affectionFor(this, person, loved) >= this.params.couples.acceptAffection) {
            remember(this, person, 'jealous', partner, 1, fact.event);
          }
        }
        return;
      case 'food':
        if (from >= 0) this.sys.remember(person, 'food', fuzzyTile(this, fact.tile, detail));
        return;
      case 'danger':
        remember(this, person, 'danger', -1, detail === 0 ? 1 : 1 / (1 + detail));
        return;
    }
  }

  // ----- the life cycle (step 8) ----------------------------------------------------------

  affectionFor(person: number, other: number): number {
    return affectionFor(this, person, other);
  }

  /** Strength (0..1 of its kind's intensity) of the strongest memory of a kind. */
  memoryOf(person: number, kind: MemoryKind): number {
    return memoryWeight(this, person, kind) / Math.max(1, this.params.memories.kinds[kind].intensity);
  }

  /** Journal event kept with a memory of a kind about `other` (-1 if none). */
  memoryEvent(person: number, kind: MemoryKind, other: number): number {
    const s = this.state;
    const code = MEMORY_KINDS.indexOf(kind);
    for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) if (s.memKind[k] === code && s.memOther[k] === other) return s.memEvent[k]!;
    return -1;
  }

  /** How strongly childhood shapes a personality: a child is marked more, and further from birth. */
  shaping(person: number): { factor: number; extraDrift: number } {
    const life = this.sys.life;
    if (!life.isChild(person)) return NO_SHAPING;
    return { factor: life.params.childhood.shapingFactor, extraDrift: life.params.childhood.extraDrift };
  }

  /** A newborn: its own nature (attraction), its family ties, and the joy of its parents. */
  childBorn(child: number, event: number): void {
    const { people, state: s } = this;
    this.grow();
    const n = people.traitCount;
    s.birthTraits.set(people.traits.subarray(child * n, (child + 1) * n), child * n);
    s.sameSex[child] = this.rng.nextFloat() < this.params.couples.sameSexShare ? 1 : 0;
    for (const parent of [people.mother[child]!, people.father[child]!]) {
      if (!this.alive(parent)) continue;
      relationSlot(this, parent, child, true);
      relationSlot(this, child, parent, true);
      remember(this, parent, 'childBorn', child, 1, event);
    }
    for (const other of this.sys.campMembers(people.camp[child]!)) {
      if (other === child || (this.kinOf(child, other) & Kin.Sibling) === 0) continue;
      relationSlot(this, other, child, true);
      relationSlot(this, child, other, true);
    }
  }

  /** A child lost before (or at) birth: sorrow for the mother and the father. */
  lostBaby(mother: number, father: number, event = -1): void {
    remember(this, mother, 'lostBaby', -1, 1, event);
    if (this.alive(father)) remember(this, father, 'lostBaby', -1, 1, event);
  }

  /** An orphan taken in: gratitude and affection on both sides. */
  adopted(child: number, guardian: number, event: number): void {
    const kin = this.params.relations.kin;
    feel(this, child, guardian, kin.parent, 'adopted', event);
    feel(this, guardian, child, kin.child, 'adopted', event);
    remember(this, child, 'adopted', guardian, 1, event);
  }

  /** Respect for an elder grows with the years. */
  respectElder(person: number, elder: number, gain: number): void {
    feel(this, person, elder, { affection: 0, trust: 0, respect: gain }, 'elder');
  }

  /** Joy, and loneliness eased. */
  cheer(person: number, joy: number, lonelinessRelief: number): void {
    if (joy > 0) stir(this, person, 'joy', joy);
    if (lonelinessRelief > 0) this.state.loneliness[person] = Math.max(0, this.state.loneliness[person]! - lonelinessRelief);
  }

  /** Children who play together grow fond of each other. */
  playedWith(person: number, other: number, affection: number): void {
    feel(this, person, other, { affection, trust: affection / 2, respect: 0 }, 'played');
  }

  // ----- the brain -------------------------------------------------------------------------

  /**
   * What social life brings to a decision (written in `inputs` from `offset`, in the order of
   * SOCIAL_INPUTS), and who one would talk to or give to — among the people one knows nearby.
   */
  fillInputs(person: number, inputs: Float64Array, offset: number): void {
    const s = this.state;
    let k = offset;
    inputs[k++] = s.loneliness[person]! / FULL;
    for (let e = 0; e < EMOTIONS.length; e++) inputs[k++] = s.emotion(person, e) / FULL;
    // Who is around changes slowly: one looks again only after a while.
    const steps = (this.params.scanEveryMinutes / MINUTES_PER_HOUR) * this.sys.params.stepsPerHour;
    if (this.sys.isSleeping(person)) {
      // Asleep, one sees nobody (and looks around again on waking up).
      for (let v = 0; v < SEEN_VALUES; v++) inputs[k++] = 0;
      this.seenAt[person] = NEVER;
      return;
    }
    if (this.seenAt[person] === NEVER || this.sys.step - this.seenAt[person]! >= steps) this.lookAround(person);
    for (let v = 0; v < SEEN_VALUES; v++) inputs[k++] = this.seen[person * SEEN_VALUES + v]!;
  }

  private lookAround(person: number): void {
    const { people, params, state: s } = this;
    this.seenAt[person] = this.sys.step;
    const reach = params.reachTiles;
    const c = person * CANDIDATE_KINDS;
    const best = BEST.fill(0);
    this.candidates.fill(-1, c, c + CANDIDATE_KINDS);
    this.giftItem[person] = -1;
    const esteem = ambitionTarget(this, person, 'regainEsteem');
    const free = single(this, person) && people.ageYears[person]! >= params.couples.minAge;
    const production = this.sys.production;
    const canFeed = production.carriedFood(person) > 0 && people.hunger[person]! < params.sharing.keepHunger;
    const spare = production.spareItem(person);
    let confidantTrust = 0;
    const base = person * s.relationSlots;
    for (let slot = base; slot < base + s.relationSlots; slot++) {
      const other = s.relOther[slot]!;
      if (other < 0 || people.alive[other] !== 1) continue;
      if (people.distance(other, person) > reach) continue;
      if (this.sys.isSleeping(other)) continue;
      const affection = s.affection[slot]!;
      const kin = s.kin[slot]!;
      const chance = this.rng.nextFloat() * params.conversation.partnerRandomness;
      this.consider(c, 0, other, affection + FULL + chance + (other === esteem ? FULL : 0), best);
      if (s.trust[slot]! > confidantTrust) confidantTrust = s.trust[slot]!;
      this.consider(c, 1, other, s.trust[slot]!, best);
      const sad = s.emotion(other, EMOTION_INDEX.sadness) / FULL;
      this.consider(c, 2, other, sad * clamp01((affection + FULL / 5) / FULL), best);
      if (free && (kin & Kin.Spouse) === 0 && affection >= params.couples.courtMinAffection && attracted(this, person, other)) {
        this.consider(c, 3, other, (affection / FULL) * (single(this, other) ? 1 : params.couples.takenTargetFactor), best);
      }
      if (affection < 0) this.consider(c, 4, other, -affection / FULL, best);
      if (canFeed && people.hunger[other]! >= params.sharing.askHunger && production.carriedFood(other) <= 0) {
        const bond = kin & Kin.Child || this.sys.life.state.guardian[other] === person ? 1 : clamp01((Math.max(affection, kin !== 0 ? FULL / 2 : 0) + FULL / 5) / FULL);
        if (this.consider(c, GIVE, other, (people.hunger[other]! / FULL) * bond, best)) this.giftItem[person] = -1;
      } else if (spare >= 0 && this.candidates[c + GIVE]! < 0 && affection >= params.relations.friendAffection && !production.hasItem(other, spare)) {
        if (this.consider(c, GIVE, other, (affection / FULL) * params.sharing.itemGiftWeight, best)) this.giftItem[person] = spare;
      }
    }
    // Lonely with nobody known around: the nearest member of the tribe will do.
    if (this.candidates[c] === -1) {
      const mate = this.sys.nearestTribeMember(person);
      const near = mate >= 0 && people.distance(mate, person) <= reach && !this.sys.isSleeping(mate);
      if (near) this.candidates[c] = mate;
    }
    const seen = this.seen;
    let k = person * SEEN_VALUES;
    seen[k++] = this.candidates[c]! >= 0 ? 1 : 0;
    seen[k++] = clamp01(confidantTrust / FULL);
    seen[k++] = clamp01(best[2]!);
    seen[k++] = clamp01(best[3]!);
    seen[k++] = clamp01(best[4]!);
    seen[k++] = clamp01(best[GIVE]!);
    seen[k++] = wants(this, person, 'makeFriends') ? 1 : 0;
    seen[k++] = wants(this, person, 'findPartner') ? 1 : 0;
    seen[k++] = esteem >= 0 ? 1 : 0;
  }

  private consider(base: number, kind: number, other: number, score: number, best: Float64Array): boolean {
    if (score <= best[kind]!) return false;
    best[kind] = score;
    this.candidates[base + kind] = other;
    return true;
  }

  /** Skill the person wants to master (-1 if none): actions that practise it are preferred. */
  skillAmbition(person: number): number {
    return ambitionTarget(this, person, 'excelSkill');
  }

  // ----- conversations and gifts (carried out by the actions) ------------------------------

  /** Who the person would have this conversation with (found at the last decision), or -1. */
  partnerFor(person: number, kind: ConversationKind): number {
    return this.candidates[person * CANDIDATE_KINDS + CONVERSATIONS.indexOf(kind)]!;
  }

  giftTarget(person: number): number {
    return this.candidates[person * CANDIDATE_KINDS + GIVE]!;
  }

  talk(speaker: number, listener: number, kind: ConversationKind): void {
    relationSlot(this, speaker, listener, true);
    relationSlot(this, listener, speaker, true);
    talk(this, speaker, listener, kind);
  }

  /** A gift: food (or a spare object) changes hands; the receiver is grateful, the giver glad. */
  give(giver: number, receiver: number): boolean {
    const { sharing } = this.params;
    const production = this.sys.production;
    const item = this.giftItem[giver]!;
    const given = item >= 0 ? production.giveItem(giver, receiver, item) : production.giveFood(giver, receiver, sharing.foodUnitsPerGift);
    if (given <= 0) return false;
    feel(this, receiver, giver, sharing.receiverFeels, item >= 0 ? 'gave' : 'fed');
    if (item < 0) remember(this, receiver, 'fed', giver, 1);
    stir(this, giver, 'joy', sharing.giverJoy);
    return true;
  }
}

const BEST = new Float64Array(CANDIDATE_KINDS);
const NO_SHAPING = { factor: 1, extraDrift: 0 };
/** Inputs that come from looking around (SOCIAL_INPUTS after loneliness and the emotions). */
const SEEN_VALUES = 9;
const NEVER = -1;
const MINUTES_PER_HOUR = 60;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
