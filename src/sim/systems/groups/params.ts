import { choice, DataFileError, flag, int, num, pair, text, validateData, type Schema } from '../../core/data-validation';

/** What a group's situation may favour (each measured 0..1 by the groups system). */
export const FACTORS = ['small', 'large', 'surplus', 'settled', 'elders', 'rivalry', 'scarcity', 'cold', 'territory', 'religion', 'trade', 'privateProperty', 'writing', 'war'] as const;
export type Factor = (typeof FACTORS)[number];
/** What makes someone fit to lead (each measured 0..1 for a candidate). */
export const POWER_FEATURES = ['respect', 'prestige', 'age', 'lineage', 'force', 'wealth'] as const;
export type PowerFeature = (typeof POWER_FEATURES)[number];
/** How the leaders decide for the group. */
export const DECISIONS = ['consensus', 'council', 'chief'] as const;
export const LEVEL_COUNT = 3;
/** Collective duties a leader hands out (match the camp's needs: food, wood, building, crafting). */
export const DUTIES = ['food', 'wood', 'build', 'craft'] as const;

export interface Regime {
  id: string;
  name: string;
  access: string;
  /** Title of a leader ("chef", "cheffe"). */
  title: string;
  titleFemale: string;
  leaders: number;
  decision: (typeof DECISIONS)[number];
  hereditary: boolean;
  levels: number[];
  weights: Record<PowerFeature, number>;
  favors: Partial<Record<Factor, number>>;
  requires: Factor[];
}

export interface RuleOption {
  id: string;
  name: string;
  traits: Record<string, number>;
  favors?: Partial<Record<Factor, number>>;
}

export interface Strategy extends RuleOption {
  food: number;
  wood: number;
  build: number;
  craft: number;
  favors: Partial<Record<Factor, number>>;
}

export interface GroupsParams {
  levels: string[];
  nameTemplates: string[];
  adultAge: number;
  elderAge: number;
  factors: { smallMembers: number; largeMembers: number; surplusDays: number; settledYears: number; elderShare: number; rivalryShare: number; sufferingShare: number };
  regimes: Regime[];
  power: { respectScale: number; prestigeAgeYears: number; forceAgeYears: [number, number]; wealthItems: number; regimeInertia: number; ruleInertia: number };
  property: RuleOption[];
  inheritance: RuleOption[];
  strategies: Strategy[];
  duties: { boost: number; others: number; minSkillHours: number };
  opinion: {
    approvalRate: number;
    respectWeight: number;
    affectionWeight: number;
    trustWeight: number;
    fitWeight: number;
    welfareWeight: number;
    kinBonus: number;
    grievanceHunger: number;
    grievanceCold: number;
    grievanceLoss: number;
    grievanceSick: number;
    grievanceBlockedAmbition: number;
    grievanceDecay: number;
    hungerFloor: number;
    coldFloor: number;
  };
  obedience: { base: number; legitimacy: number; relation: number; traits: Record<string, number> };
  politics: { everyDays: number; gap: number; minLegitimacy: number; actChance: number; ambitionTrait: number; supportShare: number; reformChance: number; failedRespect: number; reviewYears: number; challengerRespect: number };
  clans: { everyDays: number; minFamilies: number; minMembers: number; kinTie: number; friendAffection: number; joinTie: number; foundAmbition: number };
  families: { joinSpouse: boolean };
  scission: { minMembers: number; minAdults: number; approvalBelow: number; chance: number; loyaltyGap: number; loyaltyChance: number; distanceTiles: [number, number]; waterMaxTiles: number };
  fusion: { maxMembers: number; sufferingDeaths: number; minOpinion: number; sizeRatio: number; chance: number };
  betrayal: { approvalBelow: number; minAffection: number; chance: number };
  contact: { meetTiles: number; opinionRate: number; scissionOpinion: number; allianceOpinion: number; allianceChance: number };
  moves: { sufferingEffect: number; migrateDeathShare: number; migrateMinTiles: number; migrateWarmth: number; winterCelsius: number; foresightDays: number };
  texts: Record<(typeof TEXT_KEYS)[number], string>;
  factorTexts: Record<Factor, string>;
  featureTexts: Record<PowerFeature, string>;
  dutyNames: Record<(typeof DUTIES)[number], string>;
  causeTexts: Record<(typeof CAUSE_KEYS)[number], string>;
}

