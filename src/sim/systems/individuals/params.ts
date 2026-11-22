import { choice, DataFileError, identifier, text, validateData, variable, type Schema } from '../../core/data-validation';
import { CONVERSATIONS, type ConversationKind } from './social/params';
import { SOCIAL_INPUTS } from './social/inputs';
import { LIFE_INPUTS } from './life/inputs';

/** Inputs an action's score can depend on (all normalized to 0..1). */
export const INPUTS = [
  'hunger',
  'thirst',
  'fatigue',
  'cold',
  'danger',
  'night',
  'day',
  'hasFood',
  'load',
  'depositUrge',
  'hasFuel',
  'fireLow',
  'fireLit',
  'awayFromCamp',
  'isolation',
  'stockLow',
  'woodLow',
  'buildNeed',
  'craftNeed',
  'herdNeed',
  'always',
  'warCall',
  'envoyCall',
  'threatNearCamp',
  ...SOCIAL_INPUTS,
  ...LIFE_INPUTS,
] as const;
export type Input = (typeof INPUTS)[number];

/** Built-in behaviours; each data action names one of them (work behaviours run recipes of data/recipes.json). */
export const BEHAVIORS = ['drink', 'eat', 'harvest', 'deposit', 'tend_fire', 'build', 'craft', 'warm_up', 'sleep', 'return_camp', 'flee', 'stay_with_group', 'rest', 'converse', 'give', 'carried', 'follow_guardian', 'play', 'mission', 'herd', 'drive_off'] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export interface Consideration {
  input: Input;
  /** linear: a·x + b · power: x^a · logistic: 1 / (1 + e^(−b·(x − a))) */
  curve: 'linear' | 'power' | 'logistic';
  a: number;
  b: number;
}

export interface ActionDef {
  id: string;
  behavior: Behavior;
  /** Recipes a work behaviour may use (harvest: the first possible one; fire: the fuel recipe). */
  recipes?: string[];
  /** Items a harvest is after (empty = whatever the source gives). */
  items?: string[];
  /** Youngest age at which a person does this. */
  minAge?: number;
  name: string;
  /** Shown in the character sheet ("Va boire"). */
  label: string;
  weight: number;
  /** Input shown as the reason of the action ("soif 72 %"). */
  reason: Input;
  considerations: Consideration[];
  /** Trait id → strength: the score is multiplied by 1 + strength × (2 × trait − 1). */
  traits: Record<string, number>;
  /** Knowledge needed to perform the action. */
  requires?: string;
  /** Kind of conversation (behaviour "converse"). */
  conversation?: ConversationKind;
  /** Skills the action practises (someone who wants to master one of them prefers the action). */
  skills?: string[];
}

