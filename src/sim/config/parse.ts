import { fnv1a64 } from '../hash';
import { NOMS_FICHIERS_CONFIG, type ConfigComplete, type NomFichierConfig } from './schema';

export class ErreurConfig extends Error {
  readonly erreurs: string[];
  constructor(erreurs: string[]) {
    super(erreurs.join('\n'));
    this.erreurs = erreurs;
  }
}

export function empreinteTexte(texte: string): string {
  return fnv1a64(texte);
}

export function depouillerCommentaires(texte: string): string {
  let resultat = '';
  let i = 0;
  let dansChaine = false;
  let caractereChaine = '';
  while (i < texte.length) {
    const c = texte[i];
    const suivant = i + 1 < texte.length ? texte[i + 1] : '';
    if (dansChaine) {
      resultat += c;
      if (c === '\\') {
        if (i + 1 < texte.length) {
          resultat += texte[i + 1];
          i += 2;
          continue;
        }
      } else if (c === caractereChaine) {
        dansChaine = false;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      dansChaine = true;
      caractereChaine = c;
      resultat += c;
      i++;
      continue;
    }
    if (c === '/' && suivant === '/') {
      while (i < texte.length && texte[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && suivant === '*') {
      i += 2;
      while (i < texte.length && !(texte[i] === '*' && texte[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    resultat += c;
    i++;
  }
  return resultat;
}

type Erreurs = string[];

function chemin(base: string, cle: string): string {
  return base ? `${base}.${cle}` : cle;
}

function exigerObjet(valeur: unknown, base: string, erreurs: Erreurs): valeur is Record<string, unknown> {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    erreurs.push(`${base}: attend un objet, reçu ${JSON.stringify(valeur)}`);
    return false;
  }
  return true;
}

function exigerNombre(
  obj: Record<string, unknown>,
  cle: string,
  base: string,
  opts: { min?: number; max?: number; entier?: boolean },
  erreurs: Erreurs,
): number | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (typeof v !== 'number' || Number.isNaN(v)) {
    erreurs.push(`${c}: attend un nombre, reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  if (opts.entier && !Number.isInteger(v)) {
    erreurs.push(`${c}: attend un entier, reçu ${v}`);
    return undefined;
  }
  if (opts.min !== undefined && v < opts.min) {
    erreurs.push(`${c}: doit être >= ${opts.min}, reçu ${v}`);
    return undefined;
  }
  if (opts.max !== undefined && v > opts.max) {
    erreurs.push(`${c}: doit être <= ${opts.max}, reçu ${v}`);
    return undefined;
  }
  return v;
}

function exigerPlage(obj: Record<string, unknown>, cle: string, base: string, erreurs: Erreurs) {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (!exigerObjet(v, c, erreurs)) return undefined;
  const min = exigerNombre(v, 'min', c, { entier: true }, erreurs);
  const max = exigerNombre(v, 'max', c, { entier: true }, erreurs);
  if (min !== undefined && max !== undefined && min > max) {
    erreurs.push(`${c}: min (${min}) > max (${max})`);
    return undefined;
  }
  return v as { min: number; max: number };
}

function exigerTableauNombres(
  obj: Record<string, unknown>,
  cle: string,
  base: string,
  opts: { min: number; max: number; minLongueur?: number },
  erreurs: Erreurs,
): number[] | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
    erreurs.push(`${c}: attend un tableau de nombres, reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  if (opts.minLongueur !== undefined && v.length < opts.minLongueur) {
    erreurs.push(`${c}: attend au moins ${opts.minLongueur} élément(s), reçu ${v.length}`);
    return undefined;
  }
  for (const x of v) {
    if (x < opts.min || x > opts.max) {
      erreurs.push(`${c}: élément ${x} hors plage [${opts.min}, ${opts.max}]`);
      return undefined;
    }
  }
  return v as number[];
}

function exigerTableauChaines(obj: Record<string, unknown>, cle: string, base: string, erreurs: Erreurs): string[] | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    erreurs.push(`${c}: attend un tableau de chaînes, reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  return v as string[];
}

function exigerRecordNombres(
  obj: Record<string, unknown>,
  cle: string,
  base: string,
  opts: { min?: number; max?: number },
  erreurs: Erreurs,
): Record<string, number> | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (!exigerObjet(v, c, erreurs)) return undefined;
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== 'number' || (opts.min !== undefined && x < opts.min) || (opts.max !== undefined && x > opts.max)) {
      erreurs.push(`${chemin(c, k)}: attend un nombre${opts.min !== undefined ? ` >= ${opts.min}` : ''}${opts.max !== undefined ? ` <= ${opts.max}` : ''}, reçu ${JSON.stringify(x)}`);
      return undefined;
    }
  }
  return v as Record<string, number>;
}

function lireSection(textes: Record<string, string>, nom: NomFichierConfig, erreurs: Erreurs): Record<string, unknown> {
  const texte = textes[nom];
  if (texte === undefined) {
    erreurs.push(`${nom}.jsonc: fichier manquant`);
    return {};
  }
  try {
    const sansCommentaires = depouillerCommentaires(texte);
    const valeur = JSON.parse(sansCommentaires);
    if (!exigerObjet(valeur, nom, erreurs)) return {};
    return valeur;
  } catch (e) {
    erreurs.push(`${nom}.jsonc: JSON invalide — ${(e as Error).message}`);
    return {};
  }
}

function validerMonde(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'monde';
  const gis = o.gisements;
  const gisValide = exigerObjet(gis, chemin(b, 'gisements'), erreurs);
  const gisements: Record<string, { nbMin: number; nbMax: number; quantiteMin: number; quantiteMax: number }> = {};
  if (gisValide) {
    for (const cle of ['charbon', 'gaz', 'uranium', 'petrole', 'fer', 'cuivre', 'etain', 'or', 'argent', 'sel'] as const) {
      const g = gis[cle];
      if (!exigerObjet(g, chemin(b, `gisements.${cle}`), erreurs)) continue;
      const nbMin = exigerNombre(g, 'nbMin', chemin(b, `gisements.${cle}`), { min: 0, entier: true }, erreurs);
      const nbMax = exigerNombre(g, 'nbMax', chemin(b, `gisements.${cle}`), { min: 0, entier: true }, erreurs);
      const quantiteMin = exigerNombre(g, 'quantiteMin', chemin(b, `gisements.${cle}`), { min: 0 }, erreurs);
      const quantiteMax = exigerNombre(g, 'quantiteMax', chemin(b, `gisements.${cle}`), { min: 0 }, erreurs);
      if (nbMin !== undefined && nbMax !== undefined && nbMin > nbMax) erreurs.push(`${b}.gisements.${cle}: nbMin > nbMax`);
      if (quantiteMin !== undefined && quantiteMax !== undefined && quantiteMin > quantiteMax) erreurs.push(`${b}.gisements.${cle}: quantiteMin > quantiteMax`);
      if (nbMin !== undefined && nbMax !== undefined && quantiteMin !== undefined && quantiteMax !== undefined) {
        gisements[cle] = { nbMin, nbMax, quantiteMin, quantiteMax };
      }
    }
  }
  return {
    tailleGrille: exigerNombre(o, 'tailleGrille', b, { min: 100, max: 5000, entier: true }, erreurs)!,
    niveauxElevationMax: exigerNombre(o, 'niveauxElevationMax', b, { min: 2, max: 16, entier: true }, erreurs)!,
    nbContinentsMin: exigerNombre(o, 'nbContinentsMin', b, { min: 1, max: 20, entier: true }, erreurs)!,
    nbContinentsMax: exigerNombre(o, 'nbContinentsMax', b, { min: 1, max: 20, entier: true }, erreurs)!,
    nbIlesMin: exigerNombre(o, 'nbIlesMin', b, { min: 0, max: 500, entier: true }, erreurs)!,
    nbIlesMax: exigerNombre(o, 'nbIlesMax', b, { min: 0, max: 500, entier: true }, erreurs)!,
    epaisseurBordEauSalee: exigerNombre(o, 'epaisseurBordEauSalee', b, { min: 1, max: 50, entier: true }, erreurs)!,
    temperaturePoleCelsius: exigerNombre(o, 'temperaturePoleCelsius', b, { min: -80, max: 20 }, erreurs)!,
    temperatureEquateurCelsius: exigerNombre(o, 'temperatureEquateurCelsius', b, { min: 0, max: 60 }, erreurs)!,
    refroidissementParNiveauCelsius: exigerNombre(o, 'refroidissementParNiveauCelsius', b, { min: -20, max: 0 }, erreurs)!,
    amplitudeSaisonniereTempereeCelsius: exigerNombre(o, 'amplitudeSaisonniereTempereeCelsius', b, { min: 0, max: 40 }, erreurs)!,
    amplitudeSaisonniereTropicaleCelsius: exigerNombre(o, 'amplitudeSaisonniereTropicaleCelsius', b, { min: 0, max: 20 }, erreurs)!,
    amplitudeSaisonnierePolaireCelsius: exigerNombre(o, 'amplitudeSaisonnierePolaireCelsius', b, { min: 0, max: 40 }, erreurs)!,
    limiteZoneTropicale: exigerNombre(o, 'limiteZoneTropicale', b, { min: 0, max: 1 }, erreurs)!,
    limiteZonePolaire: exigerNombre(o, 'limiteZonePolaire', b, { min: 0.01, max: 1 }, erreurs)!,
    elevationMinSourceRiviere: exigerNombre(o, 'elevationMinSourceRiviere', b, { min: 1, max: 15, entier: true }, erreurs)!,
    nbSourcesRivieresParContinentMin: exigerNombre(o, 'nbSourcesRivieresParContinentMin', b, { min: 0, max: 50, entier: true }, erreurs)!,
    nbSourcesRivieresParContinentMax: exigerNombre(o, 'nbSourcesRivieresParContinentMax', b, { min: 0, max: 50, entier: true }, erreurs)!,
    probabilitePluieHumiditeMax: exigerNombre(o, 'probabilitePluieHumiditeMax', b, { min: 0, max: 1 }, erreurs)!,
    gainHumiditePluie: exigerNombre(o, 'gainHumiditePluie', b, { min: 0, max: 100 }, erreurs)!,
    perteHumiditeSecheresse: exigerNombre(o, 'perteHumiditeSecheresse', b, { min: 0, max: 100 }, erreurs)!,
    seuilNeigeCelsius: exigerNombre(o, 'seuilNeigeCelsius', b, { min: -30, max: 30 }, erreurs)!,
    seuilGelEauCelsius: exigerNombre(o, 'seuilGelEauCelsius', b, { min: -30, max: 10 }, erreurs)!,
    gisements: gisements as ConfigComplete['monde']['gisements'],
  };
}

function validerTemps(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'temps';
  return {
    secondesParMoisAX1: exigerNombre(o, 'secondesParMoisAX1', b, { min: 1, max: 86400 }, erreurs)!,
    joursParMois: exigerNombre(o, 'joursParMois', b, { min: 1, max: 366, entier: true }, erreurs)!,
    vitessesDisponibles: exigerTableauNombres(o, 'vitessesDisponibles', b, { min: 1, max: 1000, minLongueur: 1 }, erreurs)!,
    pasDeTempsSecondesReel: exigerNombre(o, 'pasDeTempsSecondesReel', b, { min: 0.001, max: 10 }, erreurs)!,
    anneesParGeneration: exigerNombre(o, 'anneesParGeneration', b, { min: 1, max: 200 }, erreurs)!,
    moisParAn: exigerNombre(o, 'moisParAn', b, { min: 1, max: 24, entier: true }, erreurs)!,
  };
}

function validerIndividus(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'individus';
  const poids = exigerRecordNombres(o, 'poidsBesoins', b, { min: 0 }, erreurs) ?? {};
  const competences: Record<string, { min: number; max: number }> = {};
  const comp = o.competencesInitiales;
  if (exigerObjet(comp, chemin(b, 'competencesInitiales'), erreurs)) {
    for (const [k, v] of Object.entries(comp)) {
      const p = exigerPlage(comp, k, chemin(b, 'competencesInitiales'), erreurs);
      if (p) competences[k] = p as { min: number; max: number };
    }
  }
  const attributs: Record<string, { min: number; max: number }> = {};
  const att = o.attributsInnes;
  if (exigerObjet(att, chemin(b, 'attributsInnes'), erreurs)) {
    for (const [k, v] of Object.entries(att)) {
      const p = exigerPlage(att, k, chemin(b, 'attributsInnes'), erreurs);
      if (p) attributs[k] = p as { min: number; max: number };
    }
  }
  return {
    faimParMois: exigerNombre(o, 'faimParMois', b, { min: 0, max: 100 }, erreurs)!,
    soifParMois: exigerNombre(o, 'soifParMois', b, { min: 0, max: 100 }, erreurs)!,
    sommeilParMois: exigerNombre(o, 'sommeilParMois', b, { min: 0, max: 100 }, erreurs)!,
    stressParMois: exigerNombre(o, 'stressParMois', b, { min: 0, max: 100 }, erreurs)!,
    seuilFaimManger: exigerNombre(o, 'seuilFaimManger', b, { min: 0, max: 100 }, erreurs)!,
    seuilSoifBoire: exigerNombre(o, 'seuilSoifBoire', b, { min: 0, max: 100 }, erreurs)!,
    seuilSommeilDormir: exigerNombre(o, 'seuilSommeilDormir', b, { min: 0, max: 100 }, erreurs)!,
    seuilSecuriteFuir: exigerNombre(o, 'seuilSecuriteFuir', b, { min: 0, max: 100 }, erreurs)!,
    stockNourritureInitialParBande: exigerNombre(o, 'stockNourritureInitialParBande', b, { min: 0, max: 100000 }, erreurs)!,
    consommationNourritureParRepas: exigerNombre(o, 'consommationNourritureParRepas', b, { min: 0.1, max: 1000 }, erreurs)!,
    tailleCarcasseHumain: exigerNombre(o, 'tailleCarcasseHumain', b, { min: 0, max: 10000 }, erreurs)!,
    allaitementAnnees: exigerNombre(o, 'allaitementAnnees', b, { min: 0, max: 10 }, erreurs)!,
    chanceReproductionParMois: exigerNombre(o, 'chanceReproductionParMois', b, { min: 0, max: 1 }, erreurs)!,
    distanceMaxPartenaireTuiles: exigerNombre(o, 'distanceMaxPartenaireTuiles', b, { min: 1, max: 50, entier: true }, erreurs)!,
    porteeChasseHumaineTuiles: exigerNombre(o, 'porteeChasseHumaineTuiles', b, { min: 1, max: 50, entier: true }, erreurs)!,
    chanceChasseParMois: exigerNombre(o, 'chanceChasseParMois', b, { min: 0, max: 1 }, erreurs)!,
    porteeFuitePredateurTuiles: exigerNombre(o, 'porteeFuitePredateurTuiles', b, { min: 1, max: 50, entier: true }, erreurs)!,
    stressDeuilProche: exigerNombre(o, 'stressDeuilProche', b, { min: 0, max: 100 }, erreurs)!,
    stressCannibalisme: exigerNombre(o, 'stressCannibalisme', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteStressMaxParMois: exigerNombre(o, 'perteSanteStressMaxParMois', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteSenescenceParMois: exigerNombre(o, 'perteSanteSenescenceParMois', b, { min: 0, max: 100 }, erreurs)!,
    ageMaturiteMoyenAnnees: exigerNombre(o, 'ageMaturiteMoyenAnnees', b, { min: 1, max: 40 }, erreurs)!,
    dureeGestationMois: exigerNombre(o, 'dureeGestationMois', b, { min: 1, max: 24, entier: true }, erreurs)!,
    tauxMutationParTrait: exigerNombre(o, 'tauxMutationParTrait', b, { min: 0, max: 1 }, erreurs)!,
    amplitudeMutation: exigerNombre(o, 'amplitudeMutation', b, { min: 0, max: 100 }, erreurs)!,
    risqueMutationNegativeConsanguinite: exigerNombre(o, 'risqueMutationNegativeConsanguinite', b, { min: 0, max: 1 }, erreurs)!,
    seuilCannibalismeFaim: exigerNombre(o, 'seuilCannibalismeFaim', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteFamineParMois: exigerNombre(o, 'perteSanteFamineParMois', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteDeshydratationParMois: exigerNombre(o, 'perteSanteDeshydratationParMois', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteFatigueParMois: exigerNombre(o, 'perteSanteFatigueParMois', b, { min: 0, max: 100 }, erreurs)!,
    perteSanteFroidParMois: exigerNombre(o, 'perteSanteFroidParMois', b, { min: 0, max: 100 }, erreurs)!,
    temperatureConfortCelsius: exigerNombre(o, 'temperatureConfortCelsius', b, { min: -40, max: 40 }, erreurs)!,
    debutSenescenceAnnees: exigerNombre(o, 'debutSenescenceAnnees', b, { min: 20, max: 120 }, erreurs)!,
    perteForceParAnSenescence: exigerNombre(o, 'perteForceParAnSenescence', b, { min: 0, max: 10 }, erreurs)!,
    perteEnduranceParAnSenescence: exigerNombre(o, 'perteEnduranceParAnSenescence', b, { min: 0, max: 10 }, erreurs)!,
    poidsBesoins: poids as ConfigComplete['individus']['poidsBesoins'],
    competencesInitiales: competences as ConfigComplete['individus']['competencesInitiales'],
    attributsInnes: attributs as ConfigComplete['individus']['attributsInnes'],
    porteePerceptionTuiles: exigerNombre(o, 'porteePerceptionTuiles', b, { min: 1, max: 100, entier: true }, erreurs)!,
    vitesseDeplacementBaseTuilesParMois: exigerNombre(o, 'vitesseDeplacementBaseTuilesParMois', b, { min: 0.1, max: 1000 }, erreurs)!,
    tauxApprentissageParMois: exigerNombre(o, 'tauxApprentissageParMois', b, { min: 0, max: 1 }, erreurs)!,
    capaciteMemoireEvenements: exigerNombre(o, 'capaciteMemoireEvenements', b, { min: 1, max: 100000, entier: true }, erreurs)!,
    tauxOubliParAn: exigerNombre(o, 'tauxOubliParAn', b, { min: 0, max: 1 }, erreurs)!,
  };
}

const BIOMES_CONNUS = ['Toundra', 'Taiga', 'Foret', 'Prairie', 'Savane', 'Jungle', 'Desert', 'Neige', 'Aucun'];
const REGIMES_CONNUS = ['herbivore', 'predateur', 'charognard'];

function validerEspece(v: unknown, base: string, erreurs: Erreurs): ConfigComplete['fauneFlore']['especes'][string] | undefined {
  if (!exigerObjet(v, base, erreurs)) return undefined;
  const regime = v.regime;
  if (typeof regime !== 'string' || !REGIMES_CONNUS.includes(regime)) {
    erreurs.push(`${base}.regime: attend l'un de ${REGIMES_CONNUS.join(', ')}, reçu ${JSON.stringify(regime)}`);
    return undefined;
  }
  const nom = v.nom;
  if (typeof nom !== 'string' || nom.length === 0) {
    erreurs.push(`${base}.nom: attend une chaîne non vide`);
    return undefined;
  }
  const poids = exigerRecordNombres(v, 'poidsBiomes', base, { min: 0 }, erreurs) ?? {};
  for (const k of Object.keys(poids)) {
    if (!BIOMES_CONNUS.includes(k)) erreurs.push(`${base}.poidsBiomes.${k}: biome inconnu (attendu : ${BIOMES_CONNUS.join(', ')})`);
  }
  return {
    nom,
    regime: regime as ConfigComplete['fauneFlore']['especes'][string]['regime'],
    vitesseTuilesParMois: exigerNombre(v, 'vitesseTuilesParMois', base, { min: 0.1, max: 100 }, erreurs)!,
    faimParMois: exigerNombre(v, 'faimParMois', base, { min: 0, max: 100 }, erreurs)!,
    ageMaxAnnees: exigerNombre(v, 'ageMaxAnnees', base, { min: 1, max: 200, entier: true }, erreurs)!,
    reproductionParMois: exigerNombre(v, 'reproductionParMois', base, { min: 0, max: 1 }, erreurs)!,
    tailleCarcasse: exigerNombre(v, 'tailleCarcasse', base, { min: 0, max: 10000 }, erreurs)!,
    poidsBiomes: poids,
  };
}

function validerFauneFlore(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'faune-flore';
  const especes: Record<string, ConfigComplete['fauneFlore']['especes'][string]> = {};
  const e = o.especes;
  if (exigerObjet(e, chemin(b, 'especes'), erreurs)) {
    for (const [k, v] of Object.entries(e)) {
      const espece = validerEspece(v, chemin(b, `especes.${k}`), erreurs);
      if (espece) especes[k] = espece;
    }
  }
  if (Object.keys(especes).length === 0 && erreurs.length === 0) {
    erreurs.push(`${b}.especes: au moins une espèce est requise`);
  }
  return {
    effectifInitialMin: exigerNombre(o, 'effectifInitialMin', b, { min: 0, max: 1000000, entier: true }, erreurs)!,
    effectifInitialMax: exigerNombre(o, 'effectifInitialMax', b, { min: 0, max: 1000000, entier: true }, erreurs)!,
    probabilitePousseVegetationParMois: exigerNombre(o, 'probabilitePousseVegetationParMois', b, { min: 0, max: 1 }, erreurs)!,
    probabiliteDegradationVegetationParMois: exigerNombre(o, 'probabiliteDegradationVegetationParMois', b, { min: 0, max: 1 }, erreurs)!,
    consommationVegetationParAnimalParMois: exigerNombre(o, 'consommationVegetationParAnimalParMois', b, { min: 0, max: 1000 }, erreurs)!,
    biomasseVegetationMax: exigerNombre(o, 'biomasseVegetationMax', b, { min: 1, max: 100000 }, erreurs)!,
    decroissanceCarcasseParMois: exigerNombre(o, 'decroissanceCarcasseParMois', b, { min: 0, max: 1 }, erreurs)!,
    perteSanteFroidFauneParMois: exigerNombre(o, 'perteSanteFroidFauneParMois', b, { min: 0, max: 100 }, erreurs)!,
    seuilFroidFauneCelsius: exigerNombre(o, 'seuilFroidFauneCelsius', b, { min: -60, max: 40 }, erreurs)!,
    perteSanteFamineFauneParMois: exigerNombre(o, 'perteSanteFamineFauneParMois', b, { min: 0, max: 100 }, erreurs)!,
    porteeChassePredateurTuiles: exigerNombre(o, 'porteeChassePredateurTuiles', b, { min: 1, max: 50, entier: true }, erreurs)!,
    chanceKillPredateurParMois: exigerNombre(o, 'chanceKillPredateurParMois', b, { min: 0, max: 1 }, erreurs)!,
    rendementCueilletteParMois: exigerNombre(o, 'rendementCueilletteParMois', b, { min: 0, max: 1000 }, erreurs)!,
    rendementChasseParMois: exigerNombre(o, 'rendementChasseParMois', b, { min: 0, max: 1000 }, erreurs)!,
    especes,
  };
}

function validerSociete(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'societe';
  return {
    bandesInitialesMin: exigerNombre(o, 'bandesInitialesMin', b, { min: 1, max: 100, entier: true }, erreurs)!,
    bandesInitialesMax: exigerNombre(o, 'bandesInitialesMax', b, { min: 1, max: 100, entier: true }, erreurs)!,
    tailleBandeInitialeMin: exigerNombre(o, 'tailleBandeInitialeMin', b, { min: 2, max: 10000, entier: true }, erreurs)!,
    tailleBandeInitialeMax: exigerNombre(o, 'tailleBandeInitialeMax', b, { min: 2, max: 10000, entier: true }, erreurs)!,
    politiquesDisponibles: exigerTableauChaines(o, 'politiquesDisponibles', b, erreurs)!,
    rayonTerritoireDefautTuiles: exigerNombre(o, 'rayonTerritoireDefautTuiles', b, { min: 1, max: 500, entier: true }, erreurs)!,
    suiviParCharisme: exigerNombre(o, 'suiviParCharisme', b, { min: 0, max: 1 }, erreurs)!,
    seuilMecontentementGroupe: exigerNombre(o, 'seuilMecontentementGroupe', b, { min: 0, max: 100 }, erreurs)!,
    seuilStockNourriturePourGrenier: exigerNombre(o, 'seuilStockNourriturePourGrenier', b, { min: 0, max: 1000000 }, erreurs)!,
    capaciteStockSansGrenier: exigerNombre(o, 'capaciteStockSansGrenier', b, { min: 0, max: 1000000 }, erreurs)!,
    nbHuttesPourSedentarisation: exigerNombre(o, 'nbHuttesPourSedentarisation', b, { min: 1, max: 100, entier: true }, erreurs)!,
    ageMaxDirigeantAnnees: exigerNombre(o, 'ageMaxDirigeantAnnees', b, { min: 40, max: 120, entier: true }, erreurs)!,
    poidsAgeDirigeant: exigerNombre(o, 'poidsAgeDirigeant', b, { min: 0, max: 1 }, erreurs)!,
    poidsCharismeDirigeant: exigerNombre(o, 'poidsCharismeDirigeant', b, { min: 0, max: 1 }, erreurs)!,
    rayonTerritoireBatimentsTuiles: exigerNombre(o, 'rayonTerritoireBatimentsTuiles', b, { min: 0, max: 100, entier: true }, erreurs)!,
  };
}

function validerEconomie(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'economie';
  return {
    valeurSubjectiveBase: exigerNombre(o, 'valeurSubjectiveBase', b, { min: 0 }, erreurs)!,
    perissabiliteJours: exigerRecordNombres(o, 'perissabiliteJours', b, { min: 0 }, erreurs)!,
    multiplicateurConservationFumoir: exigerNombre(o, 'multiplicateurConservationFumoir', b, { min: 1, max: 1000 }, erreurs)!,
    multiplicateurConservationFermentation: exigerNombre(o, 'multiplicateurConservationFermentation', b, { min: 1, max: 1000 }, erreurs)!,
    seuilEcartValeurPourEchange: exigerNombre(o, 'seuilEcartValeurPourEchange', b, { min: 0, max: 100 }, erreurs)!,
    porteeMarcheTuiles: exigerNombre(o, 'porteeMarcheTuiles', b, { min: 1, max: 1000, entier: true }, erreurs)!,
    valeurBaseObjets: exigerRecordNombres(o, 'valeurBaseObjets', b, { min: 0 }, erreurs)!,
    chanceFabricationParMois: exigerNombre(o, 'chanceFabricationParMois', b, { min: 0, max: 1 }, erreurs)!,
    chanceTrocParMois: exigerNombre(o, 'chanceTrocParMois', b, { min: 0, max: 1 }, erreurs)!,
    usureObjetParMois: exigerNombre(o, 'usureObjetParMois', b, { min: 0, max: 1 }, erreurs)!,
  };
}

function validerBatiments(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'batiments';
  const types: Record<string, { materiaux: Record<string, number>; dureeJours: number }> = {};
  const t = o.types;
  if (exigerObjet(t, chemin(b, 'types'), erreurs)) {
    for (const [k, v] of Object.entries(t)) {
      if (!exigerObjet(v, chemin(b, `types.${k}`), erreurs)) continue;
      const materiaux = exigerRecordNombres(v, 'materiaux', chemin(b, `types.${k}`), { min: 0 }, erreurs) ?? {};
      const dureeJours = exigerNombre(v, 'dureeJours', chemin(b, `types.${k}`), { min: 0 }, erreurs);
      if (dureeJours !== undefined) types[k] = { materiaux, dureeJours };
    }
  }
  return {
    dureeConstructionBaseJours: exigerNombre(o, 'dureeConstructionBaseJours', b, { min: 0 }, erreurs)!,
    usureParMois: exigerNombre(o, 'usureParMois', b, { min: 0, max: 1 }, erreurs)!,
    capaciteGrenierBase: exigerNombre(o, 'capaciteGrenierBase', b, { min: 1 }, erreurs)!,
    types,
  };
}

function validerRecit(o: Record<string, unknown>, erreurs: Erreurs) {
  const b = 'recit';
  return {
    notificationsParPage: exigerNombre(o, 'notificationsParPage', b, { min: 1, max: 10000, entier: true }, erreurs)!,
    tauxDivergenceLangueParSiecle: exigerNombre(o, 'tauxDivergenceLangueParSiecle', b, { min: 0, max: 1 }, erreurs)!,
    malusCooperationLangueDifferente: exigerNombre(o, 'malusCooperationLangueDifferente', b, { min: 0, max: 1 }, erreurs)!,
    seuilCharismeProphete: exigerNombre(o, 'seuilCharismeProphete', b, { min: 0, max: 100 }, erreurs)!,
    tauxPropagationReligionParMois: exigerNombre(o, 'tauxPropagationReligionParMois', b, { min: 0, max: 1 }, erreurs)!,
    probabiliteScepticisme: exigerNombre(o, 'probabiliteScepticisme', b, { min: 0, max: 1 }, erreurs)!,
    generationsChroniqueLignee: exigerNombre(o, 'generationsChroniqueLignee', b, { min: 1, max: 10000, entier: true }, erreurs)!,
  };
}

export function parserConfig(textes: Record<string, string>): { config: ConfigComplete; empreintes: Record<string, string> } {
  const empreintes: Record<string, string> = {};
  for (const nom of NOMS_FICHIERS_CONFIG) {
    empreintes[nom] = empreinteTexte(textes[nom] ?? '');
  }
  const erreurs: Erreurs = [];
  const config: ConfigComplete = {
    monde: validerMonde(lireSection(textes, 'monde', erreurs), erreurs),
    temps: validerTemps(lireSection(textes, 'temps', erreurs), erreurs),
    individus: validerIndividus(lireSection(textes, 'individus', erreurs), erreurs),
    fauneFlore: validerFauneFlore(lireSection(textes, 'faune-flore', erreurs), erreurs),
    societe: validerSociete(lireSection(textes, 'societe', erreurs), erreurs),
    economie: validerEconomie(lireSection(textes, 'economie', erreurs), erreurs),
    batiments: validerBatiments(lireSection(textes, 'batiments', erreurs), erreurs),
    recit: validerRecit(lireSection(textes, 'recit', erreurs), erreurs),
  };
  if (erreurs.length > 0) {
    throw new ErreurConfig(erreurs);
  }
  return { config, empreintes };
}

export function empreintesTextes(textes: Record<string, string>): Record<string, string> {
  const empreintes: Record<string, string> = {};
  for (const nom of NOMS_FICHIERS_CONFIG) {
    empreintes[nom] = empreinteTexte(textes[nom] ?? '');
  }
  return empreintes;
}