const CAUSE_KEYS = [
  'hunger',
  'cold',
  'disease',
  'noLeader',
  'death',
  'review',
  'discontent',
  'opinion',
  'smallAndSuffering',
  'ties',
  'rejected',
  'disobeyed',
  'decisionConsensus',
  'decisionCouncil',
  'decisionChief',
  'farFood',
  'suffering',
  'goodsCommon',
  'goodsShared',
  'allied',
  'loyalty',
] as const;

const TEXT_KEYS = [
  'founded',
  'clanKin',
  'clanAmbition',
  'familyNew',
  'leaderChosen',
  'leaderInherited',
  'councilChosen',
  'regimeChanged',
  'ruleChanged',
  'strategyChanged',
  'contested',
  'overthrown',
  'reform',
  'scission',
  'scissionStay',
  'fusion',
  'alliance',
  'betrayal',
  'contact',
  'move',
  'migration',
  'dissolved',
] as const;

const TEXT_HELP = 'Texte du journal. Remplacements entre accolades : {nom}, {groupe}, {raison}… (voir le fichier par défaut).';
const fixed = (keys: readonly string[], item: (key: string) => Schema): Schema => ({ kind: 'object', fields: Object.fromEntries(keys.map((key) => [key, item(key)])) });
const optionalFixed = (keys: readonly string[], item: (key: string) => Schema): Schema => ({ kind: 'object', fields: Object.fromEntries(keys.map((key) => [key, item(key)])), optional: keys });
const factorWeights = (what: string): Schema =>
  optionalFixed(FACTORS, (factor) => num(0, 5, `Favorisé par : ${factor}`, `Poids de la situation « ${factor} » (0 à 1, mesurée par le système de groupes) dans le choix ${what}.`, 'poids'));
const traitWeights = (what: string): Schema => ({ kind: 'record', values: num(-3, 3, 'Effet d’un trait', `Effet d’un trait de personnalité du dirigeant sur le choix ${what} (+ : il le préfère).`, 'poids') });

const REGIME_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: text('Identifiant', 'Identifiant du régime (ne pas changer).', 'newWorld'),
    name: text('Nom du régime', 'Nom affiché du régime.'),
    access: text('Accès au pouvoir', 'Comment on y accède (affiché).'),
    title: text('Titre d’un dirigeant', 'Titre d’un dirigeant (homme) dans ce régime.'),
    titleFemale: text('Titre d’une dirigeante', 'Titre d’une dirigeante (femme) dans ce régime.'),
    leaders: int(1, 9, 'Nombre de dirigeants', 'Un chef, ou un conseil de plusieurs membres.', 'personnes'),
    decision: choice(DECISIONS, 'Façon de décider', 'consensus : les adultes tranchent ensemble ; council : la majorité du conseil ; chief : le chef seul.'),
    hereditary: flag('Héréditaire', 'Le pouvoir passe de préférence aux enfants du dirigeant (lignée).'),
    levels: { kind: 'array', minLength: 1, items: int(0, 2, 'Niveau possible', 'Niveaux de groupe où ce régime peut exister (0 tribu, 1 clan, 2 famille).', 'niveau') },
    weights: fixed(POWER_FEATURES, (feature) => num(0, 5, `Accès : ${feature}`, `Poids de « ${feature} » d’un candidat pour accéder au pouvoir dans ce régime.`, 'poids')),
    favors: factorWeights('de ce régime'),
    requires: { kind: 'array', items: choice(FACTORS, 'Condition nécessaire', 'Situation sans laquelle ce régime ne peut pas apparaître (religion, écriture… : pas encore simulées, donc impossibles).') },
  },
};

const OPTION_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: text('Identifiant', 'Identifiant de la règle (ne pas changer).', 'newWorld'),
    name: text('Nom', 'Nom affiché de la règle.'),
    traits: traitWeights('de cette règle'),
    favors: factorWeights('de cette règle'),
  },
  optional: ['favors'],
};

