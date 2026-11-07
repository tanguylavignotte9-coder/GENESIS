import type { EtatPartage } from '../etat';
import type { ConfigComplete } from '../config/schema';
import { Matiere, estEau } from '../types';

// ============================================================
// Pont worker -> renderer (V1.2 graphismes).
// Ce module ne fait QUE lire l'état de la simulation pour le
// sérialiser vers le renderer : il n'appelle JAMAIS le RNG de la
// sim et ne modifie aucun état. Le déterminisme est intact.
// ============================================================

// Mot de 32 bits par tuile :
//   bits  0- 3 : matière de surface (0..14, Vide -> Pierre)
//   bits  4- 7 : élévation (0..15)
//   bits  8-11 : végétation (0..8)
//   bits 12-13 : météo (0..3)
//   bit     14 : gelée (eau douce gelée)
//   bits 15-16 : pollution quantifiée (0..3)
//   bit     17 : sentier (passage >= seuilPassageSentier)
//   bits 18-19 : niveau d'usage du sentier (0..3)
//   bits 20-25 : biomasse végétation quantifiée (0..63, maturité des champs)
export const MASQUE_MATIERE = 0xf;
export const MASQUE_ELEVATION = 0xf << 4;
export const MASQUE_VEGETATION = 0xf << 8;
export const MASQUE_METEO = 0x3 << 12;
export const BIT_GELE = 1 << 14;
export const MASQUE_POLLUTION = 0x3 << 15;
export const BIT_SENTIER = 1 << 17;
export const MASQUE_NIVEAU_SENTIER = 0x3 << 18;
export const MASQUE_BIOMASSE = 0x3f << 20;

export function decoderMot(mot: number): {
  matiere: number;
  elevation: number;
  vegetation: number;
  meteo: number;
  gele: boolean;
  pollutionQ: number;
  sentier: boolean;
  niveauSentier: number;
  biomasseQ: number;
} {
  return {
    matiere: mot & MASQUE_MATIERE,
    elevation: (mot & MASQUE_ELEVATION) >>> 4,
    vegetation: (mot & MASQUE_VEGETATION) >>> 8,
    meteo: (mot & MASQUE_METEO) >>> 12,
    gele: (mot & BIT_GELE) !== 0,
    pollutionQ: (mot & MASQUE_POLLUTION) >>> 15,
    sentier: (mot & BIT_SENTIER) !== 0,
    niveauSentier: (mot & MASQUE_NIVEAU_SENTIER) >>> 18,
    biomasseQ: (mot & MASQUE_BIOMASSE) >>> 20,
  };
}

export interface DigestRenduV2 {
  tuiles: Uint32Array;
  chunkVersions: Uint32Array;
  chunkSize: number;
  nbChunksX: number;
  individus: number[];
  animaux: number[];
  vehicules: number[];
  batiments: number[];
  territoires: Array<{ id: number; couleur: number; tuiles: number[] }>;
  villages: Array<{ id: number; x: number; y: number; couleur: number }>;
  especes: string[];
  typesBatiments: string[];
  saisonNord: number;
  saisonSud: number;
}

function quantifierPollution(p: number): number {
  if (p <= 0.05) return 0;
  if (p <= 0.35) return 1;
  if (p <= 0.7) return 2;
  return 3;
}

