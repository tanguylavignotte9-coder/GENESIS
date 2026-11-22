import { color, DataFileError, flag, identifier, int, num, pair, text, validateData, type Schema } from '../../core/data-validation';
import { unknownResources, type ResourceCatalog } from '../../core/resources';
import type { BiomeTable } from '../world/biomes';
import type { ResourceAmount } from '../flora/params';

/** What an animal can eat: grass on the ground, a plant produce (resource id), fish, or meat (hunting). */
export type FoodSource = 'grass' | 'meat' | 'fish' | string;

export interface AnimalSpecies {
  id: string;
  name: string;
  /** Plural, lower case ("chevaux sauvages"), used in journal sentences. */
  plural: string;
  color: string;
  /** Sprite size in pixels. */
  size: number;
  /** Food sources and preference weights. */
  diet: Record<FoodSource, number>;
  /** Species ids this one hunts. */
  prey: string[];
  /** Biome id → relative density where the species starts. */
  habitat: Record<string, number>;
  populationPer1000Tiles: number;
  groupSize: [number, number];
  maxGroupSize: number;
  maxAgeYears: number;
  adultAgeYears: number;
  /** Mating season, in days of the LOCAL year: [from, to). */
  breedingDays: [number, number];
  gestationDays: number;
  litter: [number, number];
  /** Chance per day, for a fertile female in good condition during the mating season. */
  conceptionChance: number;
  /** A mother does not conceive again for this many days after giving birth. */
  birthIntervalDays: number;
  /** Days the young drink their mother's milk (she pays for it from her reserves). */
  nursingDays: number;
  /** Breeding sites (burrows, warrens): a female breeds only if fewer than `breedersPerSite` other adult females of her kind live within `breedingSiteTiles` (0 = no such limit). */
  breedingSiteTiles: number;
  breedersPerSite: number;
  /** Adult body mass (kg): metabolism, reserves, meal size, and the strength of a hunter or of a prey. */
  massKg: number;
  /** Largest meal, in days of the animal's basal needs (a wolf gorges, a deer grazes little and often). */
  mealDays: number;
  /** Territorial hunters: radius of the land a group holds, between these bounds, by the game it finds there (0 = no territory). */
  territoryMinTiles: number;
  territoryMaxTiles: number;
  /** Territorial species: only the group's dominant female breeds (wolves), or every adult female (lions). */
  dominantBreederOnly: boolean;
  /** A hungry group splits into smaller hunting groups, and well fed groups gather again (lions). */
  splitWhenHungry: boolean;
  /** Territorial species: chance per year that a young adult (not the leader) leaves its group to look for free land. */
  dispersalPerYear: number;
  thirstPerDay: number;
  /** Below this temperature, the animal suffers from the cold. */
  minCelsius: number;
  /** Walking speed, tiles per hour. */
  walkTilesPerHour: number;
  /** Prey only: distance (tiles) at which a lone animal notices a hunter (a herd sees further). */
  fleeRadius: number;
  /** Distance at which an animal of average wariness notices a hunter and runs away (0 = does not fear humans). */
  humanFleeTiles: number;
  /** Running speed while fleeing a human, tiles per hour. */
  fleeSprintTiles: number;
  /** Hunters only: distance at which prey is seen. */
  huntRadius: number;
  /** Hunters only: chance that one attack of a lone adult on a prey of its own weight, healthy and on open ground, succeeds. */
  huntSkill: number;
  /** Hunters only: beyond this many hunters on the same prey, more do not help (they let the others do the work). */
  huntGroupCap: number;
  /** Hunters only: distance from which the hunter stops creeping up and charges its prey. */
  chargeTiles: number;
  /** Hunters only: steps (hours) a chase can last before the hunter gives up, out of breath. */
  chaseSteps: number;
  /** Prey: share of attacks it escapes by its speed or agility, all else being equal. */
  evasion: number;
  /** Chance that the animal fights back when a hunter (human or animal) strikes it, and the health a blow removes. */
  riposteChance: number;
  riposteDamage: number;
  /** Hunters only: running speed while chasing, tiles per hour. */
  sprintTiles: number;
  /** Food units (kg of meat) its body gives to the hunters who kill it (an adult; a young gives less). */
  meat: number;
  migratory: boolean;
  /** Distance of the seasonal migration toward the equator (autumn) and back (spring). */
  migrationTiles: number;
  /** Can be captured and tamed by people who know husbandry. */
  domesticable: boolean;
  /** Domestic animals: milk given by a nursing female at each milking, wool by an adult at each shearing (0 = none). */
  milk: number;
  wool: number;
  /** Name of the tamed animal (« chèvre », « chien ») and whether it is feminine (journal). */
  tameName: string;
  tameFeminine: boolean;
  /** What the animal provides when it dies (for the hunters of later steps). */
  carcass: ResourceAmount[];
}