const STRATEGY_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: text('Identifiant', 'Identifiant de la stratégie (ne pas changer).', 'newWorld'),
    name: text('Nom', 'Nom affiché de la stratégie.'),
    food: num(0.2, 3, 'Réserves de nourriture', 'Facteur appliqué aux réserves de nourriture voulues par la coutume.', 'facteur'),
    wood: num(0.2, 3, 'Réserve de bois', 'Facteur appliqué à la réserve de bois voulue.', 'facteur'),
    build: num(0.2, 3, 'Construction', 'Facteur appliqué à l’envie de construire.', 'facteur'),
    craft: num(0.2, 3, 'Artisanat', 'Facteur appliqué à l’envie de fabriquer des objets.', 'facteur'),
    traits: traitWeights('de cette stratégie'),
    favors: factorWeights('de cette stratégie'),
  },
};

const share = (label: string, help: string): Schema => num(0, 1, label, help, 'fraction');

export const GROUPS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    levels: { kind: 'array', minLength: LEVEL_COUNT, maxLength: LEVEL_COUNT, items: text('Nom d’un niveau', 'Nom des niveaux de groupe : 0 le plus grand (tribu), 1 (clan), 2 (famille).') },
    nameTemplates: { kind: 'array', minLength: LEVEL_COUNT, maxLength: LEVEL_COUNT, items: text('Nom d’un groupe', 'Nom descriptif d’un groupe de ce niveau ({nom} : son fondateur), en attendant les langues.') },
    adultAge: int(10, 30, 'Âge adulte (groupes)', 'À partir de cet âge, on compte dans la vie du groupe (soutien, mécontentement, ambitions).', 'ans'),
    elderAge: int(30, 90, 'Âge d’un ancien', 'À partir de cet âge, on est un ancien (conseil des anciens).', 'ans'),
    factors: {
      kind: 'object',
      fields: {
        smallMembers: int(2, 500, 'Petit groupe', 'Taille en dessous de laquelle un groupe est « petit » (bande égalitaire).', 'personnes'),
        largeMembers: int(5, 5000, 'Grand groupe', 'Taille à partir de laquelle un groupe est « grand ».', 'personnes'),
        surplusDays: num(1, 200, 'Surplus', 'Jours de nourriture d’avance en stock à partir desquels on parle de surplus.', 'jours'),
        settledYears: num(1, 100, 'Installé', 'Années sans déplacer le camp pour être « installé » (traditions fortes).', 'ans'),
        elderShare: share('Part d’anciens', 'Part d’anciens à partir de laquelle leur poids est complet.'),
        rivalryShare: share('Rivalités', 'Part des adultes brouillés avec quelqu’un à partir de laquelle les rivalités sont fortes.'),
        sufferingShare: share('Souffrances', 'Part des membres morts de faim, de soif, de froid ou de maladie en un an à partir de laquelle les temps sont complètement durs.'),
      },
    },
    regimes: { kind: 'array', minLength: 1, items: REGIME_SCHEMA },
    power: {
      kind: 'object',
      fields: {
        respectScale: num(1, 100, 'Échelle du respect', 'Respect moyen (axe des relations) qui donne le maximum à un candidat.', 'points'),
        prestigeAgeYears: num(1, 100, 'Âge du prestige', 'Âge auquel l’âge seul donne tout son prestige.', 'ans'),
        forceAgeYears: pair(num(10, 80, 'Force de l’âge', 'Âges entre lesquels on est dans la force de l’âge.', 'ans')),
        wealthItems: num(1, 500, 'Richesse', 'Nombre d’objets possédés qui fait un riche.', 'objets'),
        regimeInertia: share('Inertie du régime', 'Avance dont un autre régime a besoin pour être préféré par une réforme.'),
        ruleInertia: num(0, 5, 'Inertie des règles', 'Avance dont une autre règle ou stratégie a besoin pour que les dirigeants changent celle en vigueur.', 'points'),
      },
    },
    property: { kind: 'array', minLength: 1, items: OPTION_SCHEMA },
    inheritance: { kind: 'array', minLength: 1, items: OPTION_SCHEMA },
    strategies: { kind: 'array', minLength: 1, items: STRATEGY_SCHEMA },
    duties: {
      kind: 'object',
      fields: {
        boost: num(1, 5, 'Obligation confiée', 'Facteur sur l’envie de faire le travail que le dirigeant a confié.', 'facteur'),
        others: num(0, 1, 'Autres travaux', 'Facteur sur les autres travaux du camp pour qui obéit à son obligation.', 'facteur'),
        minSkillHours: num(0, 1000, 'Pratique utile', 'Heures de pratique à partir desquelles un dirigeant tient compte du savoir-faire d’un membre.', 'heures'),
      },
    },
    opinion: {
      kind: 'object',
      fields: {
        approvalRate: share('Vitesse de l’opinion', 'Part du chemin vers son nouvel avis que chacun fait chaque jour.'),
        respectWeight: share('Poids du respect', 'Poids du respect envers le dirigeant dans le soutien.'),
        affectionWeight: share('Poids de l’affection', 'Poids de l’affection envers le dirigeant dans le soutien.'),
        trustWeight: share('Poids de la confiance', 'Poids de la confiance envers le dirigeant dans le soutien.'),
        fitWeight: num(0, 100, 'Régime adapté', 'Soutien gagné (ou perdu) quand le régime convient (ou non) à la situation.', 'points'),
        welfareWeight: num(0, 100, 'Bien-être', 'Soutien perdu quand on souffre (griefs).', 'points'),
        kinBonus: num(0, 100, 'Parenté', 'Soutien en plus envers un dirigeant de sa famille.', 'points'),
        grievanceHunger: num(0, 20, 'Grief : faim', 'Grief gagné par jour de faim forte.', 'points/jour'),
        grievanceCold: num(0, 20, 'Grief : froid', 'Grief gagné par jour de froid fort.', 'points/jour'),
        grievanceLoss: num(0, 100, 'Grief : deuil', 'Grief gagné à la mort d’un proche (faim, froid, maladie).', 'points'),
        grievanceSick: num(0, 20, 'Grief : maladie', 'Grief gagné par jour de maladie.', 'points/jour'),
        grievanceBlockedAmbition: num(0, 20, 'Grief : ambition contrariée', 'Grief gagné par jour par qui veut le pouvoir sans l’avoir.', 'points/jour'),
        grievanceDecay: share('Oubli des griefs', 'Part des griefs qui s’efface chaque jour.'),
        hungerFloor: num(0, 100, 'Faim qui pèse', 'Faim à partir de laquelle on en veut à ses dirigeants.', 'sur 100'),
        coldFloor: num(0, 100, 'Froid qui pèse', 'Froid à partir duquel on en veut à ses dirigeants.', 'sur 100'),
      },
    },
    obedience: {
      kind: 'object',
      fields: {
        base: share('Obéissance de base', 'Chance d’obéir aux décisions et aux obligations, avant légitimité, relation et caractère.'),
        legitimacy: num(0, 2, 'Effet de la légitimité', 'Effet de la légitimité du pouvoir sur l’obéissance.', 'facteur'),
        relation: num(0, 2, 'Effet de la relation', 'Effet de la relation avec le dirigeant sur l’obéissance.', 'facteur'),
        traits: traitWeights('d’obéir'),
      },
    },
    politics: {
      kind: 'object',
      fields: {
        everyDays: int(1, 100, 'Rythme de la vie politique', 'Jours entre deux examens de la vie politique d’un groupe.', 'jours'),
        gap: num(0, 100, 'Écart qui fait agir', 'Mécontentement moins légitimité au-delà duquel les ambitieux passent à l’action.', 'points'),
        minLegitimacy: num(0, 100, 'Légitimité minimale', 'En dessous, les ambitieux agissent même sans grand mécontentement.', 'points'),
        actChance: share('Passage à l’acte', 'Chance qu’un ambitieux agisse, à chaque examen, quand l’écart est assez grand.'),
        ambitionTrait: share('Être ambitieux', 'Trait d’ambition à partir duquel on peut briguer le pouvoir.'),
        supportShare: share('Soutien nécessaire', 'Part des adultes qui doit préférer le contestataire pour renverser le chef.'),
        reformChance: share('Envie de réformer', 'Chance qu’un dirigeant réforme le régime ou les règles quand elles ne conviennent plus.'),
        failedRespect: num(-100, 0, 'Échec d’une contestation', 'Respect perdu auprès des membres par qui conteste sans succès.', 'points'),
        reviewYears: num(0.1, 50, 'Révision', 'Années entre deux révisions des dirigeants d’une bande ou d’un conseil.', 'ans'),
        challengerRespect: num(0, 100, 'Respect du chef', 'Respect gagné envers le nouveau chef chez ceux qui l’ont soutenu.', 'points'),
      },
    },
    clans: {
      kind: 'object',
      fields: {
        everyDays: int(1, 400, 'Rythme des clans', 'Jours entre deux examens de la formation des clans.', 'jours'),
        minFamilies: int(2, 20, 'Familles d’un clan', 'Familles qu’il faut pour former un clan.', 'familles'),
        minMembers: int(2, 100, 'Membres d’un clan', 'Personnes qu’il faut pour former un clan.', 'personnes'),
        kinTie: num(0, 5, 'Lien du sang', 'Force du lien entre deux familles par un parent, un enfant, un frère ou une sœur.', 'poids'),
        friendAffection: num(0, 100, 'Amitié qui lie', 'Affection entre deux adultes à partir de laquelle leurs familles se sentent liées.', 'points'),
        joinTie: num(0, 10, 'Rejoindre un clan', 'Force des liens avec un clan à partir de laquelle une famille le rejoint.', 'poids'),
        foundAmbition: share('Fonder un clan', 'Trait d’ambition à partir duquel on veut fonder son propre clan.'),
      },
    },
    families: { kind: 'object', fields: { joinSpouse: flag('Foyer du couple', 'Un nouveau couple forme son propre foyer (sinon chacun reste dans le sien).') } },
    scission: {
      kind: 'object',
      fields: {
        minMembers: int(2, 500, 'Taille d’une scission', 'Personnes qu’il faut à un clan pour partir fonder sa tribu.', 'personnes'),
        minAdults: int(1, 100, 'Adultes d’une scission', 'Adultes qu’il faut à un clan pour partir.', 'personnes'),
        approvalBelow: num(0, 100, 'Rejet du pouvoir', 'Soutien moyen du clan envers les dirigeants de la tribu en dessous duquel il envisage de partir.', 'points'),
        chance: share('Décision de partir', 'Chance qu’un clan mécontent décide de partir, à chaque examen.'),
        loyaltyGap: num(0, 100, 'Loyauté envers le clan', 'Écart entre le soutien des membres d’un clan à leur chef et aux dirigeants de la tribu à partir duquel un chef ambitieux peut emmener son clan.', 'points'),
        loyaltyChance: share('Départ par loyauté', 'Chance, à chaque examen, qu’un tel clan parte fonder sa tribu.'),
        distanceTiles: pair(num(5, 300, 'Distance du nouveau camp', 'Distance du nouveau camp d’une tribu issue d’une scission.', 'tuiles')),
        waterMaxTiles: int(0, 20, 'Eau proche', 'Distance maximale de l’eau pour un nouveau camp.', 'tuiles'),
      },
    },
    fusion: {
      kind: 'object',
      fields: {
        maxMembers: int(1, 500, 'Petite tribu', 'Taille en dessous de laquelle une tribu en difficulté peut en rejoindre une autre.', 'personnes'),
        sufferingDeaths: num(0, 100, 'Difficulté', 'Morts récentes (un an) qui mettent une petite tribu en difficulté.', 'morts'),
        minOpinion: num(-100, 100, 'Opinion nécessaire', 'Opinion de l’autre tribu qu’il faut pour la rejoindre.', 'points'),
        sizeRatio: num(1, 20, 'Plus grande', 'L’autre tribu doit être au moins ce nombre de fois plus grande.', 'facteur'),
        chance: share('Décision de rejoindre', 'Chance de décider la fusion à chaque examen, quand tout y pousse.'),
      },
    },
    betrayal: {
      kind: 'object',
      fields: {
        approvalBelow: num(0, 100, 'Rejet qui fait partir', 'Soutien envers ses dirigeants en dessous duquel on peut changer de tribu.', 'points'),
        minAffection: num(0, 100, 'Attache ailleurs', 'Affection envers quelqu’un d’une autre tribu qu’il faut pour la rejoindre.', 'points'),
        chance: share('Décision de partir', 'Chance de changer de tribu à chaque examen, quand tout y pousse.'),
      },
    },
    contact: {
      kind: 'object',
      fields: {
        meetTiles: num(1, 100, 'Rencontre', 'Distance à laquelle deux membres de tribus différentes se voient : leurs tribus se connaissent.', 'tuiles'),
        opinionRate: share('Vitesse des opinions', 'Part du chemin que fait chaque jour l’opinion d’une tribu sur une autre.'),
        scissionOpinion: num(-100, 100, 'Après une scission', 'Opinion de départ entre une tribu et celle qui l’a quittée.', 'points'),
        allianceOpinion: num(-100, 100, 'Alliance', 'Opinion mutuelle à partir de laquelle deux tribus peuvent s’allier.', 'points'),
        allianceChance: share('Décision d’alliance', 'Chance de conclure l’alliance à chaque examen.'),
      },
    },
    moves: {
      kind: 'object',
      fields: {
        sufferingEffect: share('Souffrances passées', 'Part dont les souffrances passées (famines, froid, épidémies) rendent plus prompt à partir.'),
        migrateDeathShare: share('Migration', 'Part des membres morts de faim, de soif, de froid ou de maladie en un an à partir de laquelle on migre loin plutôt que de se déplacer un peu.'),
        migrateMinTiles: num(5, 500, 'Distance d’une migration', 'Distance à partir de laquelle un lieu connu compte pleinement comme destination de migration (on préfère partir loin).', 'tuiles'),
        foresightDays: int(0, 100, 'Prévoir l’hiver', 'On ne lève pas le camp si le froid est prévisible d’ici ce nombre de jours (par les saisons).', 'jours'),
        winterCelsius: num(-50, 40, 'Froid qui retient', 'En dessous de cette température au camp, personne ne veut lever le camp : on reste près des huttes et du feu (le froid tue en quelques jours).', '°C'),
        migrateWarmth: share('Chercher la chaleur', 'Poids de la chaleur dans le choix d’une destination de migration après des morts de froid.'),
      },
    },
    texts: fixed(TEXT_KEYS, () => text('Texte', TEXT_HELP)),
    factorTexts: fixed(FACTORS, () => text('Situation', 'Ce que dit le journal d’une situation qui favorise un régime, une règle ou une stratégie.')),
    featureTexts: fixed(POWER_FEATURES, () => text('Atout', 'Ce que dit le journal de l’atout qui a porté quelqu’un au pouvoir ({e} : féminin).')),
    dutyNames: fixed(DUTIES, () => text('Obligation', 'Nom d’une obligation confiée par les dirigeants (fiche personnage).')),
    causeTexts: fixed(CAUSE_KEYS, () => text('Raison', 'Raison citée par le journal.')),
  },
};

