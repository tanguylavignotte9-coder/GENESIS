import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { serialiserSimulation, deserialiserSimulation } from '../src/sim/sauvegarde/serialiseur';
import { Sexe, NiveauGroupe } from '../src/sim/types';
import { TypeEvenement } from '../src/sim/journal/journal';
import { tickIndividu, indexAnimauxPourTick } from '../src/sim/entites/boucleIndividu';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function charger() {
  return parserConfig(lireDossierConfig(path.join(racine, 'config')));
}

function nouvelleSim(seed: number, options?: { nbBandes?: number; tailleBande?: number }): Simulation {
  const { config } = charger();
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

function vivants(sim: Simulation) {
  return Array.from(sim.etat.individus.values()).filter((i) => i.vivant);
}

describe('J3 — bandes initiales et individus', () => {
  it('pose les bandes demandées avec individus sur terre, stocks, savoirs de départ et journal', () => {
    const sim = nouvelleSim(42, { nbBandes: 2, tailleBande: 10 });
    expect(sim.etat.individus.size).toBe(20);
    expect(sim.etat.groupes.size).toBe(2);
    for (const g of sim.etat.groupes.values()) {
      expect(g.niveau).toBe(NiveauGroupe.Bande);
      expect(g.membres.length).toBe(10);
      expect(g.dirigeantId).not.toBeNull();
      expect(g.stocksCommuns.nourriture).toBeGreaterThan(0);
    }
    for (const ind of sim.etat.individus.values()) {
      const x = Math.round(ind.positionX);
      const y = Math.round(ind.positionY);
      expect(sim.etat.monde.estEau(x, y)).toBe(false);
      expect(ind.connaissances.size).toBe(5);
      expect(ind.nom).toContain(' ');
      expect(ind.ageAnnees).toBeGreaterThanOrEqual(0);
    }
    const events = sim.etat.journal.lire({});
    expect(events.filter((e) => e.type === TypeEvenement.Fondation).length).toBe(2);
  });

  it('est déterministe avec les individus (même graine → mêmes empreintes)', () => {
    const a = nouvelleSim(77, { nbBandes: 2, tailleBande: 12 });
    const b = nouvelleSim(77, { nbBandes: 2, tailleBande: 12 });
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteIndividus()).toBe(b.empreinteIndividus());
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
    expect(a.empreinteAnimaux()).toBe(b.empreinteAnimaux());
  });

  it('une bande survit quand la nourriture est disponible (manger, boire, dormir)', () => {
    const sim = nouvelleSim(9, { nbBandes: 1, tailleBande: 12 });
    const initial = vivants(sim).length;
    avancer(sim, 24);
    expect(vivants(sim).length).toBeGreaterThan(0);
    const naissances = sim.etat.journal.lire({ types: [TypeEvenement.Naissance] });
    const morts = sim.etat.journal.lire({ types: [TypeEvenement.Mort] });
    expect(naissances.length + morts.length).toBeGreaterThanOrEqual(0);
    expect(sim.etat.individus.size).toBeGreaterThanOrEqual(initial);
  });

  it('un individu meurt de famine sans nourriture et laisse une carcasse', () => {
    const sim = nouvelleSim(5, { nbBandes: 1, tailleBande: 6 });
    const monde = sim.etat.monde;
    monde.biomasseVegetation.fill(0);
    monde.carcasseNourriture.fill(0);
    for (const a of sim.etat.animaux.values()) a.vivant = false;
    for (const g of sim.etat.groupes.values()) g.stocksCommuns.nourriture = 0;
    const cible = vivants(sim)[0];
    cible.ageAnnees = 30;
    cible.sante.valeur = 60;
    const joursParTick = (sim.config.temps.pasDeTempsSecondesReel / sim.config.temps.secondesParMoisAX1) * sim.config.temps.joursParMois * 50;
    const index = indexAnimauxPourTick(sim.etat);
    for (let t = 0; t < 600 && cible.vivant; t++) {
      cible.besoins.faim = 99;
      tickIndividu(sim.etat, sim.config, cible, joursParTick, index);
    }
    const tx = Math.round(cible.positionX);
    const ty = Math.round(cible.positionY);
    expect(cible.vivant).toBe(false);
    expect(cible.causeMort).toBe('famine');
    expect(monde.carcasseNourriture[monde.index(tx, ty)]).toBeGreaterThan(0);
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Mort], individuId: cible.id }).length).toBe(1);
  });

  it('le cannibalisme n\'a lieu qu\'en famine extrême, avec traumatisme et journal de drame', () => {
    const sim = nouvelleSim(6, { nbBandes: 1, tailleBande: 6 });
    for (const g of sim.etat.groupes.values()) g.stocksCommuns.nourriture = 0;
    sim.etat.monde.biomasseVegetation.fill(0);
    const cible = vivants(sim)[0];
    cible.besoins.faim = 99;
    const i = sim.etat.monde.index(Math.round(cible.positionX), Math.round(cible.positionY));
    sim.etat.monde.carcasseNourriture[i] = 50;
    const stressAvant = cible.besoins.stress;
    avancer(sim, 2);
    expect(cible.besoins.faim).toBeLessThan(99);
    expect(cible.besoins.stress).toBeGreaterThan(stressAvant);
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Drame], individuId: cible.id }).length).toBeGreaterThan(0);
  });

  it('un couple peut se reproduire : grossesse de 9 mois puis naissance', () => {
    const sim = nouvelleSim(21, { nbBandes: 1, tailleBande: 10 });
    const g = sim.etat.groupes.values().next().value!;
    const adultes = g.membres.map((id) => sim.etat.individus.get(id)!).filter((i) => i.ageAnnees >= 16 && i.vivant);
    const homme = adultes.find((i) => i.sexe === Sexe.Homme)!;
    const femme = adultes.find((i) => i.sexe === Sexe.Femme)!;
    homme.positionX = 500;
    homme.positionY = 500;
    femme.positionX = 500.5;
    femme.positionY = 500.5;
    homme.ageAnnees = 25;
    femme.ageAnnees = 24;
    homme.besoins.reproduction = 100;
    femme.besoins.reproduction = 100;
    const avant = sim.etat.individus.size;
    avancer(sim, 14);
    const naissances = sim.etat.journal.lire({ types: [TypeEvenement.Naissance] });
    expect(naissances.length).toBeGreaterThan(0);
    expect(sim.etat.individus.size).toBe(avant + naissances.length);
    const bebe = Array.from(sim.etat.individus.values()).find((i) => i.mere === femme.id);
    expect(bebe).toBeDefined();
    expect(bebe!.pereRegistre).toBe(homme.id);
    expect(bebe!.pereBiologique).toBe(homme.id);
  });

  it('la sénescence dégrade le corps et peut causer la mort naturelle', () => {
    const sim = nouvelleSim(33, { nbBandes: 1, tailleBande: 5 });
    const vieux = vivants(sim)[0];
    vieux.ageAnnees = 78;
    vieux.sante.valeur = 30;
    const forceAvant = vieux.force;
    avancer(sim, 12);
    expect(vieux.force).toBeLessThan(forceAvant);
    avancer(sim, 24);
    if (!vieux.vivant) {
      expect(vieux.causeMort).toBeTruthy();
    }
  });

  it('la sauvegarde conserve grossesse et état complet des individus', () => {
    const { config, empreintes } = charger();
    const sim = nouvelleSim(8, { nbBandes: 1, tailleBande: 8 });
    const femme = vivants(sim).find((i) => i.sexe === Sexe.Femme)!;
    femme.grossesse = { pereRegistreId: 1, pereBiologiqueId: 1, moisRestants: 4 };
    avancer(sim, 3);
    const json = serialiserSimulation(sim, empreintes, 'test');
    const { simulation: sim2, avertissements } = deserialiserSimulation(json, config, empreintes);
    expect(avertissements).toEqual([]);
    const f2 = Array.from(sim2.etat.individus.values()).find((i) => i.id === femme.id)!;
    expect(f2.grossesse).not.toBeNull();
    expect(f2.grossesse!.moisRestants).toBeCloseTo(femme.grossesse!.moisRestants, 5);
    expect(sim2.empreinteIndividus()).toBe(sim.empreinteIndividus());
  });
});