export interface FaunaParams {
  stepsPerDay: number;
  thinkEverySteps: number;
  gridCellTiles: number;
  needs: {
    seekWaterAbove: number;
    seekFoodAbove: number;
    huntAbove: number;
    thirstBreaksHunt: number;
    fullBelow: number;
    drinkPerStep: number;
    starvationDamagePerDay: number;
    thirstDamagePerDay: number;
    coldDamagePerDegreeDay: number;
    regenPerDay: number;
    oldAgeShare: number;
    oldAgeDamagePerDay: number;
  };
  /** The body's energy budget: metabolism by mass, reserves, meals and digestion, costs of moving, gestation and nursing. */
  energy: {
    basalPerKg075: number;
    reservePerKg: number;
    digestPerHour: number;
    intakePerHour: number;
    walkCostPerKg075Tile: number;
    runCostFactor: number;
    gestationShare: number;
    milkEfficiency: number;
    nursingMinCondition: number;
    birthMassShare: number;
    startConditionMin: number;
    breedingMinCondition: number;
    breedingFullCondition: number;
    foodEnergy: { grass: number; meat: number; fish: number; produce: number };
  };
  /** Attacks of animal hunters: what makes them succeed or fail, and what the prey can do. */
  hunting: {
    weakPreyFactor: number;
    weakPreyHealth: number;
    weakPreyCondition: number;
    sizeResistance: number;
    surpriseFactor: number;
    youngHunterFactor: number;
    riposteShare: number;
    groupTiles: number;
    maxSuccess: number;
    coverByBiome: Record<string, number>;
    refugeByBiome: Record<string, number>;
  };
  /** Herds: more eyes see a hunter sooner, and an alarm makes the whole herd run. */
  vigilance: { perMate: number; maxMates: number; alarmTiles: number; coverShare: number; stalkShare: number };
  /** Territories of the social hunters: sized by the game, defended, intruders at risk; groups that split and gather. */
  territory: {
    preyKgPerPredatorKg: number;
    adjustShare: number;
    abandonShare: number;
    overlapShare: number;
    intruderRiskPerDay: number;
    fightTiles: number;
    splitBelowCondition: number;
    splitMinSize: number;
    mergeAboveCondition: number;
    mergeTiles: number;
  };
  behavior: {
    forageRadius: number;
    forageSamples: number;
    farForageFactor: number;
    cohesionRadius: number;
    wanderChance: number;
    wanderRadius: number;
    /** A hungry hunter without territory (a disperser) and no prey in sight goes looking this far. */
    huntSearchTiles: number;
    fleeDistance: number;
    packShareRadius: number;
    lonerJoinRadius: number;
    waterSearchTiles: number;
    spawnSiteAttempts: number;
    migrationMaxDays: number;
    migrationCandidates: number;
    breedingMinHealth: number;
    /** A female finds a mate if an adult male of her species is within this distance. */
    mateRadius: number;
  };
  /** Animal diseases: rare outbreaks, contagion between close animals of a species, immunity. */
  sickness: { outbreakPerDay: number; contagionTiles: number; transmitPerDay: number; sickDays: number; damagePerDay: number; immuneDays: number };
  /** Natural movement (core/motion): acceleration, running, herds, packs, avoidance. */
  movement: {
    accelTilesPerHour2: number;
    panicRunFactor: number;
    wanderSpeedShare: number;
    arriveTiles: number;
    personalSpaceTiles: number;
    avoidTilesPerHour: number;
    herdSpacingTiles: number;
    herdSlackTiles: number;
    encircleTiles: number;
    catchTiles: number;
  };
  fish: {
    maxAmount: number;
    regrowthPerDay: number;
    updateIntervalDays: number;
    capacityByWater: { river: number; lake: number; coast: number; openSea: number };
    coastMaxDepthMeters: number;
  };
  /** Carcasses: days for half the meat to rot at the reference temperature (×2 faster every `doublingCelsius` warmer, within bounds), and scraps below which they vanish. */
  carrion: { halfLifeDays: number; referenceCelsius: number; doublingCelsius: number; minFactor: number; maxFactor: number; minimumMeat: number };
  stats: { intervalDays: number };
  /**
   * How wild animals perceive humans: individual wariness; predators keep away from people
   * (even more from a group or a camp) unless they are starving, and from anyone who drives them off.
   */
  humanFear: { warinessSpread: number; crowdShare: number; crowdMax: number; crowdTiles: number; driveOffFactor: number; tamerShare: number; busyShare: number };
  /** Predators and humans: who may attack a person walking alone, and how. */
  humanPrey: { hunters: string[]; minHunger: number; loneTiles: number; attackChancePerStep: number; attackDamage: number };
  /** Domestic animals (husbandry): pasture, taming, escapes, how their deaths are told. */
  domestic: {
    pastureTiles: number;
    tamePerDay: number;
    escapePerDay: number;
    hungerEscape: number;
    noPenEscape: number;
    starvingEscape: number;
    causeNames: string[];
    texts: { escape: string; wild: string; noPen: string; starving: string; deathsOne: string; deathsMany: string; releasedOne: string; releasedMany: string; unknownKeeper: string };
  };
  events: {
    collapseShare: number;
    collapseMinPopulation: number;
    extinctionMinLandmassTiles: number;
    extinctionMinPreviousPopulation: number;
    migrationMinAnimals: number;
    /** The same migration (species, landmass, direction) is reported at most once in this many years. */
    migrationEventEveryYears: number;
    migrationText: string;
    extinctionText: string;
    collapseText: string;
  };
  species: AnimalSpecies[];
}

const NEW_WORLD = 'newWorld';
const share = (label: string, help: string): Schema => num(0, 1, label, help, 'fraction');
const TEMPLATE_HELP = 'Remplacements : {espèces}, {d_espèces}, {lieu}, {de_lieu}, {direction}, {cause}.';