export interface HumanParams {
  tribe: {
    count: number;
    size: number;
    elderShare: number;
    childrenPerCouple: [number, number];
    adultAge: [number, number];
    elderAge: [number, number];
    childAge: [number, number];
    campRadius: number;
    campSpacingTiles: number;
  };
  site: { candidates: number; minCelsius: number; maxCelsius: number; waterMaxTiles: number; foodRadius: number; minFoodPlants: number };
  traits: { id: string; name: string }[];
  skills: { id: string; name: string; profession: string; professionFemale: string }[];
  skillLearning: { learnPerHour: number; professionMinHours: number };
  stepsPerHour: number;
  thinkEveryMinutes: number;
  needs: {
    hungerPerHour: number;
    sleepHungerFactor: number;
    thirstPerHour: number;
    /** Share of the walk to the nearest known water counted in the urge to drink (one leaves in time). */
    thirstAnticipation: number;
    fatiguePerHour: number;
    restPerHour: number;
    comfortCelsius: number;
    coldPerDegreeHour: number;
    warmingPerHour: number;
    dangerDecayPerHour: number;
    starvationDamagePerHour: number;
    thirstDamagePerHour: number;
    coldDamagePerHour: number;
    regenPerHour: number;
  };
  body: {
    walkTilesPerHour: number;
    fleeSpeedFactor: number;
    perceptionTiles: number;
    exploreTiles: number;
    carryCapacity: number;
    hungerPerFoodUnit: number;
    eatUnitsPerHour: number;
    drinkPerHour: number;
  };
  /** Natural movement (core/motion): steering, avoidance, spots at rest, speed, walking together. */
  movement: {
    accelTilesPerHour2: number;
    arriveTiles: number;
    cornerTiles: number;
    smoothLookaheadTiles: number;
    personalSpaceTiles: number;
    avoidTilesPerHour: number;
    spotOffsetTiles: number;
    fireRingTiles: number;
    fireRingSpread: number;
    marshSpeed: number;
    snowSlowdown: number;
    slopeSlowdownPer100m: number;
    fatigueSlowdown: number;
    loadSlowdown: number;
    runFatigueFactor: number;
    companionTiles: number;
    besideTiles: number;
    companionPullTiles: number;
    followBehindTiles: number;
    followNearTiles: number;
    talkTiles: number;
    stuckSteps: number;
  };
  camp: { shelterMaxCelsius: number; besideFireCelsius: number; homeRadiusTiles: number };
  memory: { waterSlots: number; foodSlots: number; forgetDays: number; waterForgetDays: number; waterSearchSteps: number };
  danger: {
    predators: string[];
    alertTiles: number;
    isolationTiles: number;
    groupFearShare: number;
    sightFearShare: number;
    campGuardTiles: number;
    corpseMeat: number;
  };
  terrain: { forestCost: number; shrubCost: number; riverCost: number; slopeCostPer100m: number; maxPathNodes: number; heuristicWeight: number };
  decision: { randomness: number; keepCurrentBonus: number; keepWorkBonus: number; depositAtCamp: number };
  actions: ActionDef[];
  deathTexts: { hunger: string; thirst: string; cold: string; predator: string; oldAge: string; disease: string; childbirth: string; violence: string };
  settlementText: string;
  campMove: {
    forageFarTiles: number;
    memory: number;
    curiosityEffect: number;
    consensusShare: number;
    minDaysBetweenMoves: number;
    minMoveTiles: number;
    waterMaxTiles: number;
    minAdults: number;
  };
}

type Apply = 'live' | 'newWorld';
const v = (kind: 'integer' | 'number', min: number, max: number, label: string, help: string, unit: string, apply: Apply = 'live'): Schema =>
  variable(kind, min, max, { label, help, unit, apply });
const pair = (min: number, max: number, label: string, help: string, unit: string, apply: Apply = 'live'): Schema => ({
  kind: 'array',
  minLength: 2,
  maxLength: 2,
  items: v('number', min, max, label, help, unit, apply),
});
const ID_PATTERN = { pattern: /^[a-z_]+$/, hint: 'un identifiant en minuscules (a-z, _)' };
const namedList = (what: string): Schema => ({
  kind: 'array',
  minLength: 1,
  items: {
    kind: 'object',
    fields: { id: identifier('Identifiant', `Nom technique (${what}).`), name: text('Nom', `Nom affiché (${what}).`, 'newWorld') },
  },
});
const DEATH_HELP = 'Phrase du journal. Remplacements : {nom}, {e} (« e » pour une femme), {lieu}, {un_animal}, {age}, {aggravation} (« , affaibli par la faim » quand la faim ou le froid avaient affaibli la personne).';

