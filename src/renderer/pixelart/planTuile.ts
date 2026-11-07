import type { ConfigRendu } from '../../sim/config/rendu';
import { decoderMot } from '../../sim/worker/digestRendu';
import { hashTuile } from './atlas';

// ============================================================
// Plan de tuile (pur, testable) : à partir du mot 32 bits envoyé
// par le worker + du voisinage, produit la clé de sprite atlas du
// fond de tuile et les rectangles de surcouche (relief, écume,
// sentier, pollution, affleurement de gisement), en coordonnées
// locales à la tuile (0..tailleTuilePx).
// ============================================================

export const MATIERE_PIERRE = 0;
export const MATIERE_TERRE = 1;
export const MATIERE_EAU_DOUCE = 2;
export const MATIERE_EAU_SALEE = 3;
export const MATIERE_SABLE = 4;

const GISEMENT_NOM: Record<number, string> = {
  5: 'charbon',
  6: 'gaz',
  7: 'uranium',
  8: 'petrole',
  9: 'fer',
  10: 'cuivre',
  11: 'etain',
  12: 'or',
  13: 'argent',
  14: 'sel',
};

export function estMatiereEau(m: number): boolean {
  return m === MATIERE_EAU_DOUCE || m === MATIERE_EAU_SALEE;
}

export function estMatiereGisement(m: number): boolean {
  return m in GISEMENT_NOM;
}

export interface RectPlan {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
  a: number;
}

export interface PlanTuile {
  sprite: string;
  rects: RectPlan[];
}

export interface ContexteTuile {
  x: number;
  y: number;
  eGauche: number;
  eHaut: number;
  terreHaut: boolean;
  terreBas: boolean;
  terreGauche: boolean;
  terreDroite: boolean;
  profond: boolean;
  saisonIdx: number;
  rendu: ConfigRendu;
}

export function planTuile(mot: number, ctx: ContexteTuile): PlanTuile {
  const d = decoderMot(mot);
  const T = ctx.rendu.tailleTuilePx;
  const P = ctx.rendu.palettes;
  const v = hashTuile(ctx.x, ctx.y) % ctx.rendu.variantesParTuile;
  const rects: RectPlan[] = [];
  let sprite: string;

  if (estMatiereEau(d.matiere)) {
    if (d.matiere === MATIERE_EAU_DOUCE && d.gele) {
      sprite = `tuile:eauGelee:v${v}`;
    } else if (d.matiere === MATIERE_EAU_SALEE && ctx.profond) {
      sprite = `tuile:eauProfonde:v${v}`;
    } else {
      sprite = `tuile:eau:v${v}`;
    }
    const ecume = P.eau.ecume;
    if (ctx.terreHaut) rects.push({ x: 0, y: 0, w: T, h: 1, c: ecume, a: 1 });
    if (ctx.terreBas) rects.push({ x: 0, y: T - 1, w: T, h: 1, c: ecume, a: 1 });
    if (ctx.terreGauche) rects.push({ x: 0, y: 0, w: 1, h: T, c: ecume, a: 1 });
    if (ctx.terreDroite) rects.push({ x: T - 1, y: 0, w: 1, h: T, c: ecume, a: 1 });
  } else if (d.matiere === MATIERE_SABLE) {
    sprite = `tuile:plage:v${v}`;
  } else {
    const elev = d.elevation;
    if (estMatiereGisement(d.matiere)) {
      sprite = elev >= 4 ? `tuile:montagne:v${v}` : elev >= 2 ? `tuile:colline:v${v}` : `tuile:terre:v${v}`;
      const couleur = P.gisement[GISEMENT_NOM[d.matiere]] ?? '#888888';
      const h = hashTuile(ctx.x + 101, ctx.y + 57);
      for (let i = 0; i < 3; i++) {
        rects.push({
          x: 1 + ((h >> (i * 3)) % (T - 2)),
          y: 1 + ((h >> (i * 3 + 1)) % (T - 2)),
          w: 1,
          h: 1,
          c: couleur,
          a: 1,
        });
      }
    } else {
      switch (d.vegetation) {
        case 1: sprite = `tuile:toundra:v${v}`; break;
        case 2: sprite = `tuile:taiga:v${v}`; break;
        case 3: sprite = `tuile:foret:s${ctx.saisonIdx}:v${v}`; break;
        case 4: sprite = `tuile:prairie:s${ctx.saisonIdx}:v${v}`; break;
        case 5: sprite = `tuile:savane:s${ctx.saisonIdx}:v${v}`; break;
        case 6: sprite = `tuile:jungle:v${v}`; break;
        case 7: sprite = `tuile:desert:v${v}`; break;
        case 8: sprite = `tuile:neige:v${v}`; break;
        default:
          sprite = elev >= 5 ? `tuile:neige:v${v}` : elev >= 4 ? `tuile:montagne:v${v}` : elev >= 2 ? `tuile:colline:v${v}` : `tuile:terre:v${v}`;
      }
    }
    if (d.sentier) {
      const taille = 2 + d.niveauSentier * 2;
      const off = Math.floor((T - taille) / 2);
      rects.push({ x: off, y: off, w: taille, h: taille, c: P.sentier.base, a: Math.min(1, 0.45 + 0.15 * d.niveauSentier) });
      rects.push({ x: off + 1, y: off + 1, w: Math.max(1, taille - 2), h: Math.max(1, taille - 2), c: P.sentier.clair, a: 0.35 });
    }
  }

  // Voile météo statique par tuile (l'animation pluie/neige/nuage est en surcouche écran).
  if (d.meteo === 1) rects.push({ x: 0, y: 0, w: T, h: T, c: '#141820', a: 0.12 });
  else if (d.meteo === 2) rects.push({ x: 0, y: 0, w: T, h: T, c: '#3a5a8a', a: 0.15 });
  else if (d.meteo === 3) rects.push({ x: 0, y: 0, w: T, h: T, c: '#e8eef2', a: 0.2 });

  if (d.pollutionQ > 0) {
    rects.push({ x: 0, y: 0, w: T, h: T, c: P.pollution.couleur, a: (d.pollutionQ / 3) * P.pollution.alphaMax });
  }

  // Ombrage du relief — formule exacte de l'Annexe A :
  // g = (e[i] - e[gauche]) + (e[i] - e[haut]) ; lumière du haut-gauche.
  const g = (d.elevation - ctx.eGauche) + (d.elevation - ctx.eHaut);
  if (g > 0.02) {
    rects.push({ x: 0, y: 0, w: T, h: T, c: '#000000', a: Math.min(P.relief.ombreAlphaMax, g * 2.2) });
  } else if (g < -0.02) {
    rects.push({ x: 0, y: 0, w: T, h: T, c: '#ffffff', a: Math.min(P.relief.lumiereAlphaMax, -g * 1.4) });
  }

  return { sprite, rects };
}