export function parseGroupsParams(raw: unknown): GroupsParams {
  return validateData<GroupsParams>('data/groups.json', raw, GROUPS_SCHEMA);
}

/** Trait ids used by the rules must exist (data/humans.json); every level needs one regime at least. */
export function checkGroupLinks(params: GroupsParams, traitIds: readonly string[]): void {
  const problems: string[] = [];
  const checkTraits = (where: string, traits: Record<string, number>): void => {
    for (const id of Object.keys(traits)) if (!traitIds.includes(id)) problems.push(`${where} : trait inconnu « ${id} » (voir data/humans.json).`);
  };
  params.property.forEach((option) => checkTraits(`property « ${option.id} »`, option.traits));
  params.inheritance.forEach((option) => checkTraits(`inheritance « ${option.id} »`, option.traits));
  params.strategies.forEach((option) => checkTraits(`strategies « ${option.id} »`, option.traits));
  checkTraits('obedience', params.obedience.traits);
  for (let level = 0; level < LEVEL_COUNT; level++) {
    if (!params.regimes.some((regime) => regime.levels.includes(level) && regime.requires.length === 0)) problems.push(`aucun régime possible pour le niveau ${level} (il en faut un sans condition nécessaire).`);
  }
  if (problems.length > 0) throw new DataFileError('data/groups.json', problems);
}