export const HUMANS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    tribe: {
      kind: 'object',
      fields: {
        count: v('integer', 1, 500, 'Nombre de tribus', 'Tribus créées au début (1 dans le jeu ; davantage pour les tests de charge).', 'tribus', 'newWorld'),
        size: v('integer', 2, 200, 'Taille de la tribu', 'Nombre de personnes dans chaque tribu de départ.', 'personnes', 'newWorld'),
        elderShare: v('number', 0, 0.5, 'Part d’anciens', 'Part des adultes de la tribu de départ qui sont des anciens.', 'fraction', 'newWorld'),
        childrenPerCouple: pair(0, 10, 'Enfants par couple', 'Nombre d’enfants d’un couple de départ [min, max].', 'enfants', 'newWorld'),
        adultAge: pair(14, 60, 'Âge des adultes', 'Âge des adultes de départ [min, max].', 'ans', 'newWorld'),
        elderAge: pair(40, 90, 'Âge des anciens', 'Âge des anciens de départ [min, max].', 'ans', 'newWorld'),
        childAge: pair(0, 17, 'Âge des enfants', 'Âge des enfants de départ [min, max].', 'ans', 'newWorld'),
        campRadius: v('integer', 1, 10, 'Rayon du camp', 'Distance maximale entre le feu et les huttes.', 'tuiles', 'newWorld'),
        campSpacingTiles: v('integer', 5, 300, 'Écart entre camps', 'Distance minimale entre deux camps de départ (tests de charge).', 'tuiles', 'newWorld'),
      },
    },
    site: {
      kind: 'object',
      fields: {
        candidates: v('integer', 100, 100000, 'Lieux examinés', 'Nombre de lieux tirés au hasard parmi lesquels on choisit le meilleur emplacement de camp.', 'lieux', 'newWorld'),
        minCelsius: v('number', -20, 30, 'Température minimale du site', 'Température moyenne annuelle minimale d’un emplacement de camp.', '°C', 'newWorld'),
        maxCelsius: v('number', -10, 40, 'Température maximale du site', 'Température moyenne annuelle maximale d’un emplacement de camp.', '°C', 'newWorld'),
        waterMaxTiles: v('integer', 1, 30, 'Distance de l’eau', 'Distance maximale entre le camp et l’eau douce.', 'tuiles', 'newWorld'),
        foodRadius: v('integer', 2, 40, 'Rayon de cueillette', 'Rayon dans lequel on compte les plantes nourricières autour du site.', 'tuiles', 'newWorld'),
        minFoodPlants: v('integer', 0, 500, 'Plantes nourricières', 'Nombre minimal de plantes nourricières autour du site.', 'plantes', 'newWorld'),
      },
    },
    traits: namedList('trait de caractère'),
    skills: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de la compétence (utilisé par les recettes).'),
          name: text('Nom', 'Nom affiché de la compétence.', 'newWorld'),
          profession: text('Métier (homme)', 'Métier affiché pour un homme dont c’est l’activité la plus pratiquée.'),
          professionFemale: text('Métier (femme)', 'Métier affiché pour une femme dont c’est l’activité la plus pratiquée.'),
        },
      },
    },
    skillLearning: {
      kind: 'object',
      fields: {
        learnPerHour: v('number', 0, 0.5, 'Apprentissage', 'Progrès d’une compétence par heure de pratique, au début (il ralentit en approchant de la maîtrise).', 'fraction/heure'),
        professionMinHours: v('number', 0, 1000, 'Métier', 'Heures de pratique d’une activité avant qu’elle devienne le métier affiché.', 'heures'),
      },
    },
    stepsPerHour: v('integer', 1, 12, 'Pas par heure', 'Nombre de fois par heure de jeu où chaque humain agit.', 'pas', 'newWorld'),
    thinkEveryMinutes: v('integer', 10, 600, 'Réflexion', 'Sans raison particulière, un humain remet sa décision en question au plus une fois tous ces minutes.', 'minutes de jeu'),
    needs: {
      kind: 'object',
      fields: {
        hungerPerHour: v('number', 0, 20, 'Faim', 'Points de faim gagnés par heure par un adulte éveillé (100 = affamé).', 'points/heure'),
        sleepHungerFactor: v('number', 0, 1, 'Faim pendant le sommeil', 'Un corps endormi brûle moins : la faim monte à cette part de sa vitesse d’éveil.', 'fraction'),
        thirstPerHour: v('number', 0, 30, 'Soif', 'Points de soif gagnés par heure (100 = assoiffé).', 'points/heure'),
        thirstAnticipation: v('number', 0, 10, 'Prévoir le chemin de l’eau', 'L’envie de boire compte la soif qui viendra pendant la marche jusqu’à l’eau connue la plus proche : facteur sur le temps de marche à pleine allure (0 = on n’y pense pas ; 3 = on prévoit large, car fatigue, charge, terrain et faim ralentissent).', 'facteur'),
        fatiguePerHour: v('number', 0, 20, 'Fatigue', 'Points de fatigue gagnés par heure d’éveil.', 'points/heure'),
        restPerHour: v('number', 0, 50, 'Récupération', 'Points de fatigue perdus par heure de sommeil.', 'points/heure'),
        comfortCelsius: v('number', -10, 30, 'Température de confort', 'En dessous de cette température ressentie, on a de plus en plus froid.', '°C'),
        coldPerDegreeHour: v('number', 0, 5, 'Refroidissement', 'Points de froid gagnés par heure et par degré sous la température de confort.', 'points/(°C·heure)'),
        warmingPerHour: v('number', 0, 100, 'Réchauffement', 'Points de froid perdus par heure quand on est au chaud.', 'points/heure'),
        dangerDecayPerHour: v('number', 0, 200, 'Apaisement', 'Points de danger perdus par heure quand aucun prédateur n’est en vue.', 'points/heure'),
        starvationDamagePerHour: v('number', 0, 20, 'Dégâts de la faim', 'Santé perdue par heure quand la faim est à 100.', 'points/heure'),
        thirstDamagePerHour: v('number', 0, 20, 'Dégâts de la soif', 'Santé perdue par heure quand la soif est à 100.', 'points/heure'),
        coldDamagePerHour: v('number', 0, 20, 'Dégâts du froid', 'Santé perdue par heure quand le froid est à 100.', 'points/heure'),
        regenPerHour: v('number', 0, 20, 'Guérison', 'Santé regagnée par heure quand aucun besoin n’est critique.', 'points/heure'),
      },
    },
    body: {
      kind: 'object',
      fields: {
        walkTilesPerHour: v('number', 0.5, 20, 'Vitesse de marche', 'Tuiles parcourues par heure sur terrain plat, par beau temps.', 'tuiles/heure'),
        fleeSpeedFactor: v('number', 1, 3, 'Course', 'Facteur de vitesse quand on court : fuir un danger, poursuivre le gibier.', 'facteur'),
        perceptionTiles: v('integer', 2, 40, 'Perception', 'Distance à laquelle on repère eau, plantes et prédateurs.', 'tuiles'),
        exploreTiles: v('integer', 2, 100, 'Exploration', 'Distance à laquelle on part chercher quand rien n’est en vue ni en mémoire.', 'tuiles'),
        carryCapacity: v('number', 1, 200, 'Charge portée', 'Encombrement total qu’une personne peut porter (une poignée de baies = 1, une carcasse = 6).', 'charge'),
        hungerPerFoodUnit: v('number', 0.5, 50, 'Valeur nutritive', 'Points de faim apaisés par une unité de nourriture.', 'points/unité'),
        eatUnitsPerHour: v('number', 1, 100, 'Vitesse du repas', 'Unités de nourriture mangées par heure.', 'unités/heure'),
        drinkPerHour: v('number', 10, 1000, 'Vitesse pour boire', 'Points de soif apaisés par heure en buvant.', 'points/heure'),
      },
    },
    movement: {
      kind: 'object',
      fields: {
        accelTilesPerHour2: v('number', 1, 200, 'Accélération', 'Changement de vitesse possible en une heure : démarrer, freiner, tourner (plus faible = virages plus larges).', 'tuiles/heure²'),
        arriveTiles: v('number', 0.01, 1, 'Arrivée', 'Distance à laquelle on est arrivé à sa place.', 'tuiles'),
        cornerTiles: v('number', 0.1, 3, 'Virages', 'On commence à tourner vers le point suivant du chemin à cette distance du coin : le chemin s’arrondit.', 'tuiles'),
        smoothLookaheadTiles: v('integer', 1, 64, 'Lignes droites', 'Quand la vue est dégagée, un chemin est tiré en ligne droite sur au plus ce nombre de tuiles.', 'tuiles'),
        personalSpaceTiles: v('number', 0, 3, 'Espace personnel', 'Distance en dessous de laquelle deux personnes s’écartent doucement l’une de l’autre.', 'tuiles'),
        avoidTilesPerHour: v('number', 0, 20, 'Évitement', 'Force avec laquelle deux personnes trop proches s’écartent.', 'tuiles/heure'),
        spotOffsetTiles: v('number', 0, 0.49, 'Place sur un lieu', 'Chacun se tient à sa propre place sur un lieu (chantier, stock, couche) jusqu’à cette distance de son milieu : personne ne s’empile.', 'tuiles'),
        fireRingTiles: v('number', 0.5, 3, 'Cercle autour du feu', 'Distance du feu à laquelle on s’assoit en cercle pour se réchauffer.', 'tuiles'),
        fireRingSpread: v('number', 0, 1, 'Rangs autour du feu', 'Écart entre les rangs du cercle quand beaucoup de monde se réchauffe.', 'tuiles'),
        marshSpeed: v('number', 0.1, 1, 'Marais', 'Facteur de vitesse dans un marais.', 'facteur'),
        snowSlowdown: v('number', 0, 0.9, 'Neige', 'Part de la vitesse perdue dans une neige épaisse.', 'fraction'),
        slopeSlowdownPer100m: v('number', 0, 5, 'Pente', 'Ralentissement par 100 m de dénivelé entre deux tuiles voisines (la vitesse est divisée par 1 + ce nombre × le dénivelé).', 'facteur/100 m'),
        fatigueSlowdown: v('number', 0, 0.9, 'Fatigue', 'Part de la vitesse perdue par une personne épuisée (à partir de la moitié de la fatigue).', 'fraction'),
        loadSlowdown: v('number', 0, 0.9, 'Charge', 'Part de la vitesse perdue quand on porte sa pleine charge.', 'fraction'),
        runFatigueFactor: v('number', 1, 10, 'Essoufflement', 'Courir fatigue autant de fois plus que marcher.', 'facteur'),
        companionTiles: v('number', 0, 10, 'Marcher ensemble', 'Un compagnon ou un parent qui va dans le même sens à moins de cette distance : on marche à ses côtés.', 'tuiles'),
        besideTiles: v('number', 0.3, 3, 'Côte à côte', 'Écart entre deux personnes qui marchent ensemble.', 'tuiles'),
        companionPullTiles: v('number', 0, 10, 'Attrait du compagnon', 'Force qui ramène à côté de celui avec qui l’on marche.', 'tuiles/heure'),
        followBehindTiles: v('number', 0.3, 3, 'Suivre son parent', 'Un enfant qui suit son parent se tient à cette distance derrière lui, un peu de côté.', 'tuiles'),
        followNearTiles: v('number', 1, 30, 'Garder son parent en vue', 'Plus loin que cela, l’enfant cherche un chemin pour rejoindre son parent ; plus près, il le suit à vue.', 'tuiles'),
        talkTiles: v('number', 0.3, 5, 'Distance de conversation', 'On s’approche à cette distance de quelqu’un pour lui parler ou lui donner quelque chose.', 'tuiles'),
        stuckSteps: v('integer', 1, 50, 'Chemin bloqué', 'Après ce nombre de pas sans pouvoir avancer, on renonce au trajet.', 'pas'),
      },
    },
    camp: {
      kind: 'object',
      fields: {
        shelterMaxCelsius: v('number', 0, 40, 'Chaleur d’un abri', 'Un feu, un abri ou un vêtement réchauffe jusqu’à cette température ressentie, pas au-delà.', '°C'),
        besideFireCelsius: v('number', -10, 40, 'Au coin du feu', 'Température ressentie au moins par qui se réchauffe tout contre un feu allumé, quel que soit le temps.', '°C'),
        homeRadiusTiles: v('integer', 10, 200, 'Territoire du camp', 'Distance jusqu’à laquelle le chemin du retour au camp est connu.', 'tuiles', 'newWorld'),
      },
    },
    memory: {
      kind: 'object',
      fields: {
        waterSlots: v('integer', 0, 16, 'Points d’eau retenus', 'Nombre de points d’eau qu’une personne garde en mémoire.', 'lieux', 'newWorld'),
        foodSlots: v('integer', 0, 32, 'Coins de cueillette retenus', 'Nombre d’endroits nourriciers qu’une personne garde en mémoire.', 'lieux', 'newWorld'),
        forgetDays: v('integer', 1, 400, 'Oubli', 'Un souvenir de coin de cueillette non revisité s’efface après ce nombre de jours.', 'jours'),
        waterForgetDays: v('integer', 1, 4000, 'Oubli des points d’eau', 'Un point d’eau est un repère qu’on garde des années : il ne s’oublie qu’après ce nombre de jours sans y retourner.', 'jours'),
        waterSearchSteps: v('integer', 0, 100, 'Retrouver un point d’eau raconté', 'Un point d’eau dont on a entendu parler (approximativement) est retrouvé en descendant vers l’eau sur au plus ce nombre de tuiles.', 'tuiles'),
      },
    },
    danger: {
      kind: 'object',
      fields: {
        predators: { kind: 'array', items: text('Animal redouté', 'Identifiant d’une espèce que les humains reconnaissent comme dangereuse.', 'live', ID_PATTERN) },
        alertTiles: v('integer', 1, 30, 'Vigilance', 'Distance à laquelle on repère un prédateur.', 'tuiles'),
        isolationTiles: v('integer', 1, 30, 'Isolement', 'Une personne sans personne d’autre à cette distance est isolée (et vulnérable).', 'tuiles'),
        groupFearShare: v('number', 0, 1, 'Peur en groupe', 'Part de la peur ressentie face à un prédateur quand on n’est pas seul.', 'fraction'),
        sightFearShare: v('number', 0, 1, 'Frayeur', 'Tant qu’un prédateur est en vue, l’émotion « peur » monte au moins à cette part du danger ressenti (puis retombe à son rythme une fois le danger écarté).', 'fraction'),
        campGuardTiles: v('integer', 1, 40, 'Prédateur près du camp', 'Un prédateur vu à moins de cette distance du centre du camp peut être chassé par les adultes (cris, feu, armes).', 'tuiles'),
        corpseMeat: v('number', 0, 200, 'Dépouille', 'Viande laissée pour les charognards par un humain tué.', 'unités'),
      },
    },
    terrain: {
      kind: 'object',
      fields: {
        forestCost: v('number', 1, 10, 'Forêt', 'Coût de marche d’une tuile avec un arbre (1 = terrain dégagé).', 'facteur'),
        shrubCost: v('number', 1, 10, 'Broussailles', 'Coût de marche d’une tuile avec un arbuste.', 'facteur'),
        riverCost: v('number', 1, 20, 'Gué', 'Coût de traversée d’une rivière à gué.', 'facteur'),
        slopeCostPer100m: v('number', 0, 10, 'Pente', 'Coût ajouté par 100 m de dénivelé entre deux tuiles.', 'coût/100 m'),
        maxPathNodes: v('integer', 500, 1000000, 'Recherche de chemin', 'Tuiles examinées au plus pour trouver un chemin (au-delà, on avance au jugé).', 'tuiles'),
        heuristicWeight: v('number', 1, 5, 'Hâte du calcul de chemin', 'Au-dessus de 1, les chemins sont trouvés plus vite mais sont un peu moins courts.', 'facteur'),
      },
    },
    decision: {
      kind: 'object',
      fields: {
        randomness: v('number', 0, 1, 'Part de hasard', 'Écart aléatoire ajouté aux scores des actions.', 'fraction'),
        keepCurrentBonus: v('number', 0, 1, 'Persévérance', 'Bonus de score de l’action en cours (évite de changer d’avis sans arrêt).', 'fraction'),
        depositAtCamp: v('number', 0, 1, 'Déposer en passant', 'Envie de déposer ce qu’on porte quand on passe au stock du camp, même peu chargé (entrée « depositUrge »).', 'fraction'),
        keepWorkBonus: v('number', 0, 3, 'Ouvrage en cours', 'Bonus de score supplémentaire d’un travail commencé (en route ou sur place : fabriquer, construire, récolter) : on finit ce qu’on a commencé.', 'fraction'),
      },
    },
    actions: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de l’action.'),
          behavior: choice(BEHAVIORS, 'Comportement', 'Comportement programmé que déclenche cette action (harvest, craft, build… exécutent des recettes).', 'newWorld'),
          recipes: { kind: 'array', items: text('Recette', 'Recette utilisée par ce comportement (la première possible).', 'newWorld', ID_PATTERN) },
          items: { kind: 'array', items: text('Objet recherché', 'Objet que cette récolte cherche (liste vide : tout ce que la source donne).', 'newWorld', ID_PATTERN) },
          minAge: v('number', 0, 60, 'Âge minimal', 'Âge à partir duquel une personne fait cette action.', 'ans'),
          name: text('Nom', 'Nom de l’action (fiche personnage).', 'newWorld'),
          label: text('Libellé', 'Ce que fait la personne (« Va boire »), affiché sur la carte et dans sa fiche.', 'newWorld'),
          weight: v('number', 0, 10, 'Poids de l’action', 'Importance de base de l’action dans le choix.', 'facteur'),
          reason: choice(INPUTS, 'Raison affichée', 'Entrée montrée comme raison de l’action dans la fiche (« soif 72 % »).'),
          considerations: {
            kind: 'array',
            minLength: 1,
            items: {
              kind: 'object',
              fields: {
                input: choice(INPUTS, 'Entrée', 'Ce que mesure la considération (faim, soif, nuit, danger…), entre 0 et 1.'),
                curve: choice(['linear', 'power', 'logistic'], 'Courbe', 'linear : a·x + b · power : x^a · logistic : marche douce autour de a, de raideur b.'),
                a: v('number', -100, 100, 'Paramètre a', 'Pente (linéaire), exposant (puissance) ou point milieu (logistique).', 'sans unité'),
                b: v('number', -100, 100, 'Paramètre b', 'Décalage (linéaire) ou raideur (logistique).', 'sans unité'),
              },
            },
          },
          traits: { kind: 'record', values: v('number', -2, 2, 'Influence d’un trait', 'Effet d’un trait de caractère sur le score de l’action.', 'facteur') },
          requires: text('Savoir requis', 'Identifiant du savoir nécessaire pour faire cette action.', 'live', ID_PATTERN),
          conversation: choice(CONVERSATIONS, 'Conversation', 'Sorte de conversation (comportement « converse ») : bavarder, se confier, consoler, séduire, se disputer.', 'newWorld'),
          skills: { kind: 'array', items: text('Compétence exercée', 'Compétence que l’action fait pratiquer (celui qui veut y exceller la préfère).', 'live', ID_PATTERN) },
        },
        optional: ['requires', 'recipes', 'items', 'minAge', 'conversation', 'skills'],
      },
    },
    deathTexts: {
      kind: 'object',
      fields: {
        hunger: text('Mort de faim', DEATH_HELP),
        thirst: text('Mort de soif', DEATH_HELP),
        cold: text('Mort de froid', DEATH_HELP),
        predator: text('Tué(e) par un prédateur', DEATH_HELP),
        oldAge: text('Mort de vieillesse', DEATH_HELP),
        disease: text('Mort de maladie', `${DEATH_HELP} Aussi : {maladie}, {aggravation} (« , affaibli par la faim »).`),
        childbirth: text('Morte en couches', DEATH_HELP),
        violence: text('Mort violente', `${DEATH_HELP} Aussi : {tueur} (qui a frappé), {contexte} (rixe, vengeance, raid, bataille).`),
      },
    },
    settlementText: text('Installation de la tribu', 'Phrase du journal au début du monde. Remplacements : {personnes}, {lieu}, {batiments}.', 'newWorld'),
    campMove: {
      kind: 'object',
      fields: {
        forageFarTiles: v('number', 2, 200, 'Loin du camp', 'Quand un adulte doit aller en moyenne plus loin que ceci pour trouver à manger, il veut déplacer le camp.', 'tuiles'),
        memory: v('number', 0.01, 1, 'Mémoire des trajets', 'Poids de chaque nouvelle récolte dans la distance moyenne retenue (plus grand = oubli plus rapide).', 'fraction'),
        curiosityEffect: v('number', 0, 1, 'Goût du départ', 'Les curieux veulent partir plus tôt, les autres plus tard (effet maximal de la curiosité sur le seuil).', 'fraction'),
        consensusShare: v('number', 0.1, 1, 'Consensus', 'Part des adultes qui doivent vouloir partir pour que le camp se déplace.', 'fraction'),
        minDaysBetweenMoves: v('integer', 1, 400, 'Repos entre deux départs', 'Jours au moins entre deux déplacements du camp.', 'jours'),
        minMoveTiles: v('integer', 1, 200, 'Distance minimale', 'Un nouveau camp doit être au moins à cette distance de l’ancien.', 'tuiles'),
        waterMaxTiles: v('integer', 1, 30, 'Eau du nouveau camp', 'Distance maximale entre le nouveau camp et l’eau douce.', 'tuiles'),
        minAdults: v('integer', 1, 50, 'Adultes nécessaires', 'Nombre minimal d’adultes vivants pour décider ensemble.', 'personnes'),
      },
    },
  },
};

