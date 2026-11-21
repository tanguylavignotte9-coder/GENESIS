import { DataFileError, int, num, text, validateData, type Schema } from '../../core/data-validation';

/**
 * Parameters of the conflict system (data/conflict.json): when a quarrel turns to blows, how a
 * murder starts a feud, why a tribe raids another or goes to war, how a fight goes (strength,
 * weapons, armour, morale, walls, numbers), how tribes make peace, truces and tributes. Every
 * variable is documented for the variables workshop.
 */

export interface ConflictParams {
  brawl: {
    escalateChance: number;
    angerScale: number;
    temperEffect: number;
    grudgeEffect: number;
    prudenceEffect: number;
    hungerEffect: number;
    blows: number;
    fistDamage: number;
    heavyBlowChance: number;
    heavyBlowFactor: number;
    assaultTrust: number;
    exileHostility: number;
  };
  feud: {
    avengeChance: number;
    actChancePerDay: number;
    cooldownDays: number;
    reachTiles: number;
    fadeYears: number;
    fadeChancePerYear: number;
    sideAdultAge: number;
  };
  combat: {
    blowDamage: number;
    skillWeight: number;
    weapons: Record<string, number>;
    armor: Record<string, number>;
    defenses: Record<string, number>;
    homeBonus: number;
    hitChance: number;
    rounds: number;
    startMorale: number;
    braveryMorale: number;
    temperMorale: number;
    prudenceMorale: number;
    woundMorale: number;
    lossMorale: number;
    winMorale: number;
    fleeMorale: number;
    routShare: number;
    pursuitKill: number;
    captureChance: number;
  };
  raid: {
    everyDays: number;
    baseChance: number;
    hungerEffect: number;
    envyEffect: number;
    prestigeEffect: number;
    hatredEffect: number;
    maxTiles: number;
    partyShare: number;
    minParty: number;
    fighterAge: [number, number];
    joinChance: number;
    gatherHours: number;
    giveUpDays: number;
    marchMoraleLoss: number;
    lootShare: number;
    battleTiles: number;
    rationDays: number;
  };
  war: {
    declareChance: number;
    hatredOpinion: number;
    religionEffect: number;
    ambitionEffect: number;
    strengthEffect: number;
    raidEveryDays: number;
    wearinessPerLoss: number;
    peaceWeariness: number;
    conquestRatio: number;
    tributeShare: number;
    tributeEveryDays: number;
    tributeYears: number;
  };
  diplomacy: {
    truceDays: number;
    understandFloor: number;
    betrayalOpinion: number;
    betrayalWeight: number;
    marriageChance: number;
    threatDays: number;
  };
  civilWar: {
    minShare: number;
    maxLegitimacy: number;
    angerTrait: number;
    chance: number;
  };
  texts: Record<(typeof TEXT_KEYS)[number], string>;
}

export const TEXT_KEYS = [
  'brawl',
  'brawlDeath',
  'exile',
  'spared',
  'feudBegins',
  'revenge',
  'revengeFailed',
  'feudEnds',
  'raidDecided',
  'warParty',
  'warDeclared',
  'battle',
  'battleDefense',
  'deserted',
  'captives',
  'conquest',
  'tribute',
  'tributePaid',
  'peace',
  'truce',
  'envoySent',
  'envoyLost',
  'tooLate',
  'betrayal',
  'marriage',
  'civilWar',
  'collapse',
] as const;

const share = (label: string, help: string): Schema => num(0, 1, label, help, 'fraction');
const chance = (label: string, help: string): Schema => num(0, 1, label, help, 'chance');
const effect = (label: string, help: string): Schema => num(0, 5, label, help, 'poids');
const factors = (label: string, help: string): Schema => ({ kind: 'record', values: num(0, 5, label, help, 'facteur') });

