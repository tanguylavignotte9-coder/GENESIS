export interface PlageEntiers {
  min: number;
  max: number;
}

export interface ConfigMonde {
  tailleGrille: number;
  niveauxElevationMax: number;
  epaisseurBordEauSalee: number;
  temperaturePoleCelsius: number;
  temperatureEquateurCelsius: number;
  refroidissementParNiveauCelsius: number;
  amplitudeSaisonniereTempereeCelsius: number;
  amplitudeSaisonniereTropicaleCelsius: number;
  amplitudeSaisonnierePolaireCelsius: number;
  limiteZoneTropicale: number;
  limiteZonePolaire: number;
  probabilitePluieHumiditeMax: number;
  gainHumiditePluie: number;
  perteHumiditeSecheresse: number;
  seuilNeigeCelsius: number;
  seuilGelEauCelsius: number;
  seuilPassageSentier: number;
  decroissancePassageParMois: number;
  // Relief fractal organique (rework pré-V2).
  fractionTerreCible: number;
  longueurOndeContinentaleFraction: number;
  octavesBruitRelief: number;
  gainBruitRelief: number;
  lacunariteBruitRelief: number;
  intensiteDomainWarpingFraction: number;
  largeurMargeOceanPeripheriqueFraction: number;
  longueurOndeCretesFraction: number;
  poidsCretesMontagne: number;
  seuilsNiveauxTerre: number[];
  // Océan à étages (profondeur = éloignement de la terre, en tuiles).
  seuilPlateauContinentalTuiles: number;
  seuilPenteContinentaleTuiles: number;
  seuilAbysseTuiles: number;
  profondeurMaxOceanNiveaux: number;
  // Plages par pente et climat.
  largeurMaxPlageTuiles: number;
  niveauMaxPlage: number;
  seuilPentePlageNiveaux: number;
  temperatureMinPlageCelsius: number;
  seuilNiveauRoche: number;
  // Climat continu (humidité sans palier de latitude).
  humiditeEquateurPourcent: number;
  humiditePolePourcent: number;
  centreSecheresseSubtropicaleFraction: number;
  largeurSecheresseSubtropicaleFraction: number;
  amplitudeSecheresseSubtropicalePourcent: number;
  longueurOndeHumiditeGrandeTuiles: number;
  octavesBruitHumidite: number;
  gainBruitHumidite: number;
  amplitudeBruitHumiditePourcent: number;
  bonusHumiditeProcheEauPourcent: number;
  largeurBonusHumiditeEauTuiles: number;
  // Écotones des biomes (mosaïque de transition).
  margeTemperatureEcotoneCelsius: number;
  margeHumiditeEcotonePourcent: number;
  longueurOndeEcotoneTuiles: number;
  // Rivières (confluences, lacs, inertie directionnelle).
  elevationMinSourceRiviere: number;
  nbSourcesRivieresMin: number;
  nbSourcesRivieresMax: number;
  densiteSourcesRivieresParMillierTuilesTerre: number;
  inertieDirectionnelleRiviere: number;
  seuilDebitElargissement: number;
  tailleMinLacTuiles: number;
  tailleMaxLacTuiles: number;
  pasMaxRiviere: number;
  // Gisements pondérés par le relief.
  facteurMontagneGisementsMetalliques: number;
  facteurPlaineGisementsSedimentaires: number;
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
  autosaveIntervalleSecondesReel: number;
  lodTicksHorsZone: number;
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
  chanceNoyadeParTraverseeGue: number;
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
  multiplicateurReproductionFaune: number;
  chanceCaptureParMois: number;
  multiplicateurReproductionEnclos: number;
  productionAnimalParMois: number;
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
  seuilIntelligenceGenie: number;
  chancePerceeParMois: number;
  tauxTransmissionMaitreParMois: number;
  tauxTransmissionEcritureParMois: number;
  tauxTransmissionEcoleParMois: number;
  extractionParMoisParMine: number;
  seuilTerritoireNationTuiles: number;
  pollutionParMoisParBatimentPolluant: number;
  seuilPollutionSante: number;
  perteSantePollutionParMois: number;
  perteBiomassePollutionParMois: number;
  consommationCharbonCentraleParMois: number;
  chanceFrappeMonnaieParMois: number;
  rayonRechercheGisementTuiles: number;
  seuilBonheurDepart: number;
  chanceDepartIndividuelParMois: number;
  chanceSchismeParMois: number;
  seuilBiomasseMigration: number;
  porteeRechercheNouvelleTerreTuiles: number;
  chanceNaufrageParMois: number;
  prelevementPourcentReserve: number;
  seuilJournalPrelevement: number;
}

export interface ConfigEconomie {
  valeurSubjectiveBase: number;
  perissabiliteJours: Record<string, number>;
  multiplicateurConservationFumoir: number;
  multiplicateurConservationFermentation: number;
  seuilEcartValeurPourEchange: number;
  porteeMarcheTuiles: number;
  valeurBaseObjets: Record<string, number>;
  valeurPiece: number;
  chanceFabricationParMois: number;
  chanceTrocParMois: number;
  usureObjetParMois: number;
  chanceFermentationParMois: number;
  chanceConsommationFermenteParMois: number;
}

export interface ConfigBatiments {
  dureeConstructionBaseJours: number;
  usureParMois: number;
  capaciteGrenierBase: number;
  types: Record<string, { materiaux: Record<string, number>; dureeJours: number; polluant?: boolean; ressource?: string; vehicule?: boolean; capacite?: number }>;
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
  chanceTransmissionRumeurParMois: number;
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
