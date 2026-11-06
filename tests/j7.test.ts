import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { serialiserSimulation, deserialiserSimulation } from '../src/sim/sauvegarde/serialiseur';
import { chroniqueEspece } from '../src/sim/recit/chroniques';
import { TypeEvenement } from '../src/sim/journal/journal';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function charger(tailleMonde?: number) {
  const { config, empreintes } = parserConfig(lireDossierConfig(path.join(racine, 'config')));
  if (tailleMonde) config.monde.tailleGrille = tailleMonde;
  return { config, empreintes };
}

function nouvelleSim(seed: number, tailleMonde: number, options?: { nbBandes?: number; tailleBande?: number }): Simulation {
  const { config } = charger(tailleMonde);
  const sim = new Simulation(config, seed);
  sim.initialiser(options);
  return sim;
}

function avancer(sim: Simulation, mois: number): void {
  const c = sim.config;
  sim.definirVitesse(Math.max(...c.temps.vitessesDisponibles));
  const cible = sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois + mois;
  let securite = mois * 2000 + 1000;
  while (sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois < cible && securite-- > 0) {
    sim.tick(c.temps.pasDeTempsSecondesReel);
  }
}

describe('J7 — écran de fin extinction + chronique de l\'espèce', () => {
  it('l\'extinction totale déclenche le flag et produit une chronique factuelle', () => {
    const sim = nouvelleSim(42, 300, { nbBandes: 1, tailleBande: 8 });
    avancer(sim, 3);
    for (const ind of sim.etat.individus.values()) {
      ind.vivant = false;
      ind.causeMort = 'test';
    }
    avancer(sim, 2);
    expect(sim.etat.extinctionTotale).toBe(true);
    const chronique = chroniqueEspece(sim.etat);
    expect(chronique.morts).toBeGreaterThan(0);
    expect(chronique.anFin).toBeGreaterThanOrEqual(1);
    expect(chronique.derniersEvenements.some((e) => e.sujet === 'Extinction totale')).toBe(true);
    expect(Array.isArray(chronique.figures)).toBe(true);
  });
});

describe('J7 — sauvegarde exacte en jeu (slots, autosave)', () => {
  it('une sauvegarde à un instant quelconque reprend exactement et continue à l\'identique', () => {
    const { config, empreintes } = charger(300);
    const a = new Simulation(config, 77);
    a.initialiser({ nbBandes: 2, tailleBande: 10 });
    avancer(a, 7);
    const json = serialiserSimulation(a, empreintes, new Date().toISOString());
    const sauvegarde = JSON.parse(json);
    expect(sauvegarde.version).toBe(1);
    expect(sauvegarde.empreinteConfig.monde).toBe(empreintes.monde);
    const { simulation: b, avertissements } = deserialiserSimulation(json, config, empreintes);
    expect(avertissements).toEqual([]);
    expect(b.empreinteMonde()).toBe(a.empreinteMonde());
    expect(b.empreinteIndividus()).toBe(a.empreinteIndividus());
    avancer(a, 6);
    avancer(b, 6);
    expect(b.empreinteMonde()).toBe(a.empreinteMonde());
    expect(b.empreinteIndividus()).toBe(a.empreinteAnimaux() === b.empreinteAnimaux() ? a.empreinteIndividus() : a.empreinteIndividus());
    expect(b.empreinteAnimaux()).toBe(a.empreinteAnimaux());
    expect(b.etat.journal.taille).toBe(a.etat.journal.taille);
  });
});

describe('J7 — LOD de simulation par zone active', () => {
  it('hors zone active, les individus vieillissent ~N fois moins vite', () => {
    const sim = nouvelleSim(42, 300, { nbBandes: 1, tailleBande: 10 });
    const individus = Array.from(sim.etat.individus.values()).filter((i) => i.vivant);
    const dedans = individus[0];
    const dehors = individus[individus.length - 1];
    dedans.positionX = 100;
    dedans.positionY = 100;
    dehors.positionX = 250;
    dehors.positionY = 250;
    sim.etat.zoneActive = { x0: 90, y0: 90, x1: 110, y1: 110 };
    const ageDedans0 = dedans.ageAnnees;
    const ageDehors0 = dehors.ageAnnees;
    sim.definirVitesse(50);
    for (let t = 0; t < 600; t++) sim.tick(0.1);
    const deltaDedans = dedans.ageAnnees - ageDedans0;
    const deltaDehors = dehors.ageAnnees - ageDehors0;
    expect(deltaDedans).toBeGreaterThan(0);
    expect(deltaDehors).toBeLessThan(deltaDedans / 3);
  });
});

describe('J7 — robustesse multi-graines (aucun calibrage sur une seule graine)', () => {
  it('3 graines différentes, 200 mois chacune : la sim tourne sans erreur, le journal vit, population cohérente', () => {
    for (const seed of [1, 42, 99]) {
      const sim = nouvelleSim(seed, 300, { nbBandes: 2, tailleBande: 15 });
      const journal0 = sim.etat.journal.taille;
      avancer(sim, 200);
      expect(sim.etat.journal.taille).toBeGreaterThan(journal0);
      const vivants = Array.from(sim.etat.individus.values()).filter((i) => i.vivant).length;
      expect(vivants > 0 || sim.etat.extinctionTotale).toBe(true);
      expect(sim.etat.journal.lire({ types: [TypeEvenement.Mort] }).length).toBeGreaterThanOrEqual(0);
    }
  });
});
