import { fillTemplate } from '../../../core/text';
import { REASONS, type KinName } from './params';
import type { SocialLife } from './social-life';
import { Kin, REASONS_PER_RELATION } from './state';

/** "Printemps", "an 3" of an absolute game day. */
function seasonAndYear(life: SocialLife, day: number): { season: string; year: string } {
  const { daysPerSeason, seasons } = life.time;
  const yearDays = daysPerSeason * seasons.length;
  const season = seasons[Math.floor((day % yearDays) / daysPerSeason)] ?? '';
  return { season: season.toLowerCase(), year: String(Math.floor(day / yearDays) + 1) };
}

/** One reason of a relation, as a phrase ("Lo a nourri Ka (hiver de l’an 3)"). */
export function reasonText(life: SocialLife, holder: number, other: number, reasonSlot: number): string {
  const s = life.state;
  const code = s.reasonCode[reasonSlot]!;
  if (code < 0) return '';
  const def = life.params.reasons[REASONS[code]!];
  const text = fillTemplate(def.text, { nom: life.name(holder), autre: life.name(other), e: life.female(holder) ? 'e' : '' });
  if (!def.dated) return text;
  const when = seasonAndYear(life, s.reasonDay[reasonSlot]!);
  return fillTemplate(life.params.texts.dated, { texte: text, saison: when.season, an: when.year });
}

/** The main reasons of a relation, strongest first. */
export function relationReasons(life: SocialLife, slot: number, negative: boolean | null = null): { text: string; event: number }[] {
  const s = life.state;
  const holder = Math.floor(slot / s.relationSlots);
  const other = s.relOther[slot]!;
  const first = slot * REASONS_PER_RELATION;
  const order = Array.from({ length: REASONS_PER_RELATION }, (_, k) => first + k)
    .filter((r) => s.reasonCode[r]! >= 0 && (negative === null || NEGATIVE.has(s.reasonCode[r]!) === negative))
    .sort((a, b) => s.reasonWeight[b]! - s.reasonWeight[a]!);
  return order.map((r) => ({ text: reasonText(life, holder, other, r), event: s.reasonEvent[r]! }));
}

/** Reasons that pull people apart (shown for a falling-out or a separation). */
const NEGATIVE = new Set<number>([REASONS.indexOf('quarrel'), REASONS.indexOf('jealousy')]);

/**
 * The reasons of both sides of a pair, merged (for the journal), and the events behind them:
 * the reasons that bring together, or (`negative`) those that pull apart.
 */
export function pairReasons(life: SocialLife, a: number, b: number, negative = false): { text: string; causes: number[] } {
  const texts: string[] = [];
  const causes: number[] = [];
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const slot = life.state.slotOf(x, y);
    if (slot < 0) continue;
    for (const reason of relationReasons(life, slot, negative)) {
      if (reason.text !== '' && !texts.includes(reason.text)) texts.push(reason.text);
      if (reason.event >= 0 && !causes.includes(reason.event)) causes.push(reason.event);
    }
  }
  return { text: texts.length > 0 ? texts.join(', ') : life.params.texts.noReason, causes };
}

/** How `person` names `other` ("sa mère", "son ami", "une connaissance"). */
export function tieName(life: SocialLife, person: number, other: number): string {
  const names = life.params.kinNames;
  const female = life.female(other);
  const pick = (key: KinName): string => names[key];
  const kin = life.kinOf(person, other);
  if (kin & Kin.Spouse || life.people.spouse[person] === other) return pick(female ? 'wife' : 'husband');
  if (kin & Kin.Parent) return pick(female ? 'mother' : 'father');
  if (kin & Kin.Child) return pick(female ? 'daughter' : 'son');
  if (kin & Kin.Sibling) return pick(female ? 'sister' : 'brother');
  const slot = life.state.slotOf(person, other);
  const affection = slot < 0 ? 0 : life.state.affection[slot]!;
  if (affection >= life.params.relations.friendAffection) return pick(female ? 'friendFemale' : 'friend');
  if (affection <= life.params.relations.rivalAffection) return pick(female ? 'rivalFemale' : 'rival');
  return pick('acquaintance');
}