const FILE = 'data/humans.json';

export function parseHumanParams(raw: unknown, animalIds: readonly string[]): HumanParams {
  const params = validateData<HumanParams>(FILE, raw, HUMANS_SCHEMA);
  const problems: string[] = [];
  const traits = new Set(params.traits.map((item) => item.id));
  for (const id of params.danger.predators) if (!animalIds.includes(id)) problems.push(`« danger.predators » : l'animal « ${id} » n'existe pas.`);
  const skills = new Set(params.skills.map((skill) => skill.id));
  for (const action of params.actions) {
    for (const id of Object.keys(action.traits)) if (!traits.has(id)) problems.push(`action « ${action.id} » : le trait « ${id} » n'existe pas.`);
    for (const id of action.skills ?? []) if (!skills.has(id)) problems.push(`action « ${action.id} » : la compétence « ${id} » n'existe pas.`);
    if (action.behavior === 'converse' && !action.conversation) problems.push(`action « ${action.id} » : une conversation doit préciser « conversation ».`);
  }
  if (params.site.minCelsius > params.site.maxCelsius) problems.push('« site.minCelsius » doit être inférieur ou égal à « site.maxCelsius ».');
  if (new Set(params.actions.map((action) => action.id)).size !== params.actions.length) problems.push('deux actions ont le même « id ».');
  if (new Set(params.skills.map((skill) => skill.id)).size !== params.skills.length) problems.push('deux compétences ont le même « id ».');
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}

/** Cross-file checks: the knowledge, recipes and items the actions name must exist. */
export function checkHumanLinks(params: HumanParams, knowledgeIds: readonly string[], recipeIds: readonly string[], itemIds: readonly string[]): void {
  const problems: string[] = [];
  for (const action of params.actions) {
    if (action.requires && !knowledgeIds.includes(action.requires)) problems.push(`action « ${action.id} » : le savoir « ${action.requires} » n'existe pas.`);
    for (const id of action.recipes ?? []) if (!recipeIds.includes(id)) problems.push(`action « ${action.id} » : la recette « ${id} » n'existe pas.`);
    for (const id of action.items ?? []) if (!itemIds.includes(id)) problems.push(`action « ${action.id} » : l'objet « ${id} » n'existe pas.`);
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
}
