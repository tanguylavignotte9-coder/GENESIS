import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Rng } from '../src/sim/rng';
import { Monde } from '../src/sim/monde/monde';
import { genererMonde } from '../src/sim/monde/generateur';
import { Matiere, Vegetation, estEau } from '../src/sim/types';
import type { ConfigMonde } from '../src/sim/config/schema';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GRAINES = [11, 22, 33, 44, 55];
const TAILLE = 100;

function mondePour(graine: number, taille = TAILLE): { monde: Monde; config: ConfigMonde } {
  const { config } = parserConfig(lireDossierConfig(path.join(racine, 'config')));
  config.monde.tailleGrille = taille;
  const monde = new Monde(config.monde);
  genererMonde(monde, config.monde, new Rng(graine));
  return { monde, config: config.monde };
}

function compter(monde: Monde) {
  const t = monde.taille;
  let terre = 0;
  let eauSalee = 0;
  let eauDouce = 0;
  let sable = 0;
  const vegetations = new Set<Vegetation>();
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = monde.index(x, y);
      const m = monde.matiereNiveau(x, y, monde.elevationTuile(x, y));
      if (m === Matiere.EauSalee) eauSalee++;
      else if (m === Matiere.EauDouce) eauDouce++;
      else {
        terre++;
        if (m === Matiere.Sable) sable++;
        vegetations.add(monde.vegetation[i]);
      }
    }
  }
  return { terre, eauSalee, eauDouce, sable, vegetations };
}

// Distance BFS (4 voisins) à l'eau la plus proche.
function distanceEau(monde: Monde): Int32Array {
  const t = monde.taille;
  const dist = new Int32Array(t * t).fill(-1);
  const file: number[] = [];
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (estEau(monde.matiereNiveau(x, y, monde.elevationTuile(x, y)))) {
        dist[i] = 0;
        file.push(i);
      }
    }
  }
  for (let tete = 0; tete < file.length; tete++) {
    const i = file[tete];
    const x = i % t;
    const y = Math.floor(i / t);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
      const ni = ny * t + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[i] + 1;
      file.push(ni);
    }
  }
  return dist;
}

