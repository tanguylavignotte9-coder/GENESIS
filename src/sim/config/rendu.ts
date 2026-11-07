import { depouillerCommentaires, detecterClesDupliquees, ErreurConfig } from './parse';

export const NOM_FICHIER_RENDU = 'rendu';

export interface PaletteTuileSimple {
  base: string;
  taches: string[];
}

export interface PaletteForet {
  base: string;
  taches: string[];
  tronc: string;
  troncOmbre: string;
  canopee: string;
  canopeeClair: string;
  canopeeOmbre: string;
}

export interface PaletteSaison {
  prairie: PaletteTuileSimple;
  foret: PaletteForet;
  savane: PaletteTuileSimple;
}

export interface ConfigRendu {
  tailleTuilePx: number;
  graineAtlas: number;
  variantesParTuile: number;
  paliersZoomPxParTuile: number[];
  tailleChunkTuiles: number;
  maxChunkCache: number;
  seuils: {
    spritesCompletsPxParTuile: number;
    cheveuxPxParTuile: number;
    frontieresPxParTuile: number;
    vaguesPxParTuile: number;
  };
  animations: {
    msParFrame: number;
    msParFrameMeteo: number;
    pluieTraits: number;
    neigePoints: number;
    nuages: number;
  };
  minicarte: {
    taillePx: number;
    opaciteFond: number;
    couleurVue: string;
    tailleMarqueurVillage: number;
  };
  palettes: {
    eauProfonde: PaletteTuileSimple;
    eau: PaletteTuileSimple & { vaguelettes: string; ecume: string };
    eauGelee: PaletteTuileSimple;
    plage: PaletteTuileSimple;
    prairie: PaletteTuileSimple;
    foret: PaletteForet;
    colline: PaletteTuileSimple & { roche: string };
    montagne: PaletteTuileSimple & { fissures: string; aretes: string };
    neige: PaletteTuileSimple;
    terre: PaletteTuileSimple;
    toundra: PaletteTuileSimple & { mousse: string[] };
    taiga: PaletteForet;
    savane: PaletteTuileSimple & { arbre: string; canopee: string };
    jungle: PaletteForet;
    desert: PaletteTuileSimple & { duneClair: string; duneOmbre: string };
    sentier: { base: string; clair: string };
    pollution: { couleur: string; alphaMax: number };
    gisement: Record<string, string>;
    relief: { ombreAlphaMax: number; lumiereAlphaMax: number };
    bois: { murs: string; toits: string; toitFonce: string; bois: string; poteau: string };
    pierre: { base: string; clair: string; sombre: string };
    metal: { base: string; clair: string };
    flammes: string[];
    fumee: string;
    peau: { base: string; min: string; max: string };
    cheveux: string[];
    vetements: string[];
    marqueurFavori: string;
    marqueurDirigeant: string;
    contourSelection: string;
    contourSurvol: string;
    chantier: { bois: string; planche: string };
    especes: Record<string, { corps: string; clair: string; sombre: string; detail: string }>;
    vehicule: { coque: string; voile: string; roue: string; ecume: string };
  };
  saisons: Record<'printemps' | 'ete' | 'automne' | 'hiver', PaletteSaison>;
  taillesSprites: {
    humain: [number, number];
    animalMax: number;
    batimentMax: number;
  };
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

function exigerTexte(obj: Record<string, unknown>, cle: string, base: string, erreurs: Erreurs): string | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (typeof v !== 'string' || v.length === 0) {
    erreurs.push(`${c}: attend une chaîne non vide, reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    erreurs.push(`${c}: attend une couleur hex "#rrggbb", reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  return v;
}

function exigerTableauTextes(obj: Record<string, unknown>, cle: string, base: string, minLongueur: number, erreurs: Erreurs): string[] | undefined {
  const c = chemin(base, cle);
  const v = obj[cle];
  if (!Array.isArray(v) || v.length < minLongueur || v.some((x) => typeof x !== 'string')) {
    erreurs.push(`${c}: attend un tableau d'au moins ${minLongueur} chaîne(s), reçu ${JSON.stringify(v)}`);
    return undefined;
  }
  for (const x of v) {
    if (!/^#[0-9a-fA-F]{6}$/.test(x as string)) {
      erreurs.push(`${c}: couleur invalide ${JSON.stringify(x)} (attendu "#rrggbb")`);
      return undefined;
    }
  }
  return v as string[];
}

function exigerTableauNombres(
  obj: Record<string, unknown>,
  cle: string,
  base: string,
  opts: { min: number; max: number; minLongueur?: number; entier?: boolean },
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
    if (x < opts.min || x > opts.max || (opts.entier && !Number.isInteger(x))) {
      erreurs.push(`${c}: élément ${x} hors plage [${opts.min}, ${opts.max}]`);
      return undefined;
    }
  }
  return v as number[];
}

function lirePaletteSimple(o: Record<string, unknown>, base: string, erreurs: Erreurs): PaletteTuileSimple | undefined {
  const b = exigerObjet(o, base, erreurs) ? o : undefined;
  if (!b) return undefined;
  const baseC = exigerTexte(b, 'base', base, erreurs);
  const taches = exigerTableauTextes(b, 'taches', base, 1, erreurs);
  if (baseC === undefined || taches === undefined) return undefined;
  return { base: baseC, taches };
}

function lirePaletteForet(o: Record<string, unknown>, base: string, erreurs: Erreurs): PaletteForet | undefined {
  const b = exigerObjet(o, base, erreurs) ? o : undefined;
  if (!b) return undefined;
  const p = lirePaletteSimple(b, base, erreurs);
  const tronc = exigerTexte(b, 'tronc', base, erreurs);
  const troncOmbre = exigerTexte(b, 'troncOmbre', base, erreurs);
  const canopee = exigerTexte(b, 'canopee', base, erreurs);
  const canopeeClair = exigerTexte(b, 'canopeeClair', base, erreurs);
  const canopeeOmbre = exigerTexte(b, 'canopeeOmbre', base, erreurs);
  if (!p || tronc === undefined || troncOmbre === undefined || canopee === undefined || canopeeClair === undefined || canopeeOmbre === undefined) return undefined;
  return { ...p, tronc, troncOmbre, canopee, canopeeClair, canopeeOmbre };
}

function lirePaletteSaison(o: Record<string, unknown>, base: string, erreurs: Erreurs): PaletteSaison | undefined {
  const b = exigerObjet(o, base, erreurs) ? o : undefined;
  if (!b) return undefined;
  const prairie = b.prairie !== undefined && exigerObjet(b.prairie, chemin(base, 'prairie'), erreurs) ? lirePaletteSimple(b.prairie as Record<string, unknown>, chemin(base, 'prairie'), erreurs) : undefined;
  const foret = b.foret !== undefined && exigerObjet(b.foret, chemin(base, 'foret'), erreurs) ? lirePaletteForet(b.foret as Record<string, unknown>, chemin(base, 'foret'), erreurs) : undefined;
  const savane = b.savane !== undefined && exigerObjet(b.savane, chemin(base, 'savane'), erreurs) ? lirePaletteSimple(b.savane as Record<string, unknown>, chemin(base, 'savane'), erreurs) : undefined;
  if (!prairie || !foret || !savane) return undefined;
  return { prairie, foret, savane };
}

const CLES_GISEMENTS = ['charbon', 'gaz', 'uranium', 'petrole', 'fer', 'cuivre', 'etain', 'or', 'argent', 'sel'] as const;
const CLES_ESPECES = ['cerf', 'bison', 'sanglier', 'lapin', 'loup', 'ours', 'vautour'] as const;

export function parserConfigRendu(texte: string | undefined): ConfigRendu {
  const erreurs: Erreurs = [];
  if (texte === undefined) {
    throw new ErreurConfig([`${NOM_FICHIER_RENDU}.jsonc: fichier manquant`]);
  }
  for (const d of detecterClesDupliquees(texte)) {
    erreurs.push(`${NOM_FICHIER_RENDU}.jsonc: clé dupliquée "${d}" (la seconde écrase la première)`);
  }
  let o: Record<string, unknown>;
  try {
    const valeur = JSON.parse(depouillerCommentaires(texte));
    if (!exigerObjet(valeur, NOM_FICHIER_RENDU, erreurs)) throw new ErreurConfig(erreurs);
    o = valeur;
  } catch (e) {
    if (e instanceof ErreurConfig) throw e;
    erreurs.push(`${NOM_FICHIER_RENDU}.jsonc: JSON invalide — ${(e as Error).message}`);
    throw new ErreurConfig(erreurs);
  }
  if (erreurs.length > 0) throw new ErreurConfig(erreurs);

  const b = NOM_FICHIER_RENDU;
  const seuilsO = exigerObjet(o.seuils, chemin(b, 'seuils'), erreurs) ? (o.seuils as Record<string, unknown>) : {};
  const animO = exigerObjet(o.animations, chemin(b, 'animations'), erreurs) ? (o.animations as Record<string, unknown>) : {};
  const minicarteO = exigerObjet(o.minicarte, chemin(b, 'minicarte'), erreurs) ? (o.minicarte as Record<string, unknown>) : {};
  const palO = exigerObjet(o.palettes, chemin(b, 'palettes'), erreurs) ? (o.palettes as Record<string, unknown>) : {};
  const saisonsO = exigerObjet(o.saisons, chemin(b, 'saisons'), erreurs) ? (o.saisons as Record<string, unknown>) : {};
  const taillesO = exigerObjet(o.taillesSprites, chemin(b, 'taillesSprites'), erreurs) ? (o.taillesSprites as Record<string, unknown>) : {};

  const palettes: Partial<ConfigRendu['palettes']> = {};
  const pBase = chemin(b, 'palettes');
  palettes.eauProfonde = palO.eauProfonde !== undefined && exigerObjet(palO.eauProfonde, chemin(pBase, 'eauProfonde'), erreurs) ? lirePaletteSimple(palO.eauProfonde as Record<string, unknown>, chemin(pBase, 'eauProfonde'), erreurs) : undefined;
  const eauO = palO.eau !== undefined && exigerObjet(palO.eau, chemin(pBase, 'eau'), erreurs) ? (palO.eau as Record<string, unknown>) : undefined;
  let eau: ConfigRendu['palettes']['eau'] | undefined;
  if (eauO) {
    const p = lirePaletteSimple(eauO, chemin(pBase, 'eau'), erreurs);
    const vaguelettes = exigerTexte(eauO, 'vaguelettes', chemin(pBase, 'eau'), erreurs);
    const ecume = exigerTexte(eauO, 'ecume', chemin(pBase, 'eau'), erreurs);
    if (p && vaguelettes !== undefined && ecume !== undefined) eau = { ...p, vaguelettes, ecume };
  }
  palettes.eau = eau;
  palettes.eauGelee = palO.eauGelee !== undefined && exigerObjet(palO.eauGelee, chemin(pBase, 'eauGelee'), erreurs) ? lirePaletteSimple(palO.eauGelee as Record<string, unknown>, chemin(pBase, 'eauGelee'), erreurs) : undefined;
  palettes.plage = palO.plage !== undefined && exigerObjet(palO.plage, chemin(pBase, 'plage'), erreurs) ? lirePaletteSimple(palO.plage as Record<string, unknown>, chemin(pBase, 'plage'), erreurs) : undefined;
  palettes.prairie = palO.prairie !== undefined && exigerObjet(palO.prairie, chemin(pBase, 'prairie'), erreurs) ? lirePaletteSimple(palO.prairie as Record<string, unknown>, chemin(pBase, 'prairie'), erreurs) : undefined;
  palettes.foret = palO.foret !== undefined && exigerObjet(palO.foret, chemin(pBase, 'foret'), erreurs) ? lirePaletteForet(palO.foret as Record<string, unknown>, chemin(pBase, 'foret'), erreurs) : undefined;
  const collineO = palO.colline !== undefined && exigerObjet(palO.colline, chemin(pBase, 'colline'), erreurs) ? (palO.colline as Record<string, unknown>) : undefined;
  let colline: ConfigRendu['palettes']['colline'] | undefined;
  if (collineO) {
    const p = lirePaletteSimple(collineO, chemin(pBase, 'colline'), erreurs);
    const roche = exigerTexte(collineO, 'roche', chemin(pBase, 'colline'), erreurs);
    if (p && roche !== undefined) colline = { ...p, roche };
  }
  palettes.colline = colline;
  const montagneO = palO.montagne !== undefined && exigerObjet(palO.montagne, chemin(pBase, 'montagne'), erreurs) ? (palO.montagne as Record<string, unknown>) : undefined;
  let montagne: ConfigRendu['palettes']['montagne'] | undefined;
  if (montagneO) {
    const p = lirePaletteSimple(montagneO, chemin(pBase, 'montagne'), erreurs);
    const fissures = exigerTexte(montagneO, 'fissures', chemin(pBase, 'montagne'), erreurs);
    const aretes = exigerTexte(montagneO, 'aretes', chemin(pBase, 'montagne'), erreurs);
    if (p && fissures !== undefined && aretes !== undefined) montagne = { ...p, fissures, aretes };
  }
  palettes.montagne = montagne;
  palettes.neige = palO.neige !== undefined && exigerObjet(palO.neige, chemin(pBase, 'neige'), erreurs) ? lirePaletteSimple(palO.neige as Record<string, unknown>, chemin(pBase, 'neige'), erreurs) : undefined;
  palettes.terre = palO.terre !== undefined && exigerObjet(palO.terre, chemin(pBase, 'terre'), erreurs) ? lirePaletteSimple(palO.terre as Record<string, unknown>, chemin(pBase, 'terre'), erreurs) : undefined;
  const toundraO = palO.toundra !== undefined && exigerObjet(palO.toundra, chemin(pBase, 'toundra'), erreurs) ? (palO.toundra as Record<string, unknown>) : undefined;
  let toundra: ConfigRendu['palettes']['toundra'] | undefined;
  if (toundraO) {
    const p = lirePaletteSimple(toundraO, chemin(pBase, 'toundra'), erreurs);
    const mousse = exigerTableauTextes(toundraO, 'mousse', chemin(pBase, 'toundra'), 1, erreurs);
    if (p && mousse !== undefined) toundra = { ...p, mousse };
  }
  palettes.toundra = toundra;
  palettes.taiga = palO.taiga !== undefined && exigerObjet(palO.taiga, chemin(pBase, 'taiga'), erreurs) ? lirePaletteForet(palO.taiga as Record<string, unknown>, chemin(pBase, 'taiga'), erreurs) : undefined;
  const savaneO = palO.savane !== undefined && exigerObjet(palO.savane, chemin(pBase, 'savane'), erreurs) ? (palO.savane as Record<string, unknown>) : undefined;
  let savane: ConfigRendu['palettes']['savane'] | undefined;
  if (savaneO) {
    const p = lirePaletteSimple(savaneO, chemin(pBase, 'savane'), erreurs);
    const arbre = exigerTexte(savaneO, 'arbre', chemin(pBase, 'savane'), erreurs);
    const canopee = exigerTexte(savaneO, 'canopee', chemin(pBase, 'savane'), erreurs);
    if (p && arbre !== undefined && canopee !== undefined) savane = { ...p, arbre, canopee };
  }
  palettes.savane = savane;
  palettes.jungle = palO.jungle !== undefined && exigerObjet(palO.jungle, chemin(pBase, 'jungle'), erreurs) ? lirePaletteForet(palO.jungle as Record<string, unknown>, chemin(pBase, 'jungle'), erreurs) : undefined;
  const desertO = palO.desert !== undefined && exigerObjet(palO.desert, chemin(pBase, 'desert'), erreurs) ? (palO.desert as Record<string, unknown>) : undefined;
  let desert: ConfigRendu['palettes']['desert'] | undefined;
  if (desertO) {
    const p = lirePaletteSimple(desertO, chemin(pBase, 'desert'), erreurs);
    const duneClair = exigerTexte(desertO, 'duneClair', chemin(pBase, 'desert'), erreurs);
    const duneOmbre = exigerTexte(desertO, 'duneOmbre', chemin(pBase, 'desert'), erreurs);
    if (p && duneClair !== undefined && duneOmbre !== undefined) desert = { ...p, duneClair, duneOmbre };
  }
  palettes.desert = desert;

  const sentierO = palO.sentier !== undefined && exigerObjet(palO.sentier, chemin(pBase, 'sentier'), erreurs) ? (palO.sentier as Record<string, unknown>) : undefined;
  const pollutionO = palO.pollution !== undefined && exigerObjet(palO.pollution, chemin(pBase, 'pollution'), erreurs) ? (palO.pollution as Record<string, unknown>) : undefined;
  const reliefO = palO.relief !== undefined && exigerObjet(palO.relief, chemin(pBase, 'relief'), erreurs) ? (palO.relief as Record<string, unknown>) : undefined;
  const boisO = palO.bois !== undefined && exigerObjet(palO.bois, chemin(pBase, 'bois'), erreurs) ? (palO.bois as Record<string, unknown>) : undefined;
  const pierreO = palO.pierre !== undefined && exigerObjet(palO.pierre, chemin(pBase, 'pierre'), erreurs) ? (palO.pierre as Record<string, unknown>) : undefined;
  const metalO = palO.metal !== undefined && exigerObjet(palO.metal, chemin(pBase, 'metal'), erreurs) ? (palO.metal as Record<string, unknown>) : undefined;
  const peauO = palO.peau !== undefined && exigerObjet(palO.peau, chemin(pBase, 'peau'), erreurs) ? (palO.peau as Record<string, unknown>) : undefined;
  const chantierO = palO.chantier !== undefined && exigerObjet(palO.chantier, chemin(pBase, 'chantier'), erreurs) ? (palO.chantier as Record<string, unknown>) : undefined;
  const vehiculeO = palO.vehicule !== undefined && exigerObjet(palO.vehicule, chemin(pBase, 'vehicule'), erreurs) ? (palO.vehicule as Record<string, unknown>) : undefined;
  const gisementO = palO.gisement !== undefined && exigerObjet(palO.gisement, chemin(pBase, 'gisement'), erreurs) ? (palO.gisement as Record<string, unknown>) : undefined;
  const especesO = palO.especes !== undefined && exigerObjet(palO.especes, chemin(pBase, 'especes'), erreurs) ? (palO.especes as Record<string, unknown>) : undefined;

  const gisement: Record<string, string> = {};
  if (gisementO) {
    for (const cle of CLES_GISEMENTS) {
      const v = exigerTexte(gisementO, cle, chemin(pBase, `gisement.${cle}`), erreurs);
      if (v !== undefined) gisement[cle] = v;
    }
  }
  const especes: Record<string, { corps: string; clair: string; sombre: string; detail: string }> = {};
  if (especesO) {
    for (const cle of CLES_ESPECES) {
      const e = especesO[cle];
      if (e !== undefined && exigerObjet(e, chemin(pBase, `especes.${cle}`), erreurs)) {
        const eo = e as Record<string, unknown>;
        const corps = exigerTexte(eo, 'corps', chemin(pBase, `especes.${cle}`), erreurs);
        const clair = exigerTexte(eo, 'clair', chemin(pBase, `especes.${cle}`), erreurs);
        const sombre = exigerTexte(eo, 'sombre', chemin(pBase, `especes.${cle}`), erreurs);
        const detail = exigerTexte(eo, 'detail', chemin(pBase, `especes.${cle}`), erreurs);
        if (corps !== undefined && clair !== undefined && sombre !== undefined && detail !== undefined) {
          especes[cle] = { corps, clair, sombre, detail };
        }
      }
    }
  }

  const saisons: Partial<Record<'printemps' | 'ete' | 'automne' | 'hiver', PaletteSaison>> = {};
  for (const cle of ['printemps', 'ete', 'automne', 'hiver'] as const) {
    const s = saisonsO[cle];
    if (s !== undefined && exigerObjet(s, chemin(b, `saisons.${cle}`), erreurs)) {
      saisons[cle] = lirePaletteSaison(s as Record<string, unknown>, chemin(b, `saisons.${cle}`), erreurs);
    }
  }

  const tailles: Partial<ConfigRendu['taillesSprites']> = {};
  const humain = exigerTableauNombres(taillesO, 'humain', chemin(b, 'taillesSprites'), { min: 2, max: 8, minLongueur: 2, entier: true }, erreurs);
  if (humain) tailles.humain = [humain[0], humain[1]] as [number, number];

  const rendu: ConfigRendu = {
    tailleTuilePx: exigerNombre(o, 'tailleTuilePx', b, { min: 4, max: 16, entier: true }, erreurs)!,
    graineAtlas: exigerNombre(o, 'graineAtlas', b, { min: 0, entier: true }, erreurs)!,
    variantesParTuile: exigerNombre(o, 'variantesParTuile', b, { min: 1, max: 8, entier: true }, erreurs)!,
    paliersZoomPxParTuile: exigerTableauNombres(o, 'paliersZoomPxParTuile', b, { min: 1, max: 256, minLongueur: 2, entier: true }, erreurs)!,
    tailleChunkTuiles: exigerNombre(o, 'tailleChunkTuiles', b, { min: 8, max: 256, entier: true }, erreurs)!,
    maxChunkCache: exigerNombre(o, 'maxChunkCache', b, { min: 8, max: 1024, entier: true }, erreurs)!,
    seuils: {
      spritesCompletsPxParTuile: exigerNombre(seuilsO, 'spritesCompletsPxParTuile', chemin(b, 'seuils'), { min: 1, max: 256 }, erreurs)!,
      cheveuxPxParTuile: exigerNombre(seuilsO, 'cheveuxPxParTuile', chemin(b, 'seuils'), { min: 1, max: 256 }, erreurs)!,
      frontieresPxParTuile: exigerNombre(seuilsO, 'frontieresPxParTuile', chemin(b, 'seuils'), { min: 1, max: 256 }, erreurs)!,
      vaguesPxParTuile: exigerNombre(seuilsO, 'vaguesPxParTuile', chemin(b, 'seuils'), { min: 1, max: 256 }, erreurs)!,
    },
    animations: {
      msParFrame: exigerNombre(animO, 'msParFrame', chemin(b, 'animations'), { min: 40, max: 2000, entier: true }, erreurs)!,
      msParFrameMeteo: exigerNombre(animO, 'msParFrameMeteo', chemin(b, 'animations'), { min: 20, max: 2000, entier: true }, erreurs)!,
      pluieTraits: exigerNombre(animO, 'pluieTraits', chemin(b, 'animations'), { min: 10, max: 2000, entier: true }, erreurs)!,
      neigePoints: exigerNombre(animO, 'neigePoints', chemin(b, 'animations'), { min: 10, max: 4000, entier: true }, erreurs)!,
      nuages: exigerNombre(animO, 'nuages', chemin(b, 'animations'), { min: 1, max: 40, entier: true }, erreurs)!,
    },
    minicarte: {
      taillePx: exigerNombre(minicarteO, 'taillePx', chemin(b, 'minicarte'), { min: 80, max: 600, entier: true }, erreurs)!,
      opaciteFond: exigerNombre(minicarteO, 'opaciteFond', chemin(b, 'minicarte'), { min: 0, max: 1 }, erreurs)!,
      couleurVue: exigerTexte(minicarteO, 'couleurVue', chemin(b, 'minicarte'), erreurs)!,
      tailleMarqueurVillage: exigerNombre(minicarteO, 'tailleMarqueurVillage', chemin(b, 'minicarte'), { min: 1, max: 8, entier: true }, erreurs)!,
    },
    palettes: {
      eauProfonde: palettes.eauProfonde!,
      eau: palettes.eau!,
      eauGelee: palettes.eauGelee!,
      plage: palettes.plage!,
      prairie: palettes.prairie!,
      foret: palettes.foret!,
      colline: colline!,
      montagne: montagne!,
      neige: palettes.neige!,
      terre: palettes.terre!,
      toundra: toundra!,
      taiga: palettes.taiga!,
      savane: savane!,
      jungle: palettes.jungle!,
      desert: desert!,
      sentier: {
        base: sentierO ? exigerTexte(sentierO, 'base', chemin(pBase, 'sentier'), erreurs)! : '#8a6a3a',
        clair: sentierO ? exigerTexte(sentierO, 'clair', chemin(pBase, 'sentier'), erreurs)! : '#a8895a',
      },
      pollution: {
        couleur: pollutionO ? exigerTexte(pollutionO, 'couleur', chemin(pBase, 'pollution'), erreurs)! : '#4a4238',
        alphaMax: pollutionO ? exigerNombre(pollutionO, 'alphaMax', chemin(pBase, 'pollution'), { min: 0.05, max: 1 }, erreurs)! : 0.55,
      },
      gisement,
      relief: {
        ombreAlphaMax: reliefO ? exigerNombre(reliefO, 'ombreAlphaMax', chemin(pBase, 'relief'), { min: 0.01, max: 1 }, erreurs)! : 0.28,
        lumiereAlphaMax: reliefO ? exigerNombre(reliefO, 'lumiereAlphaMax', chemin(pBase, 'relief'), { min: 0.01, max: 1 }, erreurs)! : 0.14,
      },
      bois: {
        murs: boisO ? exigerTexte(boisO, 'murs', chemin(pBase, 'bois'), erreurs)! : '#a37a4c',
        toits: boisO ? exigerTexte(boisO, 'toits', chemin(pBase, 'bois'), erreurs)! : '#8a5a33',
        toitFonce: boisO ? exigerTexte(boisO, 'toitFonce', chemin(pBase, 'bois'), erreurs)! : '#5a3a22',
        bois: boisO ? exigerTexte(boisO, 'bois', chemin(pBase, 'bois'), erreurs)! : '#6b4a2b',
        poteau: boisO ? exigerTexte(boisO, 'poteau', chemin(pBase, 'bois'), erreurs)! : '#7d5a35',
      },
      pierre: {
        base: pierreO ? exigerTexte(pierreO, 'base', chemin(pBase, 'pierre'), erreurs)! : '#8a8a92',
        clair: pierreO ? exigerTexte(pierreO, 'clair', chemin(pBase, 'pierre'), erreurs)! : '#a8a8b2',
        sombre: pierreO ? exigerTexte(pierreO, 'sombre', chemin(pBase, 'pierre'), erreurs)! : '#6c6c75',
      },
      metal: {
        base: metalO ? exigerTexte(metalO, 'base', chemin(pBase, 'metal'), erreurs)! : '#6a6f78',
        clair: metalO ? exigerTexte(metalO, 'clair', chemin(pBase, 'metal'), erreurs)! : '#9aa0aa',
      },
      flammes: exigerTableauTextes(palO, 'flammes', pBase, 3, erreurs)!,
      fumee: exigerTexte(palO, 'fumee', pBase, erreurs)!,
      peau: {
        base: peauO ? exigerTexte(peauO, 'base', chemin(pBase, 'peau'), erreurs)! : '#e8b88a',
        min: peauO ? exigerTexte(peauO, 'min', chemin(pBase, 'peau'), erreurs)! : '#7a4a2e',
        max: peauO ? exigerTexte(peauO, 'max', chemin(pBase, 'peau'), erreurs)! : '#f2cda0',
      },
      cheveux: exigerTableauTextes(palO, 'cheveux', pBase, 4, erreurs)!,
      vetements: exigerTableauTextes(palO, 'vetements', pBase, 6, erreurs)!,
      marqueurFavori: exigerTexte(palO, 'marqueurFavori', pBase, erreurs)!,
      marqueurDirigeant: exigerTexte(palO, 'marqueurDirigeant', pBase, erreurs)!,
      contourSelection: exigerTexte(palO, 'contourSelection', pBase, erreurs)!,
      contourSurvol: exigerTexte(palO, 'contourSurvol', pBase, erreurs)!,
      chantier: {
        bois: chantierO ? exigerTexte(chantierO, 'bois', chemin(pBase, 'chantier'), erreurs)! : '#7d5a35',
        planche: chantierO ? exigerTexte(chantierO, 'planche', chemin(pBase, 'chantier'), erreurs)! : '#a8895a',
      },
      especes,
      vehicule: {
        coque: vehiculeO ? exigerTexte(vehiculeO, 'coque', chemin(pBase, 'vehicule'), erreurs)! : '#6b4a2b',
        voile: vehiculeO ? exigerTexte(vehiculeO, 'voile', chemin(pBase, 'vehicule'), erreurs)! : '#e8e0cc',
        roue: vehiculeO ? exigerTexte(vehiculeO, 'roue', chemin(pBase, 'vehicule'), erreurs)! : '#4a361f',
        ecume: vehiculeO ? exigerTexte(vehiculeO, 'ecume', chemin(pBase, 'vehicule'), erreurs)! : '#d9e8f2',
      },
    },
    saisons: {
      printemps: saisons.printemps!,
      ete: saisons.ete!,
      automne: saisons.automne!,
      hiver: saisons.hiver!,
    },
    taillesSprites: {
      humain: tailles.humain!,
      animalMax: exigerNombre(taillesO, 'animalMax', chemin(b, 'taillesSprites'), { min: 4, max: 12, entier: true }, erreurs)!,
      batimentMax: exigerNombre(taillesO, 'batimentMax', chemin(b, 'taillesSprites'), { min: 8, max: 16, entier: true }, erreurs)!,
    },
  };

  if (erreurs.length > 0) throw new ErreurConfig(erreurs);

  if (rendu.paliersZoomPxParTuile.some((p, i) => i > 0 && p <= rendu.paliersZoomPxParTuile[i - 1])) {
    throw new ErreurConfig([`${b}.paliersZoomPxParTuile: les paliers doivent être strictement croissants`]);
  }
  if (!rendu.paliersZoomPxParTuile.includes(rendu.seuils.spritesCompletsPxParTuile)) {
    erreurs.push(`${b}.seuils.spritesCompletsPxParTuile: doit être l'un des paliers de zoom`);
  }
  for (const cle of CLES_GISEMENTS) {
    if (!(cle in rendu.palettes.gisement)) erreurs.push(`${b}.palettes.gisement.${cle}: couleur manquante`);
  }
  for (const cle of CLES_ESPECES) {
    if (!(cle in rendu.palettes.especes)) erreurs.push(`${b}.palettes.especes.${cle}: palette manquante`);
  }
  if (erreurs.length > 0) throw new ErreurConfig(erreurs);
  return rendu;
}
