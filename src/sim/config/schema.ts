export interface PlageEntiers {
  min: number;
  max: number;
}

export interface ConfigMonde {
  tailleGrille: number;
  niveauxElevationMax: number;
  nbContinentsMin: number;
  nbContinentsMax: number;
  nbIlesMin: number;
  nbIlesMax: number;
  epaisseurBordEauSalee: number;
  temperaturePoleCelsius: number;
  temperatureEquateurCelsius: number;
  refroidissementParNiveauCelsius: number;
  amplitudeSaisonniereTempereeCelsius: number;
  amplitudeSaisonniereTropicaleCelsius: number;
  amplitudeSaisonnierePolaireCelsius: number;
  limiteZoneTropicale: number;
  limiteZonePolaire: number;
  elevationMinSourceRiviere: number;
  nbSourcesRivieresParContinentMin: number;
  nbSourcesRivieresParContinentMax: number;
  probabilitePluieHumiditeMax: number;
  gainHumiditePluie: number;
  perteHumiditeSecheresse: number;
  seuilNeigeCelsius: number;
  seuilGelEauCelsius: number;
  gisements: Record<
    'charbon' | 'gaz' | 'uranium' | 'petrole' | 'fer' | 'cuivre' | 'etain' | 'or' | 'argent' | 'sel',
    { nbMin: number; nbMax: number; quantiteMin: number; quantiteMax: number }
  >;
}

export interface ConfigTemps {
  secondesParMoisAX1: number;
  joursParMois: number;
  vitessesDisponibles: number[];
  pasDeTempsSecondesReel: number;
  anneesParGeneration: number;
  moisParAn: number;
}

export interface ConfigIndividus {
  ageMaturiteMoyenAnnees: number;
  dureeGestationMois: number;
  tauxMutationParTrait: number;
  amplitudeMutation: number;
  risqueMutationNegativeConsanguinite: number;
  seuilCannibalismeFaim: number;
  perteSanteFamineParMois: number;
  perteSanteDeshydratationParMois: number;
  perteSanteFatigueParMois: number;
  perteSanteFroidParMois: number;
  temperatureConfortCelsius: number;
  debutSenescenceAnnees: number;
  perteForceParAnSenescence: number;
  perteEnduranceParAnSenescence: number;
  faimParMois: number;
  soifParMois: number;
  sommeilParMois: number;
  stressParMois: number;
  seuilFaimManger: number;
  seuilSoifBoire: number;
  seuilSommeilDormir: number;
  seuilSecuriteFuir: number;
  stockNourritureInitialParBande: number;
  consommationNourritureParRepas: number;
  tailleCarcasseHumain: number;
  allaitementAnnees: number;
  chanceReproductionParMois: number;
  distanceMaxPartenaireTuiles: number;
  porteeChasseHumaineTuiles: number;
  chanceChasseParMois: number;
  porteeFuitePredateurTuiles: number;
  stressDeuilProche: number;
  stressCannibalisme: number;
  perteSanteStressMaxParMois: number;
  perteSanteSenescenceParMois: number;
  poidsBesoins: Record<'faim' | 'soif' | 'sommeil' | 'stress' | 'securite' | 'social' | 'reproduction', number>;
  competencesInitiales: Record<string, PlageEntiers>;
  attributsInnes: Record<'intelligence' | 'charisme' | 'force' | 'endurance' | 'vitesse' | 'sante' | 'bonheur', PlageEntiers>;
  porteePerceptionTuiles: number;
  vitesseDeplacementBaseTuilesParMois: number;
  tauxApprentissageParMois: number;
  capaciteMemoireEvenements: number;
  tauxOubliParAn: number;
}

export type RegimeFaune = 'herbivore' | 'predateur' | 'charognard';

export interface EspeceFaune {
  nom: string;
  regime: RegimeFaune;
  vitesseTuilesParMois: number;
  faimParMois: number;
  ageMaxAnnees: number;
  reproductionParMois: number;
  tailleCarcasse: number;
  poidsBiomes: Record<string, number>;
}

export interface ConfigFauneFlore {
  effectifInitialMin: number;
  effectifInitialMax: number;
  probabilitePousseVegetationParMois: number;
  probabiliteDegradationVegetationParMois: number;
  consommationVegetationParAnimalParMois: number;
  biomasseVegetationMax: number;
  decroissanceCarcasseParMois: number;
  perteSanteFroidFauneParMois: number;
  seuilFroidFauneCelsius: number;
  perteSanteFamineFauneParMois: number;
  porteeChassePredateurTuiles: number;
  chanceKillPredateurParMois: number;
  rendementCueilletteParMois: number;
  rendementChasseParMois: number;
  especes: Record<string, EspeceFaune>;
}

export interface ConfigSociete {
  bandesInitialesMin: number;
  bandesInitialesMax: number;
  tailleBandeInitialeMin: number;
  tailleBandeInitialeMax: number;
  politiquesDisponibles: string[];
  rayonTerritoireDefautTuiles: number;
  suiviParCharisme: number;
  seuilMecontentementGroupe: number;
  seuilStockNourriturePourGrenier: number;
  capaciteStockSansGrenier: number;
  nbHuttesPourSedentarisation: number;
  ageMaxDirigeantAnnees: number;
  poidsAgeDirigeant: number;
  poidsCharismeDirigeant: number;
  rayonTerritoireBatimentsTuiles: number;
}

export interface ConfigEconomie {
  valeurSubjectiveBase: number;
  perissabiliteJours: Record<string, number>;
  multiplicateurConservationFumoir: number;
  multiplicateurConservationFermentation: number;
  seuilEcartValeurPourEchange: number;
  porteeMarcheTuiles: number;
  valeurBaseObjets: Record<string, number>;
  chanceFabricationParMois: number;
  chanceTrocParMois: number;
  usureObjetParMois: number;
}

export interface ConfigBatiments {
  dureeConstructionBaseJours: number;
  usureParMois: number;
  capaciteGrenierBase: number;
  types: Record<string, { materiaux: Record<string, number>; dureeJours: number }>;
}

export interface ConfigRecit {
  notificationsParPage: number;
  tauxDivergenceLangueParSiecle: number;
  malusCooperationLangueDifferente: number;
  seuilCharismeProphete: number;
  tauxPropagationReligionParMois: number;
  probabiliteScepticisme: number;
  generationsChroniqueLignee: number;
  seuilDivergenceNouvelleLangue: number;
  distanceIsolementTotalTuiles: number;
  chanceRevelationParMois: number;
  seuilBonheurSchisme: number;
  chanceSchismeParMois: number;
  moisStressMaxAvantFolie: number;
  chanceFolieParMois: number;
  chanceErranceFolie: number;
}

export interface ConfigComplete {
  monde: ConfigMonde;
  temps: ConfigTemps;
  individus: ConfigIndividus;
  fauneFlore: ConfigFauneFlore;
  societe: ConfigSociete;
  economie: ConfigEconomie;
  batiments: ConfigBatiments;
  recit: ConfigRecit;
}

export const NOMS_FICHIERS_CONFIG = [
  'monde',
  'temps',
  'individus',
  'faune-flore',
  'societe',
  'economie',
  'batiments',
  'recit',
] as const;

export type NomFichierConfig = (typeof NOMS_FICHIERS_CONFIG)[number];
