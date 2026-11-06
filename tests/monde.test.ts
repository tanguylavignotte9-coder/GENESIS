import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { Matiere, estEau } from '../src/sim/types';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nouvelleSim(seed: number): Simulation {
  const { config } = parserConfig(lireDossierConfig(path.join(racine, 'config')));
  const sim = new Simulation(config, seed);
  sim.initialiser();
  return sim;
}

describe('monde généré', () => {
  it('respecte les invariants : niveau 0 toujours pierre, rien au-dessus de l\'eau', () => {
    const sim = nouvelleSim(42);
    const monde = sim.etat.monde;
    let nbTerre = 0;
    let nbEauSalee = 0;
    let nbRivieres = 0;
    let nbGisements = 0;
    let violationsSocle = 0;
    let violationsPile = 0;
    for (let y = 0; y < monde.taille; y++) {
      for (let x = 0; x < monde.taille; x++) {
        if (monde.matiereNiveau(x, y, 0) !== Matiere.Pierre) violationsSocle++;
        const elev = monde.elevationTuile(x, y);
        for (let n = 1; n <= elev; n++) {
          const m = monde.matiereNiveau(x, y, n);
          if (m === Matiere.Vide) violationsPile++;
          if (estEau(m) && n !== elev) violationsPile++;
        }
        for (let n = elev + 1; n < monde.niveauxMax; n++) {
          if (monde.matiereNiveau(x, y, n) !== Matiere.Vide) violationsPile++;
        }
        const surf = monde.matiereNiveau(x, y, elev);
        if (surf === Matiere.EauSalee) nbEauSalee++;
        else if (surf === Matiere.EauDouce) nbRivieres++;
        else nbTerre++;
        if (monde.estGisementTuile(x, y)) nbGisements++;
      }
    }
    expect(violationsSocle).toBe(0);
    expect(violationsPile).toBe(0);
    expect(nbTerre).toBeGreaterThan(50000);
    expect(nbEauSalee).toBeGreaterThan(100000);
    expect(nbRivieres).toBeGreaterThan(50);
    expect(nbGisements).toBeGreaterThan(50);
  }, 60000);

  it('a une ceinture d\'eau salée infranchissable sur les bords', () => {
    const sim = nouvelleSim(7);
    const monde = sim.etat.monde;
    const e = 6;
    for (let x = 0; x < monde.taille; x++) {
      expect(monde.estEauSalee(x, 0)).toBe(true);
      expect(monde.estEauSalee(x, e - 1)).toBe(true);
      expect(monde.estEauSalee(x, monde.taille - 1)).toBe(true);
      expect(monde.estEauSalee(0, x)).toBe(true);
      expect(monde.estEauSalee(monde.taille - 1, x)).toBe(true);
    }
    expect(monde.estTraversable(0, 0, 1, 0, false)).toBe(false);
    expect(monde.estTraversable(0, 0, 1, 0, true)).toBe(true);
  });

  it('les falaises (rupture d\'élévation > 1) sont infranchissables', () => {
    const sim = nouvelleSim(99);
    const monde = sim.etat.monde;
    let teste = 0;
    for (let y = 1; y < monde.taille && teste < 200; y++) {
      for (let x = 1; x < monde.taille && teste < 200; x++) {
        const d = Math.abs(monde.elevationTuile(x, y) - monde.elevationTuile(x - 1, y));
        if (d > 1) {
          expect(monde.estTraversable(x - 1, y, x, y, false)).toBe(false);
          expect(monde.estTraversable(x, y, x - 1, y, false)).toBe(false);
          teste++;
        }
      }
    }
    expect(teste).toBeGreaterThan(0);
  });

  it('l\'eau salée n\'est traversable qu\'avec un bateau', () => {
    const sim = nouvelleSim(3);
    const monde = sim.etat.monde;
    outer: for (let y = 0; y < monde.taille; y++) {
      for (let x = 0; x < monde.taille; x++) {
        if (monde.estEauSalee(x, y)) {
          for (const [nx, ny] of monde.voisins8(x, y)) {
            if (!monde.estEau(nx, ny)) {
              expect(monde.estTraversable(nx, ny, x, y, false)).toBe(false);
              expect(monde.estTraversable(nx, ny, x, y, true)).toBe(true);
              break outer;
            }
          }
        }
      }
    }
  });
});
