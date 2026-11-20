import type { ConversationKind, Feelings } from './params';
import { remember, stir } from './feelings';
import { attracted, checkPair, formCouple, single } from './milestones';
import { tellNews } from './news';
import { affectionFor, feel } from './relations';
import type { SocialLife } from './social-life';

/** Affection at which dislike doubles the chance of friction. */
const DISLIKE_SCALE = 100;
const FULL = 100;

function scaled(f: Feelings, k: number): Feelings {
  return { affection: f.affection * k, trust: f.trust * k, respect: f.respect * k };
}

/**
 * A conversation between `speaker` (who sought it) and `listener`: feelings change on both sides
 * (with the reason remembered), emotions follow, news is exchanged, and a courtship may end in a
 * couple — or in a refusal. No violence, no lies.
 */
export function talk(life: SocialLife, speaker: number, listener: number, kind: ConversationKind): void {
  const params = life.params.conversation;
  const def = params.kinds[kind];
  const s = life.state;
  if (kind !== 'argue') life.talkLog.push(speaker, listener);
  for (const p of [speaker, listener]) {
    s.loneliness[p] = Math.max(0, s.loneliness[p]! - def.lonelinessRelief);
    if (def.joy > 0) stir(life, p, 'joy', def.joy);
  }
  // A good talker (sociable) makes a better impression; like-minded people get on better.
  const affinity = Math.max(0, 1 + params.likeMindedEffect * (1 - 2 * mismatch(life, speaker, listener)));
  const charm = (1 + params.charmEffect * (2 * life.trait(speaker, 'sociability') - 1)) * affinity;
  let listenerFeels = scaled(def.listenerFeels, kind === 'argue' ? 1 : charm);
  const speakerFeels = scaled(def.speakerFeels, kind === 'argue' ? 1 : affinity);
  let event = -1;
  switch (kind) {
    case 'confide':
      stir(life, speaker, 'sadness', -params.confideSadnessRelief);
      stir(life, speaker, 'fear', -params.confideSadnessRelief);
      break;
    case 'console': {
      stir(life, listener, 'sadness', -params.consoleSadnessRelief);
      event = life.griefEvent(listener);
      remember(life, listener, 'comforted', speaker, 1, event);
      break;
    }
    case 'seduce':
      if (!court(life, speaker, listener)) listenerFeels = scaled(def.listenerFeels, 0);
      break;
    case 'argue':
      stir(life, speaker, 'anger', -params.argueAngerRelief);
      stir(life, listener, 'anger', params.argueAngerCaused * (1 + params.temperEffect * (2 * life.trait(listener, 'temper') - 1)));
      remember(life, speaker, 'quarrel', listener, 0.6);
      remember(life, listener, 'quarrel', speaker, 1);
      life.quarrelLog.push(speaker, listener);
      break;
    default:
      break;
  }
  if (kind !== 'argue' && friction(life, speaker, listener)) {
    // The talk turns sour: words exchanged, some anger on both sides (no blows).
    for (const [a, b] of [
      [speaker, listener],
      [listener, speaker],
    ] as const) {
      feel(life, a, b, params.frictionFeels, 'quarrel');
      stir(life, a, 'anger', params.frictionAnger * (1 + params.temperEffect * (2 * life.trait(a, 'temper') - 1)));
    }
    checkPair(life, speaker, listener);
    life.quarrelLog.push(speaker, listener);
    return;
  }
  feel(life, listener, speaker, listenerFeels, def.reason, event);
  if (kind !== 'seduce' || life.people.spouse[speaker] === listener || affectionFor(life, listener, speaker) > 0) {
    feel(life, speaker, listener, speakerFeels, def.reason === 'comforted' ? 'chat' : def.reason, -1);
  }
  if (kind !== 'argue') {
    tellNews(life, speaker, listener);
    tellNews(life, listener, speaker);
  }
  checkPair(life, speaker, listener);
}

/** How different two characters are: mean gap between their traits (0 alike … 1 opposite). */
function mismatch(life: SocialLife, a: number, b: number): number {
  const { people } = life;
  let gap = 0;
  for (let t = 0; t < people.traitCount; t++) gap += Math.abs(people.trait(a, t) - people.trait(b, t));
  return gap / Math.max(1, people.traitCount);
}

/** Does the conversation turn sour? More often between hot-tempered people and people who dislike each other. */
function friction(life: SocialLife, a: number, b: number): boolean {
  const params = life.params.conversation;
  const { people } = life;
  const temper = life.trait(a, 'temper') + life.trait(b, 'temper');
  const dislike = Math.max(0, -affectionFor(life, a, b)) / DISLIKE_SCALE;
  // Hungry people are touchy; very different characters clash.
  const hunger = (people.hunger[a]! + people.hunger[b]!) / (2 * FULL);
  const chance = params.frictionChance * temper * (1 + dislike) * (1 + params.frictionHungerEffect * hunger) * (1 + params.frictionMismatchEffect * mismatch(life, a, b));
  return life.rng.nextFloat() < chance;
}

/**
 * A courtship: if the listener can be drawn to the speaker and is free, the couple forms once the
 * listener's affection is high enough; a listener who cannot be drawn refuses. A partner who sees
 * someone court the loved one grows jealous. Returns false on a refusal.
 */
function court(life: SocialLife, speaker: number, listener: number): boolean {
  const couples = life.params.couples;
  const partner = life.people.spouse[listener]!;
  if (partner >= 0 && partner !== speaker && life.alive(partner)) jealousy(life, partner, speaker, listener);
  if (!attracted(life, listener, speaker) || !single(life, listener)) {
    remember(life, speaker, 'rejected', listener, 1);
    return false;
  }
  if (single(life, speaker) && affectionFor(life, listener, speaker) >= couples.acceptAffection && affectionFor(life, speaker, listener) >= couples.acceptAffection) {
    formCouple(life, speaker, listener);
  }
  return true;
}

/** The partner of someone being courted, if close enough to see it, resents the suitor. */
function jealousy(life: SocialLife, partner: number, suitor: number, loved: number): void {
  const reach = life.params.conversation.chatOverheardJealousyTiles;
  const { people } = life;
  if (people.distance(partner, loved) > reach) return;
  remember(life, partner, 'jealous', suitor, 1);
  feel(life, partner, suitor, life.params.conversation.jealousyFeels, 'jealousy');
  stir(life, partner, 'anger', life.params.conversation.jealousyAnger);
  checkPair(life, partner, suitor);
}