export function digestRenduV2(etat: EtatPartage, config: ConfigComplete): DigestRenduV2 {
  const monde = etat.monde;
  const t = monde.taille;
  const n = t * t;
  const tuiles = new Uint32Array(n);
  const seuilSentier = config.monde.seuilPassageSentier;
  const biomasseMax = config.fauneFlore.biomasseVegetationMax;
  for (let i = 0; i < n; i++) {
    const elev = monde.elevation[i];
    let m = monde.matiere[monde.indexNiveau(i % t, Math.floor(i / t), elev)];
    if (m === Matiere.Vide) m = Matiere.Pierre;
    const passage = monde.passage[i];
    const sentier = passage >= seuilSentier && !estEau(m) ? 1 : 0;
    const niveauSentier = sentier ? Math.min(3, Math.floor((passage / Math.max(1, seuilSentier) - 1) / 2)) : 0;
    const biomasseQ = Math.max(0, Math.min(63, Math.round((monde.biomasseVegetation[i] / biomasseMax) * 63)));
    tuiles[i] =
      (m & MASQUE_MATIERE) |
      ((elev & 0xf) << 4) |
      ((monde.vegetation[i] & 0xf) << 8) |
      ((monde.meteo[i] & 0x3) << 12) |
      ((monde.gele[i] === 1 ? 1 : 0) << 14) |
      (quantifierPollution(monde.pollution[i]) << 15) |
      (sentier << 17) |
      (niveauSentier << 18) |
      (biomasseQ << 20);
  }

  const chunkSize = 64;
  const nbChunksX = Math.ceil(t / chunkSize);
  const nbChunksY = Math.ceil(t / chunkSize);
  const chunkVersions = new Uint32Array(nbChunksX * nbChunksY);
  const saisonNord = etat.calendrier.saisonPourDistanceEquateur(0.5, true);
  const saisonSud = etat.calendrier.saisonPourDistanceEquateur(0.5, false);
  for (let cy = 0; cy < nbChunksY; cy++) {
    for (let cx = 0; cx < nbChunksX; cx++) {
      let h = 0x811c9dc5;
      const y0 = cy * chunkSize;
      const y1 = Math.min(t, y0 + chunkSize);
      const x0 = cx * chunkSize;
      const x1 = Math.min(t, x0 + chunkSize);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const w = tuiles[y * t + x];
          h = Math.imul(h ^ w, 0x01000193);
          h = Math.imul(h ^ (w >>> 16), 0x01000193);
        }
      }
      // La saison fait partie de la version : changement de saison = chunk à re-rendre.
      h = Math.imul(h ^ (saisonNord + 1) * 0x9e3779b1, 0x01000193);
      h = Math.imul(h ^ (saisonSud + 1) * 0x85ebca6b, 0x01000193);
      chunkVersions[cy * nbChunksX + cx] = h >>> 0;
    }
  }

  const especes = Object.keys(config.fauneFlore.especes);
  const especeIndex = new Map<string, number>();
  especes.forEach((e, i) => especeIndex.set(e, i));
  const typesBatiments = Object.keys(config.batiments.types);
  const typeIndex = new Map<string, number>();
  typesBatiments.forEach((b, i) => typeIndex.set(b, i));

  const individus: number[] = [];
  const groupes = etat.groupes;
  for (const ind of etat.individus.values()) {
    if (!ind.vivant) continue;
    const g = ind.groupeId !== null ? groupes.get(ind.groupeId) : undefined;
    let flags = 0;
    if (g && g.dirigeantId === ind.id) flags |= 1;
    if (ind.grossesse !== null) flags |= 2;
    individus.push(
      ind.id,
      Math.round(ind.positionX * 10),
      Math.round(ind.positionY * 10),
      Math.round(ind.apparence.teintePeau),
      Math.round(ind.apparence.couleurCheveux),
      flags,
    );
  }

  const animaux: number[] = [];
  const maxAnimaux = 20000;
  for (const a of etat.animaux.values()) {
    if (!a.vivant) continue;
    if (animaux.length >= maxAnimaux * 4) break;
    const ei = especeIndex.get(a.especeId) ?? 0;
    animaux.push(a.id, Math.round(a.positionX * 10), Math.round(a.positionY * 10), ei, a.domestique ? 1 : 0);
  }

  const vehicules: number[] = [];
  for (const v of etat.vehicules.values()) {
    if (v.coule || v.enConstruction) continue;
    const ti = typeIndex.get(v.type) ?? 0;
    vehicules.push(v.id, Math.round(v.x * 10), Math.round(v.y * 10), ti);
  }

  const batiments: number[] = [];
  for (const b of etat.batiments.values()) {
    const ti = typeIndex.get(b.type) ?? 0;
    let flags = 0;
    if (b.enConstruction) flags |= 1;
    batiments.push(b.id, b.x, b.y, ti, Math.round(b.durabilite * 100), flags);
  }

  const territoires: Array<{ id: number; couleur: number; tuiles: number[] }> = [];
  const villages: Array<{ id: number; x: number; y: number; couleur: number }> = [];
  for (const g of etat.groupes.values()) {
    const tuiles: number[] = [];
    for (const p of g.territoire) {
      if (tuiles.length >= 800) break;
      tuiles.push(p.x, p.y);
    }
    territoires.push({ id: g.id, couleur: g.couleur, tuiles });
    if (g.niveau >= 2 && g.territoire.length > 0) {
      let sx = 0;
      let sy = 0;
      for (const p of g.territoire) {
        sx += p.x;
        sy += p.y;
      }
      villages.push({ id: g.id, x: sx / g.territoire.length, y: sy / g.territoire.length, couleur: g.couleur });
    }
  }

  return {
    tuiles,
    chunkVersions,
    chunkSize,
    nbChunksX,
    individus,
    animaux,
    vehicules,
    batiments,
    territoires,
    villages,
    especes,
    typesBatiments,
    saisonNord,
    saisonSud,
  };
}
