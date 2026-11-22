import { dateAtTick, formatDate } from '../../../core/calendar';
import { fillTemplate } from '../../../core/text';
import { directionOf } from '../../world/places';
import { AMBITIONS, EMOTIONS, MEMORY_KINDS } from './params';
import type { Fact } from './news';
import type { SocialLife } from './social-life';
import { AMBITION_SLOTS } from './state';
import { relationReasons, tieName } from './texts';

/** How many relations, memories and news the character sheet shows at most. */
const SHOWN = { relations: 10, memories: 6, news: 6 } as const;

/** Social side of a character sheet (French texts, ready to show). */
export interface SocialDetails {
  emotions: { name: string; value: number }[];
  loneliness: { name: string; value: number };
  relations: { person: number; name: string; tie: string; affection: number; trust: number; respect: number; reasons: string[] }[];
  memories: { text: string; weight: number; date: string }[];
  ambitions: string[];
  news: string[];
}

/** "le nord", "l’est" (with the article). */
function towards(dx: number, dy: number): string {
  const length = Math.max(1, Math.hypot(dx, dy));
  const direction = directionOf(dx / length, dy / length) ?? 'nord';
  return direction.startsWith('e') || direction.startsWith('o') ? `l’${direction}` : `le ${direction}`;
}

function newsText(life: SocialLife, person: number, fact: Fact, detail: number): string {
  const t = life.params.newsTexts;
  let text: string;
  switch (fact.kind) {
    case 'death': {
      const cause = detail === 0 ? (t.causes[fact.cause] ?? '') : t.unknownCause;
      const e = life.female(fact.subject) ? 'e' : '';
      text = fillTemplate(t.death, { nom: life.name(fact.subject), e, cause: fillTemplate(cause, { e }) });
      break;
    }
    case 'couple':
      text = fillTemplate(t.couple, { a: life.name(fact.subject), b: life.name(fact.other) });
      break;
    default: {
      const size = life.size;
      const dx = (fact.tile % size) - life.people.x[person]!;
      const dy = Math.floor(fact.tile / size) - life.people.y[person]!;
      const tiles = Math.round(Math.max(Math.abs(dx), Math.abs(dy)));
      const distance = detail === 0 ? String(tiles) : fillTemplate(t.around, { distance: String(tiles) });
      text = tiles <= 1 ? t.nearby : fillTemplate(fact.kind === 'food' ? t.food : fact.kind === 'water' ? t.water : t.danger, { distance, direction: towards(dx, dy) });
    }
  }
  return text + (detail === 1 ? t.secondHand : detail >= 2 ? t.farHand : '');
}

/** What the character sheet shows of a person's social life. */
export function describeSocial(life: SocialLife, person: number): SocialDetails {
  const s = life.state;
  const params = life.params;
  const emotions = EMOTIONS.map((id, e) => ({ name: params.emotions[id].name, value: s.emotion(person, e) }));
  const relations: SocialDetails['relations'] = [];
  for (let slot = person * s.relationSlots; slot < (person + 1) * s.relationSlots; slot++) {
    const other = s.relOther[slot]!;
    if (other < 0) continue;
    relations.push({
      person: other,
      name: life.name(other) + (life.alive(other) ? '' : ' †'),
      tie: tieName(life, person, other),
      affection: s.affection[slot]!,
      trust: s.trust[slot]!,
      respect: s.respect[slot]!,
      reasons: relationReasons(life, slot).map((reason) => reason.text),
    });
  }
  const strength = (r: (typeof relations)[number]): number => Math.abs(r.affection) + Math.abs(r.trust) / 2 + Math.abs(r.respect) / 2;
  relations.sort((a, b) => strength(b) - strength(a));

  const memories: SocialDetails['memories'] = [];
  for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) {
    const code = s.memKind[k]!;
    if (code < 0) continue;
    const def = params.memories.kinds[MEMORY_KINDS[code]!];
    const other = s.memOther[k]!;
    memories.push({
      text: fillTemplate(def.text, { autre: other >= 0 ? life.name(other) : '', e: life.female(person) ? 'e' : '' }),
      weight: s.memWeight[k]!,
      date: formatDate(dateAtTick(s.memDay[k]! * life.time.ticksPerDay, life.time), life.time),
    });
  }
  memories.sort((a, b) => b.weight - a.weight);

  const ambitions: string[] = [];
  for (let k = person * AMBITION_SLOTS; k < (person + 1) * AMBITION_SLOTS; k++) {
    const code = s.ambition[k]!;
    if (code < 0) continue;
    const id = AMBITIONS[code]!;
    const target = s.ambitionTarget[k]!;
    const about = (id === 'regainEsteem' || id === 'avenge') && target >= 0 ? ` (${life.name(target)})` : id === 'excelSkill' && target >= 0 ? ` (${life.humanParams.skills[target]?.name ?? ''})` : '';
    ambitions.push(params.ambitions.kinds[id].name + about);
  }

  const known: { text: string; value: number }[] = [];
  for (let k = person * s.newsSlots; k < (person + 1) * s.newsSlots; k++) {
    const fact = life.news.facts.get(s.newsFact[k]!);
    if (!fact) continue;
    known.push({ text: newsText(life, person, fact, s.newsDetail[k]!), value: params.news.kinds[fact.kind].importance * 1000 + fact.day });
  }
  known.sort((a, b) => b.value - a.value);

  return {
    emotions,
    loneliness: { name: params.loneliness.name, value: s.loneliness[person]! },
    relations: relations.slice(0, SHOWN.relations),
    memories: memories.slice(0, SHOWN.memories),
    ambitions,
    news: known.slice(0, SHOWN.news).map((item) => item.text),
  };
}