const SPECIES_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: identifier('Identifiant', 'Nom technique de l’espèce.'),
    name: text('Nom', 'Nom affiché de l’espèce.'),
    plural: text('Pluriel', 'Pluriel en minuscules (« chevaux sauvages »), pour les phrases du journal.'),
    color: color('Couleur', 'Couleur du dessin de l’animal.'),
    size: int(1, 16, 'Taille du dessin', 'Taille de l’animal à l’écran (affichage seulement).', 'pixels'),
    diet: { kind: 'record', values: num(0, 10, 'Préférence alimentaire', 'Poids de cette nourriture (herbe, viande, poisson ou une récolte de plante) dans le choix de ce qu’il mange.', 'poids') },
    prey: { kind: 'array', items: text('Proie', 'Identifiant d’une espèce chassée (les proies fuient leurs chasseurs).', NEW_WORLD) },
    habitat: { kind: 'record', values: num(0, 10, 'Densité de départ par biome', 'Densité relative de l’espèce dans ce biome au début du monde.', 'poids', NEW_WORLD) },
    populationPer1000Tiles: num(0, 100, 'Population de départ', 'Animaux au début du monde pour 1 000 tuiles d’habitat.', 'animaux/1000 tuiles', NEW_WORLD),
    groupSize: pair(num(1, 100, 'Taille du groupe [min, max]', 'Taille d’un troupeau ou d’une meute au départ ; un animal seul d’une espèce sociale (max > 1) cherche un groupe.', 'animaux')),
    maxGroupSize: int(1, 500, 'Groupe maximal', 'Au-delà, le groupe se scinde.', 'animaux'),
    maxAgeYears: num(0.1, 200, 'Longévité', 'Âge maximal.', 'ans'),
    adultAgeYears: num(0, 50, 'Âge adulte', 'Âge à partir duquel l’animal peut se reproduire.', 'ans'),
    breedingDays: pair(num(0, 400, 'Saison des amours [début, fin)', 'Jours de l’année LOCALE où les femelles peuvent concevoir.', 'jour')),
    gestationDays: int(1, 400, 'Gestation', 'Durée de la gestation.', 'jours'),
    litter: pair(num(1, 20, 'Portée [min, max]', 'Nombre de petits par mise bas.', 'petits')),
    conceptionChance: share('Chance de conception', 'Chance par jour, pour une femelle fertile pendant la saison des amours.'),
    birthIntervalDays: int(0, 400, 'Intervalle entre portées', 'Une mère ne conçoit pas de nouveau pendant ce nombre de jours après une mise bas.', 'jours'),
    nursingDays: int(0, 400, 'Allaitement', 'Jours pendant lesquels les petits boivent le lait de leur mère : elle le paie sur ses réserves, et s’il n’y en a plus, les petits jeûnent.', 'jours'),
    breedingSiteTiles: num(0, 50, 'Sites de reproduction', 'Espèces qui mettent bas dans un terrier ou une garenne (0 = aucune limite) : rayon de la garenne. Quand toutes les places sont prises, les femelles dominées ne se reproduisent pas (dans la nature, la densité de lapins est ainsi limitée par l’espace des garennes).', 'tuiles'),
    breedersPerSite: int(0, 1000, 'Places par garenne', 'Nombre de femelles adultes de l’espèce qui peuvent se reproduire dans ce rayon ; les autres, dominées, ne mettent pas bas.', 'femelles'),
    massKg: num(0.1, 5000, 'Masse adulte', 'Poids d’un adulte. Le métabolisme croît comme la masse à la puissance 0,75 ; les réserves et la taille d’un repas suivent la masse ; à la chasse, la masse fait la force du chasseur et la résistance de la proie.', 'kg'),
    mealDays: num(0.05, 20, 'Plus gros repas', 'Ce que l’animal peut avaler d’un coup, en jours de besoins de base : un loup se gave puis digère, un cerf broute peu et souvent.', 'jours de besoins'),
    territoryMinTiles: int(0, 200, 'Territoire minimal', 'Chasseurs sociaux (0 = pas de territoire) : rayon le plus petit du territoire d’un groupe, quand le gibier abonde.', 'tuiles'),
    territoryMaxTiles: int(0, 400, 'Territoire maximal', 'Rayon le plus grand du territoire d’un groupe, quand le gibier est rare.', 'tuiles'),
    dominantBreederOnly: flag('Seule la dominante se reproduit', 'Espèces territoriales : seule la femelle dominante (la plus âgée) du groupe met bas (loups) ; sinon chaque femelle adulte en bon état peut le faire (lions).'),
    splitWhenHungry: flag('Groupes qui se scindent', 'Un groupe affamé se divise en petits groupes de chasse, et des groupes bien nourris voisins se réunissent (lions).'),
    dispersalPerYear: num(0, 1, 'Dispersion des jeunes', 'Espèces territoriales : chance par an qu’un jeune adulte quitte son groupe pour chercher un partenaire et une terre libre (au risque de mourir seul ou sous les crocs des voisins).', 'probabilité'),
    thirstPerDay: num(0, 100, 'Soif', 'Points de soif gagnés par jour (100 = assoiffé).', 'points/jour'),
    minCelsius: num(-80, 40, 'Résistance au froid', 'En dessous de cette température, l’animal souffre du froid.', '°C'),
    walkTilesPerHour: num(0.1, 20, 'Vitesse de marche', 'Distance parcourue en une heure de jeu en marchant.', 'tuiles/heure'),
    fleeRadius: int(0, 64, 'Vigilance', 'Proies : distance à laquelle un animal seul remarque un chasseur (0 = ne fuit jamais) ; un troupeau le voit plus loin, un couvert épais moins loin.', 'tuiles'),
    humanFleeTiles: int(0, 64, 'Méfiance envers les humains', 'Distance à laquelle un animal sauvage de prudence moyenne remarque un humain (chasseur ou simple passant) et s’enfuit (0 = ne craint pas les humains). Plus l’humain est proche, plus il a de chances d’être remarqué. Un prédateur affamé ne fuit plus. Les bêtes domestiques ne fuient jamais.', 'tuiles'),
    fleeSprintTiles: num(0.1, 20, 'Course de fuite', 'Gibier : vitesse de course en fuyant un humain.', 'tuiles/heure'),
    huntRadius: int(0, 64, 'Vue du chasseur', 'Chasseurs : distance à laquelle une proie est repérée.', 'tuiles'),
    huntSkill: share('Adresse à la chasse', 'Chasseurs : chance qu’une attaque d’un adulte seul réussisse contre une proie de son poids, en bonne santé, en terrain découvert. La taille de la proie, celle du groupe de chasseurs, la faiblesse de la proie, sa vivacité, la surprise et le terrain la modifient.'),
    huntGroupCap: int(1, 50, 'Chasseurs utiles', 'Chasseurs : au-delà de ce nombre de chasseurs sur une même proie, les autres n’aident plus (ils laissent faire l’effort).', 'chasseurs'),
    chargeTiles: num(0.5, 64, 'Charge', 'Chasseurs : le chasseur approche sa proie au pas, en se cachant, puis charge à cette distance (court les derniers mètres).', 'tuiles'),
    chaseSteps: int(1, 200, 'Durée d’une poursuite', 'Chasseurs : au-delà de ce nombre de pas (heures) de poursuite, le chasseur abandonne, à bout de souffle.', 'pas'),
    evasion: share('Vivacité', 'Proies : part des attaques auxquelles l’animal échappe par sa vitesse ou son agilité, toutes choses égales par ailleurs.'),
    riposteChance: share('Riposte', 'Chance que l’animal se défende quand un chasseur, humain ou animal, l’attaque (charge, coups de cornes, de défenses ou de griffes).'),
    riposteDamage: num(0, 200, 'Force de la riposte', 'Santé qu’enlève à un chasseur un coup de l’animal qui se défend (au hasard entre la moitié et une fois et demie).', 'points de santé'),
    sprintTiles: num(0.1, 20, 'Course', 'Chasseurs : vitesse de course pendant la poursuite.', 'tuiles/heure'),
    meat: num(0, 1000, 'Viande', 'Viande que donne le corps d’un adulte à ses chasseurs (un petit en donne selon son poids).', 'kg'),
    migratory: flag('Migrateur', 'Les troupeaux partent vers l’équateur en automne et reviennent au printemps.'),
    migrationTiles: int(0, 1000, 'Distance de migration', 'Distance du voyage saisonnier.', 'tuiles'),
    domesticable: flag('Domesticable', 'Peut être capturé et apprivoisé par ceux qui connaissent l’élevage.'),
    milk: num(0, 20, 'Lait', 'Bête domestique : lait donné à chaque traite par une femelle qui allaite (0 = on ne la trait pas).', 'unités'),
    tameName: text('Nom domestique', 'Nom de la bête apprivoisée (« chèvre », « bœuf », « chien »), au journal.'),
    tameFeminine: flag('Nom féminin', 'Le nom domestique est féminin (« une chèvre »).'),
    wool: num(0, 20, 'Laine', 'Bête domestique : laine donnée par un adulte à chaque tonte (0 = on ne la tond pas).', 'unités'),
    carcass: {
      kind: 'array',
      items: {
        kind: 'object',
        fields: {
          resource: text('Ressource de la dépouille', 'Identifiant d’une ressource de data/resources.json.'),
          amount: num(0, 1000, 'Quantité', 'Quantité de cette ressource que fournira l’animal mort.', 'unités'),
        },
      },
    },
  },
};

