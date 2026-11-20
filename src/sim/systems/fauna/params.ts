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
  /** Chance per day, for a fertile female during the mating season. */
  conceptionChance: number;
  /** A mother does not conceive again for this many days after giving birth (she raises her young). */
  birthIntervalDays: number;
  /** Territory: a female does not breed if more than `crowdingMax` animals of her species live within `crowdingRadius` tiles. */
  crowdingRadius: number;
  crowdingMax: number;
  /**
   * Packs that hold a territory of this radius around their den (0 = none). For them, the pack's
   * territory replaces the crowding rule: a pack yields to a stronger one and only a pack that
   * holds its land raises young.
   */
  territoryTiles: number;
  /** Territorial species: chance per year that a young adult (not the dominant one) leaves its pack to found its own. */
  dispersalPerYear: number;
  /**
   * Hunters: prey giving at least this much meat is preferred; smaller prey is hunted only when no
   * such big game is in reach (0 = the nearest prey, whatever its size).
   */
  bigPreyMeat: number;
  /** Hunters only: a female breeds only if she sees at least `breedingMinPrey` prey within `preyCheckRadius` tiles. */
  preyCheckRadius: number;
  breedingMinPrey: number;
  hungerPerDay: number;
  /** Food units that cover one day of hunger. */
  foodPerDay: number;
  thirstPerDay: number;
  /** Below this temperature, the animal suffers from the cold. */
  minCelsius: number;
  /** Walking speed, tiles per hour. */
  walkTilesPerHour: number;
  /** Prey only: distance (tiles) at which a hunter is noticed. */
  fleeRadius: number;
  /** Distance at which an animal of average wariness notices a hunter and runs away (0 = does not fear humans). */
  humanFleeTiles: number;
  /** Running speed while fleeing a human, tiles per hour. */
  fleeSprintTiles: number;
  /** Hunters only: distance at which prey is looked for. */
  huntRadius: number;
  /** Hunters only: chance per step to bring down an adjacent prey. */
  huntSuccess: number;
  /** Chance that the animal fights back when a human hunter strikes it, and the health a blow removes. */
  riposteChance: number;
  riposteDamage: number;
  /** Hunters only: running speed while chasing, tiles per hour. */
  sprintTiles: number;
  /** Food units its body gives to the hunters who kill it. */
  meat: number;
  migratory: boolean;
  /** Distance of the seasonal migration toward the equator (autumn) and back (spring). */
  migrationTiles: number;
  /** Can be tamed later (herding). */
  domesticable: boolean;
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
    fullBelow: number;
    drinkPerStep: number;
    starvationDamagePerDay: number;
    thirstDamagePerDay: number;
    coldDamagePerDegreeDay: number;
    regenPerDay: number;
    oldAgeShare: number;
    oldAgeDamagePerDay: number;
  };
  behavior: {
    forageRadius: number;
    forageSamples: number;
    cohesionRadius: number;
    wanderChance: number;
    wanderRadius: number;
    /** A hungry hunter with no prey in reach goes looking this far (the leader takes its pack along). */
    huntSearchTiles: number;
    fleeDistance: number;
    chaseSteps: number;
    packShareRadius: number;
    lonerJoinRadius: number;
    waterSearchTiles: number;
    migrationMaxDays: number;
    breedingMinHealth: number;
    breedingMaxHunger: number;
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
  /** Carcasses: share of the meat that rots each day, and scraps below which they vanish. */
  carrion: { rotPerDay: number; minimumMeat: number };
  stats: { intervalDays: number };
  /** Predators and humans: who may attack a person walking alone, and how. */
  /** How game perceives humans: individual wariness, people who are not hunting. */
  humanFear: { warinessSpread: number; calmShare: number };
  humanPrey: { hunters: string[]; minHunger: number; loneTiles: number; attackChancePerStep: number; attackDamage: number };
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
    birthIntervalDays: int(0, 400, 'Intervalle entre portées', 'Une mère ne conçoit pas de nouveau pendant ce nombre de jours après une mise bas : elle élève ses petits.', 'jours'),
    crowdingRadius: int(1, 64, 'Rayon du territoire', 'Une femelle ne met pas bas si trop d’animaux de son espèce vivent dans ce rayon.', 'tuiles'),
    crowdingMax: int(1, 10000, 'Voisins tolérés', 'Nombre maximal d’animaux de l’espèce dans le territoire pour qu’une femelle se reproduise.', 'animaux'),
    territoryTiles: int(0, 200, 'Territoire de meute', 'Meutes territoriales (0 = non) : rayon défendu autour de la tanière. Une meute cède la place à une plus forte, et seule une meute qui tient son territoire élève des petits (au lieu de la règle des voisins tolérés).', 'tuiles'),
    bigPreyMeat: num(0, 1000, 'Gros gibier préféré', 'Chasseurs : une proie qui donne au moins cette viande est préférée ; les plus petites ne sont chassées que faute de gros gibier à portée (0 = la plus proche, quelle que soit sa taille).', 'viande'),
    dispersalPerYear: num(0, 1, 'Dispersion des jeunes', 'Espèces territoriales : chance par an qu’un jeune adulte quitte sa meute pour en fonder une avec un autre solitaire, sur une terre libre.', 'probabilité'),
    preyCheckRadius: int(0, 64, 'Rayon du gibier', 'Chasseurs : rayon où la femelle compte le gibier avant d’élever des petits.', 'tuiles'),
    breedingMinPrey: int(0, 100000, 'Gibier nécessaire', 'Chasseurs : nombre minimal de proies dans ce rayon pour se reproduire (0 = pas de condition).', 'proies'),
    hungerPerDay: num(0, 100, 'Faim', 'Points de faim gagnés par jour (100 = affamé).', 'points/jour'),
    foodPerDay: num(0.01, 100, 'Ration', 'Unités de nourriture qui couvrent une journée de faim.', 'unités/jour'),
    thirstPerDay: num(0, 100, 'Soif', 'Points de soif gagnés par jour (100 = assoiffé).', 'points/jour'),
    minCelsius: num(-80, 40, 'Résistance au froid', 'En dessous de cette température, l’animal souffre du froid.', '°C'),
    walkTilesPerHour: num(0.1, 20, 'Vitesse de marche', 'Distance parcourue en une heure de jeu en marchant.', 'tuiles/heure'),
    fleeRadius: int(0, 64, 'Distance de fuite', 'Proies : distance à laquelle un chasseur est remarqué (0 = ne fuit jamais).', 'tuiles'),
    humanFleeTiles: int(0, 64, 'Méfiance envers les humains', 'Gibier : distance à laquelle un animal de prudence moyenne remarque un chasseur humain et s’enfuit (0 = ne craint pas les humains). Plus le chasseur est proche, plus il a de chances d’être remarqué.', 'tuiles'),
    fleeSprintTiles: num(0.1, 20, 'Course de fuite', 'Gibier : vitesse de course en fuyant un humain.', 'tuiles/heure'),
    huntRadius: int(0, 64, 'Rayon de chasse', 'Chasseurs : distance à laquelle une proie est repérée.', 'tuiles'),
    huntSuccess: share('Réussite de la chasse', 'Chasseurs : chance par pas de terrasser une proie à son contact.'),
    riposteChance: share('Riposte', 'Chance que l’animal se défende quand un chasseur humain le frappe (charge, coups de cornes, de défenses ou de griffes).'),
    riposteDamage: num(0, 200, 'Force de la riposte', 'Santé qu’enlève à un chasseur un coup de l’animal qui se défend (au hasard entre la moitié et une fois et demie).', 'points de santé'),
    sprintTiles: num(0.1, 20, 'Course', 'Chasseurs : vitesse de course pendant la poursuite.', 'tuiles/heure'),
    meat: num(0, 1000, 'Viande', 'Unités de nourriture que donne le corps d’un adulte à ses chasseurs (moitié pour un petit).', 'unités'),
    migratory: flag('Migrateur', 'Les troupeaux partent vers l’équateur en automne et reviennent au printemps.'),
    migrationTiles: int(0, 1000, 'Distance de migration', 'Distance du voyage saisonnier.', 'tuiles'),
    domesticable: flag('Domesticable', 'Pourra être apprivoisé quand l’élevage existera (sans effet pour l’instant).'),
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
        seekFoodAbove: num(0, 100, 'Seuil de faim', 'Au-dessus de cette faim, l’animal cherche à manger.', 'points'),
        fullBelow: num(0, 100, 'Rassasié', 'En dessous de ce niveau, l’animal a fini de manger ou de boire.', 'points'),
        drinkPerStep: num(0, 100, 'Gorgées', 'Points de soif apaisés par pas passé à boire.', 'points/pas'),
        starvationDamagePerDay: num(0, 100, 'Dégâts de la faim', 'Santé perdue par jour quand la faim est à 100.', 'points/jour'),
        thirstDamagePerDay: num(0, 100, 'Dégâts de la soif', 'Santé perdue par jour quand la soif est à 100.', 'points/jour'),
        coldDamagePerDegreeDay: num(0, 20, 'Dégâts du froid', 'Santé perdue par jour et par degré sous la résistance au froid de l’espèce.', 'points/(°C·jour)'),
        regenPerDay: num(0, 100, 'Guérison', 'Santé regagnée par jour quand rien ne nuit à l’animal.', 'points/jour'),
        oldAgeShare: share('Début de la vieillesse', 'Part de la longévité à partir de laquelle l’animal s’affaiblit.'),
        oldAgeDamagePerDay: num(0, 100, 'Dégâts de la vieillesse', 'Santé perdue par jour par un vieil animal.', 'points/jour'),
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
        huntSearchTiles: num(0, 100, 'Battre la campagne', 'Un chasseur affamé sans proie à portée part chercher aussi loin (le meneur emmène sa meute ; il revient vers sa tanière une fois repu).', 'tuiles'),
        fleeDistance: int(1, 64, 'Distance de fuite', 'Distance parcourue en fuyant un chasseur.', 'tuiles'),
        chaseSteps: int(1, 500, 'Durée d’une poursuite', 'Un chasseur abandonne après ce nombre de pas de poursuite.', 'pas'),
        packShareRadius: int(0, 64, 'Partage de la proie', 'Les membres de la meute dans quatre fois ce rayon viennent manger la proie.', 'tuiles'),
        lonerJoinRadius: int(0, 200, 'Recherche d’un groupe', 'Distance à laquelle un animal seul trouve un groupe de son espèce.', 'tuiles'),
        waterSearchTiles: int(1, 2000, 'Recherche de l’eau', 'Distance maximale du chemin connu vers l’eau douce.', 'tuiles', NEW_WORLD),
        migrationMaxDays: int(1, 200, 'Durée maximale d’une migration', 'Une migration s’arrête au plus tard après ce nombre de jours.', 'jours'),
        breedingMinHealth: num(0, 100, 'Santé pour se reproduire', 'Santé minimale d’une femelle pour concevoir.', 'points'),
        breedingMaxHunger: num(0, 100, 'Faim pour se reproduire', 'Au-dessus de cette faim, une femelle ne conçoit pas.', 'points'),
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
        rotPerDay: share('Pourriture', 'Part de la viande d’une carcasse qui pourrit chaque jour.'),
        minimumMeat: num(0, 100, 'Restes', 'En dessous de cette quantité, la carcasse disparaît.', 'unités'),
      },
    },
    stats: { kind: 'object', fields: { intervalDays: int(1, 400, 'Fréquence du recensement', 'Les animaux sont comptés tous ces jours (courbes du panneau Statistiques).', 'jours') } },
    humanFear: {
      kind: 'object',
      fields: {
        warinessSpread: num(0, 1, 'Écart de prudence', 'Chaque animal naît plus ou moins prudent : sa distance de méfiance varie de ± cette fraction autour de celle de son espèce.', 'fraction', NEW_WORLD),
        calmShare: share('Humains paisibles', 'Une personne qui ne chasse pas inquiète moins : elle n’est remarquée qu’à cette fraction de la distance de méfiance.'),
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
    problems.push(...unknownResources(resources, species.carcass.map((item) => item.resource), where));
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