describe('propriétés du monde généré (mondes réduits 100x100, plusieurs graines)', () => {
  it('fraction de terre dans la fourchette cible sur chaque graine', () => {
    for (const graine of GRAINES) {
      const { monde, config } = mondePour(graine);
      const { terre } = compter(monde);
      const fraction = terre / (monde.taille * monde.taille);
      expect(fraction).toBeGreaterThanOrEqual(config.fractionTerreCible - 0.12);
      expect(fraction).toBeLessThanOrEqual(config.fractionTerreCible + 0.12);
    }
  });

  it('contrat de sorties : socle de pierre, piles valides, ceinture de bord en eau salée', () => {
    for (const graine of GRAINES) {
      const { monde, config } = mondePour(graine);
      const t = monde.taille;
      const bord = config.epaisseurBordEauSalee;
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          expect(monde.matiereNiveau(x, y, 0)).toBe(Matiere.Pierre);
          const e = monde.elevationTuile(x, y);
          expect(e).toBeGreaterThanOrEqual(1);
          expect(e).toBeLessThanOrEqual(config.niveauxElevationMax - 1);
          for (let k = 1; k <= e; k++) {
            const m = monde.matiereNiveau(x, y, k);
            expect(m).not.toBe(Matiere.Vide);
            if (estEau(m)) expect(k).toBe(e);
          }
          for (let k = e + 1; k < monde.niveauxMax; k++) {
            expect(monde.matiereNiveau(x, y, k)).toBe(Matiere.Vide);
          }
          if (monde.estBord(x, y, bord)) expect(monde.estEauSalee(x, y)).toBe(true);
        }
      }
    }
  });

  it('chaque type de végétation est présent quelque part (union des graines)', () => {
    const vus = new Set<Vegetation>();
    for (const graine of GRAINES) {
      const { monde } = mondePour(graine);
      for (const v of compter(monde).vegetations) vus.add(v);
    }
    for (let v = Vegetation.Toundra; v <= Vegetation.Neige; v++) {
      expect(vus.has(v as Vegetation)).toBe(true);
    }
  });

  it('aucune tuile de sable en zone froide (jamais de sable polaire)', () => {
    for (const graine of GRAINES) {
      const { monde, config } = mondePour(graine);
      const t = monde.taille;
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          const i = monde.index(x, y);
          if (monde.matiereNiveau(x, y, monde.elevationTuile(x, y)) === Matiere.Sable) {
            expect(monde.temperature[i]).toBeGreaterThanOrEqual(config.temperatureMinPlageCelsius);
          }
        }
      }
    }
  });

  it('les plages ne dépassent jamais la largeur max config depuis la ligne de côte', () => {
    for (const graine of GRAINES) {
      const { monde, config } = mondePour(graine);
      const t = monde.taille;
      const dist = distanceEau(monde);
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          const i = monde.index(x, y);
          if (monde.matiereNiveau(x, y, monde.elevationTuile(x, y)) === Matiere.Sable) {
            expect(dist[i]).toBeGreaterThanOrEqual(1);
            expect(dist[i]).toBeLessThanOrEqual(config.largeurMaxPlageTuiles);
          }
        }
      }
    }
  });

  it("pas de discontinuité d'humidité entre tuiles terrestres voisines (chasse les lignes droites de latitude)", () => {
    // Le bonus local +25 des tuiles de rivière/lac est un effet de rivière conservé de la V1,
    // pas une ligne de latitude : on teste la continuité du champ climatique de base (tuiles non eau).
    const SEUIL_SAUT = 12;
    for (const graine of GRAINES) {
      const { monde } = mondePour(graine);
      const t = monde.taille;
      const estEauTuile = (x: number, y: number) => estEau(monde.matiereNiveau(x, y, monde.elevationTuile(x, y)));
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          if (estEauTuile(x, y)) continue;
          if (x + 1 < t && !estEauTuile(x + 1, y)) {
            expect(Math.abs(monde.humidite[y * t + x + 1] - monde.humidite[y * t + x])).toBeLessThan(SEUIL_SAUT);
          }
          if (y + 1 < t && !estEauTuile(x, y + 1)) {
            expect(Math.abs(monde.humidite[(y + 1) * t + x] - monde.humidite[y * t + x])).toBeLessThan(SEUIL_SAUT);
          }
        }
      }
    }
  });

  it('océan à étages : plateau côtier et eau profonde au large, profondeur 1-Lipschitzienne', () => {
    let aPlateau = false;
    let aProfondeur = false;
    for (const graine of GRAINES) {
      const { monde, config } = mondePour(graine);
      const t = monde.taille;
      const profMax = Math.min(config.profondeurMaxOceanNiveaux, monde.niveauxMax - 1);
      for (let y = 0; y < t; y++) {
        for (let x = 0; x < t; x++) {
          const i = y * t + x;
          const e = monde.elevationTuile(x, y);
          if (!monde.estEauSalee(x, y)) continue;
          expect(e).toBeGreaterThanOrEqual(1);
          expect(e).toBeLessThanOrEqual(profMax);
          if (e === 1) aPlateau = true;
          if (e >= 2) aProfondeur = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
              if (!monde.estEauSalee(nx, ny)) continue;
              expect(Math.abs(monde.elevationTuile(nx, ny) - e)).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
    expect(aPlateau).toBe(true);
    expect(aProfondeur).toBe(true);
  });

  it('des rivières (eau douce de surface) sont présentes', () => {
    let total = 0;
    for (const graine of GRAINES) {
      total += compter(mondePour(graine).monde).eauDouce;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('déterminisme : même graine = même empreinte de monde, graines différentes = empreintes différentes', () => {
    const a = mondePour(4242).monde;
    const b = mondePour(4242).monde;
    const c = mondePour(4243).monde;
    expect(a.empreinte).toBe(b.empreinte);
    expect(a.empreinte).not.toBe(c.empreinte);
  });
});