export const ANIMALS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    stepsPerDay: int(1, 240, 'Pas par jour', 'Nombre de fois par jour où chaque animal agit et se déplace (24 = une fois par heure de jeu).', 'pas', NEW_WORLD),
    thinkEverySteps: int(1, 64, 'Rythme de réflexion', 'Un animal choisit quoi faire une fois tous ces pas, chacun à son rythme (doit diviser les pas par jour).', 'pas'),
    gridCellTiles: int(2, 256, 'Grille des voisins', 'Taille des cases de la grille qui sert à trouver les voisins (technique : vitesse de calcul).', 'tuiles', NEW_WORLD),
    needs: {
      kind: 'object',
      fields: {
        seekWaterAbove: num(0, 100, 'Seuil de soif', 'Au-dessus de cette soif, l’animal part boire.', 'points'),
        seekFoodAbove: num(0, 100, 'Seuil de faim', 'Au-dessus de cette faim, l’animal cherche à manger (brouter, cueillir, une charogne). La faim est le vide des réserves et de l’estomac : 0 = repu, 100 = plus aucune réserve.', 'points'),
        huntAbove: num(0, 100, 'Faim pour chasser', 'Au-dessus de cette faim, un chasseur part chasser : une chasse coûte cher, on ne la tente que le ventre assez vide.', 'points'),
        thirstBreaksHunt: num(0, 100, 'Soif qui interrompt la chasse', 'Au-dessus de cette soif, un chasseur lâche sa proie pour aller boire.', 'points'),
        fullBelow: num(0, 100, 'Rassasié', 'En dessous de ce niveau, l’animal a fini de manger ou de boire.', 'points'),
        drinkPerStep: num(0, 100, 'Gorgées', 'Points de soif apaisés par pas passé à boire.', 'points/pas'),
        starvationDamagePerDay: num(0, 100, 'Dégâts de la faim', 'Santé perdue par jour quand les réserves sont épuisées (faim à 100).', 'points/jour'),
        thirstDamagePerDay: num(0, 100, 'Dégâts de la soif', 'Santé perdue par jour quand la soif est à 100.', 'points/jour'),
        coldDamagePerDegreeDay: num(0, 20, 'Dégâts du froid', 'Santé perdue par jour et par degré sous la résistance au froid de l’espèce.', 'points/(°C·jour)'),
        regenPerDay: num(0, 100, 'Guérison', 'Santé regagnée par jour quand rien ne nuit à l’animal.', 'points/jour'),
        oldAgeShare: share('Début de la vieillesse', 'Part de la longévité à partir de laquelle l’animal s’affaiblit.'),
        oldAgeDamagePerDay: num(0, 100, 'Dégâts de la vieillesse', 'Santé perdue par jour par un vieil animal.', 'points/jour'),
      },
    },
    energy: {
      kind: 'object',
      fields: {
        basalPerKg075: num(0.01, 100, 'Métabolisme de base', 'Énergie dépensée par jour pour vivre, par kg de masse à la puissance 0,75 (loi de Kleiber : un animal dix fois plus lourd ne dépense que 5,6 fois plus). Le calendrier étant comprimé (une année de 40 jours), un jour de jeu compte pour plusieurs jours de besoins.', 'énergie/jour/kg^0,75'),
        reservePerKg: num(0.01, 100, 'Réserves', 'Énergie que le corps peut stocker (graisse) par kg de masse : le jeûne tolérable croît avec la taille (masse / masse^0,75).', 'énergie/kg'),
        digestPerHour: share('Digestion', 'Part du contenu de l’estomac digérée (passée dans les réserves) chaque heure.'),
        intakePerHour: share('Vitesse d’ingestion', 'Part du plus gros repas qu’un animal avale en une heure.'),
        walkCostPerKg075Tile: num(0, 10, 'Coût de la marche', 'Énergie dépensée pour parcourir une tuile en marchant, par kg^0,75.', 'énergie/tuile/kg^0,75'),
        runCostFactor: num(1, 20, 'Coût de la course', 'Une tuile parcourue en courant (poursuite, fuite) coûte ce nombre de fois plus qu’en marchant.', 'facteur'),
        gestationShare: num(0, 5, 'Coût de la gestation', 'Une femelle pleine dépense en plus cette part de son métabolisme de base.', 'fraction'),
        milkEfficiency: num(0.05, 1, 'Rendement du lait', 'Part de l’énergie prise sur la mère qui arrive à ses petits (le reste est le coût de l’allaitement).', 'fraction'),
        nursingMinCondition: share('Lait tari', 'En dessous de cet état de ses réserves, une mère n’a plus de lait : ses petits jeûnent.'),
        birthMassShare: num(0.001, 1, 'Masse à la naissance', 'Part de la masse adulte d’un nouveau-né ; il grandit jusqu’à l’âge adulte.', 'fraction'),
        startConditionMin: share('Réserves au début du monde', 'Au début du monde, chaque animal a des réserves tirées entre cette part et le plein.'),
        breedingMinCondition: share('État pour se reproduire', 'En dessous de cet état de ses réserves, une femelle ne conçoit pas ; au-dessus, sa fertilité et la taille de sa portée croissent avec son état.'),
        breedingFullCondition: share('Bon état', 'À partir de cet état de ses réserves, une femelle a toute sa fertilité et ses plus grandes portées.'),
        foodEnergy: {
          kind: 'object',
          fields: {
            grass: num(0, 1000, 'Énergie de l’herbe', 'Énergie apportée par une unité d’herbe broutée.', 'énergie/unité'),
            meat: num(0, 1000, 'Énergie de la viande', 'Énergie apportée par un kg de viande (proie ou charogne).', 'énergie/kg'),
            fish: num(0, 1000, 'Énergie du poisson', 'Énergie apportée par une unité de poisson.', 'énergie/unité'),
            produce: num(0, 1000, 'Énergie des récoltes', 'Énergie apportée par une unité de baies, racines ou autre récolte sauvage (et par le fourrage donné aux bêtes domestiques).', 'énergie/unité'),
          },
        },
      },
    },
    hunting: {
      kind: 'object',
      fields: {
        weakPreyFactor: num(1, 10, 'Proie faible', 'Une proie jeune, vieille, malade, blessée ou amaigrie est prise ce nombre de fois plus facilement ; le chasseur la repère et la choisit.', 'facteur'),
        weakPreyHealth: num(0, 100, 'Santé d’une proie faible', 'En dessous de cette santé, une proie compte comme affaiblie.', 'points'),
        weakPreyCondition: share('Proie amaigrie', 'En dessous de cet état de ses réserves, une proie compte comme affaiblie.'),
        sizeResistance: num(0, 10, 'Résistance des grosses proies', 'Force des chasseurs (somme de leurs masses) face à la masse de la proie multipliée par ceci : réussite × force / (force + masse × ceci). Un loup seul vient mal à bout d’un aurochs, une meute oui.', 'facteur'),
        surpriseFactor: num(1, 10, 'Surprise', 'Une proie attaquée avant d’avoir vu le chasseur (elle ne fuyait pas) est prise ce nombre de fois plus facilement.', 'facteur'),
        youngHunterFactor: share('Jeune chasseur', 'Un chasseur pas encore adulte réussit cette part des attaques d’un adulte.'),
        riposteShare: share('Blessures des chasseurs', 'Part de la force de riposte d’une proie qu’un prédateur subit quand elle se défend (une attaque ratée sur un aurochs ou un sanglier peut coûter cher).'),
        groupTiles: num(0.5, 20, 'Chasse en groupe', 'Les chasseurs du même groupe à cette distance de la proie l’attaquent ensemble.', 'tuiles'),
        maxSuccess: share('Réussite maximale', 'Aucune attaque ne réussit à coup sûr.'),
        coverByBiome: { kind: 'record', values: share('Couvert du terrain', 'Végétation qui cache un chasseur à l’affût : la proie le voit d’autant moins loin.') },
        refugeByBiome: { kind: 'record', values: share('Terrain refuge', 'Terrain où une proie échappe plus souvent (rochers, pentes, marais) : part des attaques qui échouent en plus.') },
      },
    },
    vigilance: {
      kind: 'object',
      fields: {
        perMate: num(0, 5, 'Yeux du troupeau', 'Chaque compagnon proche allonge de cette part la distance à laquelle une proie remarque un chasseur (plus d’yeux, détection plus tôt).', 'fraction'),
        maxMates: int(0, 100, 'Vigilance maximale', 'Au-delà de ce nombre de compagnons, la vigilance n’augmente plus.', 'animaux'),
        alarmTiles: num(0, 30, 'Alerte', 'Quand une bête fuit un chasseur, ses compagnons à cette distance fuient avec elle.', 'tuiles'),
        stalkShare: share('Approche discrète', 'Un chasseur qui approche au pas (ou qui passe) n’est remarqué qu’à cette part de la distance de vigilance ; celui qui charge, à toute la distance.'),
        coverShare: share('Effet du couvert', 'Part de la distance de détection perdue dans un couvert épais (couvert du terrain = 1).'),
      },
    },
    territory: {
      kind: 'object',
      fields: {
        preyKgPerPredatorKg: num(1, 10000, 'Gibier par kg de chasseur', 'Un groupe agrandit son territoire jusqu’à y percevoir cette masse de proies par kg de chasseurs, et le réduit quand le gibier abonde (dans la nature : environ 100 kg de proies pour 1 kg de carnivore).', 'kg/kg'),
        adjustShare: share('Ajustement du territoire', 'Part de l’écart à la bonne taille corrigée chaque jour.'),
        abandonShare: share('Territoire abandonné', 'Un groupe dont le territoire, à sa taille maximale, ne contient plus que cette part du gibier qu’il lui faut, le quitte et erre jusqu’à s’installer ailleurs.'),
        overlapShare: num(0, 2, 'Défense du territoire', 'Deux groupes dont les tanières sont plus proches que cette part du plus grand des deux rayons se disputent la place : le plus faible s’en va.', 'fraction'),
        intruderRiskPerDay: share('Risque des intrus', 'Chance par jour qu’un animal seul ou un petit groupe, sur le territoire d’un groupe plus fort et à portée de ses membres, soit tué par eux.'),
        fightTiles: num(0.5, 30, 'Portée d’un combat', 'Un intrus est attaqué si un membre du groupe résident est à cette distance.', 'tuiles'),
        splitBelowCondition: share('Groupe affamé', 'Espèces dont les groupes se scindent : en dessous de cet état moyen des réserves, un groupe se divise en deux.'),
        splitMinSize: int(2, 100, 'Taille pour se scinder', 'Un groupe plus petit ne se divise pas.', 'animaux'),
        mergeAboveCondition: share('Groupe repu', 'Au-dessus de cet état moyen, deux groupes voisins de la même espèce peuvent se réunir.'),
        mergeTiles: num(1, 100, 'Distance pour se réunir', 'Deux groupes plus proches que ceci peuvent se réunir.', 'tuiles'),
      },
    },
    behavior: {
      kind: 'object',
      fields: {
        forageRadius: int(1, 64, 'Rayon de recherche de nourriture', 'Distance à laquelle l’animal cherche à manger (et repère une carcasse).', 'tuiles'),
        forageSamples: int(1, 64, 'Endroits examinés', 'Nombre d’endroits examinés au hasard pour trouver à manger.', 'endroits'),
        cohesionRadius: int(1, 64, 'Cohésion du groupe', 'Au-delà de cette distance du chef, l’animal rejoint son groupe.', 'tuiles'),
        wanderChance: share('Promenade', 'Chance de partir se promener quand l’animal n’a besoin de rien.'),
        wanderRadius: int(1, 64, 'Rayon de promenade', 'Distance maximale d’une promenade.', 'tuiles'),
        huntSearchTiles: num(0, 100, 'Errance d’un solitaire', 'Un chasseur sans territoire (un jeune parti chercher une terre libre) et sans proie en vue part chercher aussi loin. Un groupe qui tient un territoire, lui, le parcourt.', 'tuiles'),
        farForageFactor: num(1, 20, 'Recherche lointaine de nourriture', 'Un herbivore affamé qui ne trouve rien autour de lui regarde ce nombre de fois plus loin (son troupeau le suit) : déplacement vers l’herbe.', 'facteur'),
        fleeDistance: int(1, 64, 'Distance de fuite', 'Distance parcourue en fuyant un chasseur.', 'tuiles'),
        packShareRadius: int(0, 64, 'Partage de la proie', 'Les membres de la meute dans quatre fois ce rayon viennent manger la proie.', 'tuiles'),
        lonerJoinRadius: int(0, 200, 'Recherche d’un groupe', 'Distance à laquelle un animal seul trouve un groupe de son espèce.', 'tuiles'),
        waterSearchTiles: int(1, 2000, 'Recherche de l’eau', 'Distance maximale du chemin connu vers l’eau douce.', 'tuiles', NEW_WORLD),
        spawnSiteAttempts: int(1, 1000000, 'Recherche d’un territoire', 'Lieux essayés pour chaque meute de départ (un chasseur ne s’installe que là où vit assez de gibier, hors du territoire d’une autre meute) ; faute de lieu, il y a moins de chasseurs au départ.', 'essais', NEW_WORLD),
        migrationCandidates: int(1, 100, 'Choix de la destination', 'Un troupeau qui migre compare ce nombre d’endroits dans la bonne direction et va vers celui où il y a le plus d’herbe, avec de l’eau à portée.', 'endroits'),
        migrationMaxDays: int(1, 200, 'Durée maximale d’une migration', 'Une migration s’arrête au plus tard après ce nombre de jours.', 'jours'),
        breedingMinHealth: num(0, 100, 'Santé pour se reproduire', 'Santé minimale d’une femelle pour concevoir.', 'points'),
        mateRadius: int(1, 200, 'Recherche d’un partenaire', 'Une femelle trouve un mâle adulte de son espèce dans ce rayon.', 'tuiles'),
      },
    },
    sickness: {
      kind: 'object',
      fields: {
        outbreakPerDay: num(0, 0.1, 'Maladie spontanée', 'Chance par jour qu’un animal sain tombe malade de lui-même (parasites, mauvaise eau).', 'chance/jour'),
        contagionTiles: num(0, 10, 'Contagion', 'Un animal malade peut contaminer les animaux de son espèce à moins de cette distance.', 'tuiles'),
        transmitPerDay: share('Transmission', 'Chance par jour qu’un animal malade contamine chacun de ses voisins de la même espèce.'),
        sickDays: int(1, 100, 'Durée de la maladie', 'Jours pendant lesquels un animal reste malade (il ne se reproduit pas).', 'jours'),
        damagePerDay: num(0, 100, 'Gravité', 'Santé perdue par jour par un animal malade (il en meurt si sa santé tombe à zéro).', 'points/jour'),
        immuneDays: int(0, 2000, 'Immunité', 'Après la guérison, l’animal ne retombe pas malade pendant ce nombre de jours.', 'jours'),
      },
    },
    movement: {
      kind: 'object',
      fields: {
        accelTilesPerHour2: num(0.5, 100, 'Accélération', 'Changement de vitesse possible en une heure : démarrer, freiner, tourner (plus faible = virages plus larges).', 'tuiles/heure²'),
        panicRunFactor: num(1, 4, 'Course de panique', 'Une proie qui fuit un prédateur court à sa vitesse de marche multipliée par ce facteur.', 'facteur'),
        wanderSpeedShare: share('Allure de promenade', 'Un animal rassasié qui se promène marche à cette part de sa vitesse (affamé, il cherche à manger à pleine allure).'),
        arriveTiles: num(0.05, 2, 'Arrivée', 'Distance à laquelle l’animal est arrivé là où il allait.', 'tuiles'),
        personalSpaceTiles: num(0, 3, 'Espace personnel', 'Distance en dessous de laquelle deux animaux s’écartent doucement l’un de l’autre.', 'tuiles'),
        avoidTilesPerHour: num(0, 10, 'Évitement', 'Force avec laquelle deux animaux trop proches s’écartent.', 'tuiles/heure'),
        herdSpacingTiles: num(0.2, 5, 'Espacement du troupeau', 'Distance typique entre deux bêtes d’un troupeau qui avance ou se repose.', 'tuiles'),
        herdSlackTiles: num(0.2, 20, 'Souplesse du troupeau', 'Une bête rejoint sa place dans le troupeau quand elle s’en écarte de plus que cette distance.', 'tuiles'),
        encircleTiles: num(0, 20, 'Encerclement', 'Les chasseurs d’une meute approchent la proie de plusieurs côtés, à cette distance, avant de se ruer dessus.', 'tuiles'),
        catchTiles: num(0.3, 3, 'Contact', 'Distance à laquelle un chasseur peut terrasser sa proie.', 'tuiles'),
      },
    },
    fish: {
      kind: 'object',
      fields: {
        maxAmount: int(1, 255, 'Poisson maximal', 'Poisson sur une tuile d’eau la plus riche.', 'unités', NEW_WORLD),
        regrowthPerDay: num(0, 100, 'Renouvellement du poisson', 'Poisson regagné par jour sur une tuile.', 'unités/jour'),
        updateIntervalDays: int(1, 365, 'Rythme de mise à jour du poisson', 'Chaque tuile d’eau n’est mise à jour qu’une fois tous ces jours.', 'jours'),
        capacityByWater: {
          kind: 'object',
          fields: {
            river: num(0, 1, 'Poisson des rivières', 'Part du poisson maximal dans une rivière.', 'fraction', NEW_WORLD),
            lake: num(0, 1, 'Poisson des lacs', 'Part du poisson maximal dans un lac.', 'fraction', NEW_WORLD),
            coast: num(0, 1, 'Poisson des côtes', 'Part du poisson maximal près des côtes.', 'fraction', NEW_WORLD),
            openSea: num(0, 1, 'Poisson du large', 'Part du poisson maximal en haute mer.', 'fraction', NEW_WORLD),
          },
        },
        coastMaxDepthMeters: num(0, 11000, 'Profondeur des eaux côtières', 'Jusqu’à cette profondeur, la mer compte comme côtière (plus poissonneuse).', 'm', NEW_WORLD),
      },
    },
    carrion: {
      kind: 'object',
      fields: {
        halfLifeDays: num(0.2, 100, 'Pourriture d’une carcasse', 'Jours pour que la moitié de la viande d’une carcasse pourrisse à la température de référence.', 'jours'),
        referenceCelsius: num(-30, 40, 'Température de référence', 'Température à laquelle la carcasse pourrit au rythme indiqué.', '°C'),
        doublingCelsius: num(1, 40, 'Chaleur et pourriture', 'Tous ces degrés de plus, la viande pourrit deux fois plus vite (deux fois moins vite en dessous).', '°C'),
        minFactor: num(0, 1, 'Froid qui conserve', 'Dans le grand froid, la viande pourrit au plus lentement à ce facteur du rythme de référence.', 'facteur'),
        maxFactor: num(1, 10, 'Chaleur extrême', 'Dans la grande chaleur, la viande pourrit au plus vite à ce facteur du rythme de référence.', 'facteur'),
        minimumMeat: num(0, 100, 'Restes', 'En dessous de cette quantité, la carcasse disparaît.', 'unités'),
      },
    },
    stats: { kind: 'object', fields: { intervalDays: int(1, 400, 'Fréquence du recensement', 'Les animaux sont comptés tous ces jours (courbes du panneau Statistiques).', 'jours') } },
    humanFear: {
      kind: 'object',
      fields: {
        warinessSpread: num(0, 1, 'Écart de prudence', 'Chaque animal naît plus ou moins prudent : sa distance de méfiance varie de ± cette fraction autour de celle de son espèce.', 'fraction', NEW_WORLD),
        crowdShare: num(0, 2, 'Crainte des groupes', 'Prédateurs : chaque personne de plus autour de celle qu’il voit allonge sa distance de méfiance de cette fraction (un camp, un groupe font plus peur qu’une personne seule).', 'fraction'),
        crowdMax: int(1, 50, 'Taille de groupe la plus effrayante', 'Au-delà de ce nombre de personnes ensemble, un prédateur n’a pas plus peur.', 'personnes'),
        crowdTiles: num(0.5, 20, 'Distance d’un groupe', 'Les personnes à moins de cette distance de celle que voit le prédateur comptent comme son groupe.', 'tuiles'),
        busyShare: share('Prédateur occupé', 'Un prédateur qui poursuit ou mange sa proie ne lâche prise que devant un humain plus proche : cette part de sa distance de méfiance.'),
        tamerShare: share('Approche de l’éleveur', 'Un éleveur qui s’approche doucement d’une bête sauvage pour la capturer (lentement, sans arme) n’est remarqué qu’à cette part de la distance de méfiance.'),
        driveOffFactor: num(1, 5, 'Chasser un prédateur', 'Une personne qui chasse un prédateur du camp (cris, feu, armes) est remarquée de cette fois plus loin, même par un prédateur affamé.', 'facteur'),
      },
    },
    humanPrey: {
      kind: 'object',
      fields: {
        hunters: { kind: 'array', items: text('Prédateur des humains', 'Identifiant d’une espèce qui peut attaquer une personne seule.') },
        minHunger: num(0, 100, 'Faim avant d’attaquer un humain', 'Faim minimale d’un prédateur pour prendre en chasse une personne seule.', 'points'),
        loneTiles: int(1, 30, 'Personne seule', 'Une personne sans personne d’autre à cette distance est une proie possible ; un prédateur n’attaque pas un groupe.', 'tuiles'),
        attackChancePerStep: share('Attaque', 'Chance par pas (une heure de jeu) qu’un prédateur au contact d’une personne seule l’attaque.'),
        attackDamage: num(1, 100, 'Blessure', 'Santé perdue par la personne à chaque attaque.', 'points'),
      },
    },
    domestic: {
      kind: 'object',
      fields: {
        pastureTiles: num(1, 30, 'Pâture', 'Une bête domestique broute et vit à cette distance de son enclos (ou du camp sans enclos), et y boit à l’abreuvoir.', 'tuiles'),
        tamePerDay: num(0, 1, 'Apprivoisement', 'Ce qu’une bête capturée gagne chaque jour en docilité (1 = apprivoisée ; ses petits naissent apprivoisés).', 'par jour'),
        escapePerDay: num(0, 1, 'Fuite', 'Chance par jour qu’une bête tout juste capturée s’échappe (diminue à mesure qu’elle s’apprivoise).', 'chance/jour'),
        hungerEscape: num(0, 20, 'Faim et fuite', 'Une bête affamée s’échappe jusqu’à (1 + ceci) fois plus souvent.', 'facteur'),
        noPenEscape: num(1, 20, 'Sans enclos', 'Une bête gardée sans enclos s’échappe ce nombre de fois plus souvent.', 'facteur'),
        starvingEscape: num(0, 1, 'Faim extrême', 'Chance par jour, en plus, qu’une bête à bout de faim s’échappe même apprivoisée.', 'chance/jour'),
        causeNames: { kind: 'array', minLength: 8, maxLength: 8, items: text('Cause de mort', 'Comment on dit la mort d’une bête domestique au journal (vieillesse, faim, soif, froid, prédateurs, abattage, maladie, blessures).') },
        texts: {
          kind: 'object',
          fields: {
            escape: text('Fuite (journal)', 'Une bête domestique s’échappe : {animal}, {peuple}, {raison}, {lieu}.'),
            wild: text('Raison : encore sauvage', 'Raison d’une fuite d’une bête peu apprivoisée.'),
            noPen: text('Raison : pas d’enclos', 'Raison d’une fuite d’une bête gardée sans enclos.'),
            starving: text('Raison : faim', 'Raison d’une fuite d’une bête affamée.'),
            deathsOne: text('Mort d’une bête (journal)', 'Une bête domestique est morte : {animal}, {peuple}, {causes}.'),
            unknownKeeper: text('Propriétaire inconnu', 'Dit à la place du peuple tant que les gardiens n’ont pas de nom (« du camp »).'),
            deathsMany: text('Morts de bêtes (journal)', 'Plusieurs bêtes domestiques sont mortes le même jour : {n}, {animaux}, {peuple}, {causes}.'),
            releasedOne: text('Bête rendue à la nature (journal)', 'Une bête dont le camp n’existe plus retourne à l’état sauvage : {Un}, {animal}, {peuple}.'),
            releasedMany: text('Bêtes rendues à la nature (journal)', 'Plusieurs bêtes dont le camp n’existe plus retournent à l’état sauvage : {n}, {animaux}, {peuple}.'),
          },
        },
      },
    },
    events: {
      kind: 'object',
      fields: {
        collapseShare: share('Effondrement', 'Part de la population perdue dans une région frappée par une épreuve pour parler d’effondrement.'),
        collapseMinPopulation: int(1, 100000, 'Population pour un effondrement', 'Population minimale au début de l’épreuve pour qu’un effondrement soit signalé.', 'animaux'),
        extinctionMinLandmassTiles: int(1, 10000000, 'Terre pour une disparition', 'Les disparitions ne sont signalées que sur les terres d’au moins cette taille.', 'tuiles'),
        extinctionMinPreviousPopulation: int(1, 100000, 'Population établie', 'Une espèce ne « disparaît » d’une terre que si elle y a compté au moins ce nombre d’animaux.', 'animaux'),
        migrationMinAnimals: int(1, 100000, 'Grande migration', 'Nombre d’animaux qui partent le même jour pour parler de grande migration.', 'animaux'),
        migrationEventEveryYears: int(1, 100, 'Rappel des migrations', 'Une même migration n’est racontée qu’une fois en ce nombre d’années.', 'ans'),
        migrationText: text('Phrase d’une migration', `Phrase du journal. ${TEMPLATE_HELP}`),
        extinctionText: text('Phrase d’une disparition', `Phrase du journal. ${TEMPLATE_HELP}`),
        collapseText: text('Phrase d’un effondrement', `Phrase du journal. ${TEMPLATE_HELP}`),
      },
    },
    species: { kind: 'array', minLength: 1, items: SPECIES_SCHEMA },
  },
};