export const CONFLICT_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    brawl: {
      kind: 'object',
      fields: {
        escalateChance: chance('Dispute qui dégénère', 'Chance qu’une dispute tourne aux coups quand la colère est à son comble (moins si l’on est calme, prudent, bien nourri, ou si l’on s’apprécie).'),
        angerScale: num(1, 100, 'Colère qui fait frapper', 'Colère à laquelle la chance d’en venir aux mains est entière.', 'points'),
        temperEffect: effect('Colère facile', 'Poids du trait « colère facile » dans le passage aux coups.'),
        grudgeEffect: effect('Rancune', 'Poids de l’inimitié entre les deux (affection négative) dans le passage aux coups.'),
        prudenceEffect: effect('Prudence', 'Combien la prudence retient de frapper.'),
        hungerEffect: effect('Faim', 'Combien la faim rend agressif.'),
        blows: int(1, 20, 'Coups échangés', 'Nombre de coups que s’échangent deux personnes qui se battent (au plus).', 'coups'),
        fistDamage: num(0, 100, 'Coup de poing', 'Santé qu’enlève un coup à mains nues d’un adulte vigoureux (une arme multiplie).', 'points de santé'),
        heavyBlowChance: chance('Coup mal placé', 'Chance qu’un coup de rixe soit bien plus grave que les autres (une pierre, une chute, une arme saisie).'),
        heavyBlowFactor: num(1, 20, 'Gravité d’un coup mal placé', 'Combien de fois un coup mal placé fait plus de mal qu’un coup ordinaire.', 'facteur'),
        assaultTrust: num(0, 100, 'Rancune d’un coup reçu', 'Confiance et affection perdues envers celui qui vous a frappé.', 'points'),
        exileHostility: num(-100, 100, 'Exil du meurtrier', 'Un adulte veut l’exil du meurtrier si son affection pour lui est en dessous de ce seuil (ou s’il aimait la victime) ; le groupe décide selon son régime.', 'points'),
      },
    },
    feud: {
      kind: 'object',
      fields: {
        avengeChance: chance('Désir de vengeance', 'Chance qu’un proche adulte d’une victime de meurtre veuille la venger (selon sa colère facile et sa prudence).'),
        actChancePerDay: chance('Passage à l’acte', 'Chance par jour qu’un vengeur qui croise sa cible passe à l’acte (selon son caractère).'),
        cooldownDays: num(0, 400, 'Rancune qui couve', 'Jours qu’un vengeur laisse passer après une tentative ratée avant d’essayer de nouveau.', 'jours'),
        reachTiles: num(1, 60, 'Distance de la vengeance', 'Distance à laquelle un vengeur peut atteindre sa cible.', 'tuiles'),
        fadeYears: num(1, 100, 'Oubli de la vendetta', 'Années sans nouveau sang après lesquelles une vendetta peut s’éteindre.', 'ans'),
        fadeChancePerYear: chance('Extinction', 'Chance par an, passé ce délai, que les deux familles fassent la paix.'),
        sideAdultAge: num(10, 30, 'Âge du vengeur', 'Âge à partir duquel un enfant d’une famille en vendetta reprend la vengeance des siens (récits familiaux).', 'ans'),
      },
    },
    combat: {
      kind: 'object',
      fields: {
        blowDamage: num(1, 100, 'Coup au combat', 'Santé qu’enlève un coup porté au combat par un combattant vigoureux à mains nues (arme et armure multiplient).', 'points de santé'),
        skillWeight: share('Expérience', 'Part de force qu’apporte la compétence de chasse (savoir tenir une arme).'),
        weapons: factors('Arme', 'Force d’un combattant qui porte cette arme (identifiant d’objet de data/items.json → facteur ; la meilleure compte).'),
        armor: factors('Protection', 'Part des coups reçus que laisse passer ce vêtement (identifiant d’objet → facteur).'),
        defenses: factors('Rempart', 'Force des défenseurs derrière ce bâtiment de défense (identifiant de data/buildings.json → facteur).'),
        homeBonus: num(1, 3, 'Défendre son camp', 'Force des défenseurs qui se battent chez eux (terrain connu).', 'facteur'),
        hitChance: share('Coup porté', 'Chance qu’un combattant atteigne son adversaire à chaque assaut.'),
        rounds: int(1, 30, 'Assauts', 'Nombre d’assauts au plus dans une bataille avant que chacun rentre.', 'assauts'),
        startMorale: num(0, 100, 'Moral de départ', 'Moral d’un combattant au début d’un combat.', 'points'),
        braveryMorale: num(0, 100, 'Courage de la culture', 'Moral en plus (ou en moins) selon la bravoure de sa culture.', 'points'),
        temperMorale: num(0, 100, 'Fougue', 'Moral en plus (ou en moins) selon la colère facile.', 'points'),
        prudenceMorale: num(0, 100, 'Prudence au combat', 'Moral en moins (ou en plus) selon la prudence.', 'points'),
        woundMorale: num(0, 100, 'Blessure', 'Moral perdu par un combattant blessé.', 'points'),
        lossMorale: num(0, 100, 'Camarade tombé', 'Moral perdu par chaque combattant quand un des siens tombe (pour une troupe de dix).', 'points'),
        winMorale: num(0, 100, 'Ennemi tombé', 'Moral gagné quand un ennemi tombe ou fuit (pour une troupe de dix).', 'points'),
        fleeMorale: num(0, 100, 'Fuite', 'En dessous de ce moral, un combattant fuit (il déserte).', 'points'),
        routShare: share('Débandade', 'Quand cette part d’une troupe a fui ou est tombée, le reste s’enfuit.'),
        pursuitKill: chance('Poursuite', 'Chance qu’un fuyard blessé soit rattrapé et tué.'),
        captureChance: chance('Captifs', 'Chance qu’un fuyard rattrapé soit pris vivant plutôt que tué (il rejoindra la tribu du vainqueur).'),
      },
    },
    raid: {
      kind: 'object',
      fields: {
        everyDays: int(1, 100, 'Rythme des décisions', 'Jours entre deux fois où les dirigeants d’une tribu envisagent un raid ou une guerre.', 'jours'),
        baseChance: chance('Envie de raid', 'Chance de base qu’un chef envisage un raid contre une tribu connue, avant faim, envie, prestige et haine.'),
        hungerEffect: effect('Faim', 'Combien la faim de la tribu (réserves vides, affamés) pousse au raid.'),
        envyEffect: effect('Envie', 'Combien les réserves d’une tribu voisine, plus riches que les siennes, poussent au raid.'),
        prestigeEffect: effect('Prestige', 'Combien l’ambition du chef (gloire, prestige) pousse au raid.'),
        hatredEffect: effect('Haine', 'Combien l’inimitié envers l’autre tribu pousse au raid.'),
        maxTiles: num(5, 500, 'Distance d’un raid', 'Distance au-delà de laquelle on ne lance pas de raid.', 'tuiles'),
        partyShare: share('Taille de la troupe', 'Part des combattants possibles appelés pour un raid (plus pour une guerre).'),
        minParty: int(1, 50, 'Troupe minimale', 'Il faut au moins ce nombre de combattants pour partir.', 'personnes'),
        fighterAge: { kind: 'array', minLength: 2, maxLength: 2, items: num(10, 90, 'Âge des combattants', 'Âges entre lesquels on peut être appelé au combat.', 'ans') },
        joinChance: share('Répondre à l’appel', 'Chance de base qu’un appelé parte (selon son obéissance, sa prudence et sa colère facile).'),
        gatherHours: num(1, 72, 'Rassemblement', 'Heures que la troupe attend au camp avant de partir.', 'heures'),
        giveUpDays: num(1, 60, 'Abandon', 'Jours au bout desquels une troupe qui n’a pas trouvé l’ennemi rentre.', 'jours'),
        marchMoraleLoss: num(0, 100, 'Fatigue de la marche', 'Moral perdu par jour de marche (plus si l’on a faim).', 'points/jour'),
        lootShare: share('Pillage', 'Part des réserves du camp vaincu que les vainqueurs emportent.'),
        battleTiles: num(1, 30, 'Contact', 'Distance du camp ennemi à laquelle la bataille s’engage.', 'tuiles'),
        rationDays: num(0, 30, 'Provisions', 'Jours de nourriture que chaque combattant emporte du stock commun (autant qu’il peut porter).', 'jours'),
      },
    },
    war: {
      kind: 'object',
      fields: {
        declareChance: chance('Déclaration de guerre', 'Chance qu’un chef qui hait une tribu lui déclare la guerre plutôt que de la razzier (avant religion, ambition et force).'),
        hatredOpinion: num(-100, 100, 'Haine', 'Opinion en dessous de laquelle une tribu en hait une autre (guerre possible).', 'points'),
        religionEffect: effect('Autre foi', 'Combien une religion différente (selon la ferveur du chef) pousse à la guerre.'),
        ambitionEffect: effect('Ambition', 'Combien l’ambition du chef pousse à la guerre.'),
        strengthEffect: effect('Rapport de force', 'Combien un rapport de force favorable pousse à la guerre (et un défavorable en retient).'),
        raidEveryDays: int(1, 200, 'Expéditions', 'Jours entre deux expéditions d’une tribu en guerre.', 'jours'),
        wearinessPerLoss: num(0, 100, 'Lassitude', 'Lassitude de la guerre par mort ou captif (pour une tribu de cent).', 'points'),
        peaceWeariness: num(0, 200, 'Envie de paix', 'Au-delà de cette lassitude, les dirigeants cherchent la paix.', 'points'),
        conquestRatio: num(1, 10, 'Conquête', 'Rapport de force après une victoire qui permet d’annexer le vaincu (il devient un clan du vainqueur).', 'facteur'),
        tributeShare: share('Tribut', 'Part des réserves que le vaincu verse au vainqueur à chaque échéance.'),
        tributeEveryDays: int(1, 400, 'Échéance du tribut', 'Jours entre deux versements du tribut.', 'jours'),
        tributeYears: num(0, 100, 'Durée du tribut', 'Années pendant lesquelles le tribut est dû.', 'ans'),
      },
    },
    diplomacy: {
      kind: 'object',
      fields: {
        truceDays: int(1, 400, 'Trêve', 'Jours que dure une trêve.', 'jours'),
        understandFloor: share('Sans langue commune', 'Chance minimale qu’un émissaire soit compris par une tribu dont il ne parle pas la langue.'),
        betrayalOpinion: num(0, 200, 'Trahison', 'Opinion perdue par une tribu trahie (paix ou alliance rompue).', 'points'),
        betrayalWeight: effect('Mémoire des trahisons', 'Combien chaque trahison passée rend une tribu méfiante dans les négociations.'),
        marriageChance: chance('Mariage diplomatique', 'Chance qu’une paix ou une alliance soit scellée par un mariage entre les deux tribus.'),
        threatDays: int(1, 400, 'Menace connue', 'Jours pendant lesquels un raid ou une vendetta fait que le camp se sent menacé (palissade).', 'jours'),
      },
    },
    civilWar: {
      kind: 'object',
      fields: {
        minShare: share('Camp rebelle', 'Part des adultes qu’il faut derrière un prétendant battu pour qu’une contestation dégénère en guerre civile.'),
        maxLegitimacy: num(0, 100, 'Légitimité effondrée', 'Une guerre civile n’éclate que si la légitimité est sous ce seuil.', 'points'),
        angerTrait: share('Prétendant violent', 'Colère facile ou ambition qu’il faut au prétendant pour prendre les armes.'),
        chance: chance('Guerre civile', 'Chance qu’une contestation qui remplit ces conditions dégénère en guerre civile.'),
      },
    },
    texts: { kind: 'object', fields: Object.fromEntries(TEXT_KEYS.map((key) => [key, text('Texte du journal', 'Texte du journal (remplacements entre accolades).')])) },
  },
};

const FILE = 'data/conflict.json';

export function parseConflictParams(raw: unknown): ConflictParams {
  const params = validateData<ConflictParams>(FILE, raw, CONFLICT_SCHEMA);
  const problems: string[] = [];
  if (params.raid.fighterAge[0] > params.raid.fighterAge[1]) problems.push('« raid.fighterAge » : le premier âge doit être le plus jeune.');
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}

/** Items and buildings named by the conflict parameters must exist. */
export function checkConflictLinks(params: ConflictParams, itemIds: readonly string[], buildingIds: readonly string[]): void {
  const problems: string[] = [];
  for (const id of [...Object.keys(params.combat.weapons), ...Object.keys(params.combat.armor)]) if (!itemIds.includes(id)) problems.push(`combat : objet inconnu « ${id} » (voir data/items.json).`);
  for (const id of Object.keys(params.combat.defenses)) if (!buildingIds.includes(id)) problems.push(`combat.defenses : bâtiment inconnu « ${id} » (voir data/buildings.json).`);
  if (problems.length > 0) throw new DataFileError(FILE, problems);
}