const FILE = 'data/animals.json';
/** Species codes are stored in a Uint8Array. */
const MAX_SPECIES = 255;

export function parseFaunaParams(raw: unknown, biomes: BiomeTable, resources: ResourceCatalog, plantResources: readonly string[]): FaunaParams {
  const params = validateData<FaunaParams>(FILE, raw, ANIMALS_SCHEMA);
  const problems: string[] = [];
  const biomeIds = new Set(biomes.biomes.map((biome) => biome.id));
  const speciesIds = new Set(params.species.map((species) => species.id));
  const foods = new Set(['grass', 'meat', 'fish', ...plantResources]);
  if (speciesIds.size !== params.species.length) problems.push('deux animaux ont le même « id ».');
  if (params.species.length > MAX_SPECIES) problems.push(`au plus ${MAX_SPECIES} espèces animales sont possibles.`);
  if (params.stepsPerDay % params.thinkEverySteps !== 0) problems.push('« stepsPerDay » doit être un multiple de « thinkEverySteps ».');
  for (const table of [params.hunting.coverByBiome, params.hunting.refugeByBiome]) {
    for (const id of Object.keys(table)) if (!biomeIds.has(id)) problems.push(`« hunting » : le biome « ${id} » n'existe pas.`);
  }
  for (const id of params.humanPrey.hunters) if (!speciesIds.has(id)) problems.push(`« humanPrey.hunters » : l'animal « ${id} » n'existe pas.`);
  for (const species of params.species) {
    const where = `animal « ${species.id} »`;
    for (const id of Object.keys(species.habitat)) if (!biomeIds.has(id)) problems.push(`${where} : le biome « ${id} » n'existe pas.`);
    for (const id of species.prey) if (!speciesIds.has(id)) problems.push(`${where} : la proie « ${id} » n'existe pas.`);
    for (const food of Object.keys(species.diet)) {
      if (!foods.has(food)) problems.push(`${where} : la nourriture « ${food} » n'est produite par aucune plante (ni herbe, viande, poisson).`);
    }
    if (species.prey.length > 0 && !('meat' in species.diet)) problems.push(`${where} : un chasseur doit avoir « meat » dans « diet ».`);
    if (species.groupSize[0] > species.groupSize[1]) problems.push(`${where} : « groupSize » doit être [min, max].`);
    if (species.litter[0] > species.litter[1]) problems.push(`${where} : « litter » doit être [min, max].`);
    if (species.territoryMinTiles > species.territoryMaxTiles) problems.push(`${where} : « territoryMinTiles » doit être inférieur ou égal à « territoryMaxTiles ».`);
    if (species.prey.length > 0 && species.huntRadius <= 0) problems.push(`${where} : un chasseur doit voir ses proies (« huntRadius » > 0).`);
    problems.push(...unknownResources(resources, species.carcass.map((item) => item.resource), where));
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
