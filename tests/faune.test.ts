import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';

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
  let securite = mois * 1000 + 100;
  while (sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois < cible && securite-- > 0) {
    sim.tick(c.temps.pasDeTempsSecondesReel);
  }
}

describe('faune (J2)', () => {
  it('peuple le monde d\'animaux, uniquement sur la terre, avec des espèces variées', () => {
    const sim = nouvelleSim(42);
    const monde = sim.etat.monde;
    const animaux = Array.from(sim.etat.animaux.values());
    expect(animaux.length).toBeGreaterThan(1000);
    const especes = new Set(animaux.map((a) => a.especeId));
    expect(especes.size).toBeGreaterThanOrEqual(3);
    for (const a of animaux) {
      const x = Math.round(a.positionX);
      const y = Math.round(a.positionY);
      expect(monde.estEau(x, y)).toBe(false);
    }
  });

  it('est déterministe : même graine → même empreinte animaux après 12 mois', () => {
    const a = nouvelleSim(77);
    const b = nouvelleSim(77);
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteAnimaux()).toBe(b.empreinteAnimaux());
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
  });

  it('les animaux meurent de faim quand la végétation est épuisée et laissent des carcasses', () => {
    const sim = nouvelleSim(5);
    const monde = sim.etat.monde;
    monde.biomasseVegetation.fill(0);
    const avant = Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length;
    avancer(sim, 36);
    const apres = Array.from(sim.etat.animaux.values());
    const morts = apres.filter((a) => !a.vivant);
    expect(morts.length).toBeGreaterThan(0);
    expect(morts.some((a) => a.causeMort === 'famine')).toBe(true);
    let carcasses = 0;
    for (let i = 0; i < monde.carcasseNourriture.length; i++) carcasses += monde.carcasseNourriture[i];
    expect(carcasses).toBeGreaterThan(0);
    expect(apres.filter((a) => a.vivant).length).toBeLessThan(avant);
  });

  it('la population se reproduit quand la nourriture abonde', () => {
    const sim = nouvelleSim(11);
    const monde = sim.etat.monde;
    monde.biomasseVegetation.fill(100);
    const avant = Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length;
    avancer(sim, 24);
    const apres = Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length;
    expect(apres).toBeGreaterThan(avant);
  });

  it('les paramètres de départ (bandes, taille) sont bornés et consignés au journal', () => {
    const { config } = charger();
    const sim = new Simulation(config, 3);
    sim.initialiser({ nbBandes: 999, tailleBande: 2 });
    expect(sim.etat.parametresDepart.nbBandes).toBe(config.societe.bandesInitialesMax);
    expect(sim.etat.parametresDepart.tailleBande).toBe(config.societe.tailleBandeInitialeMin);
    expect(sim.etat.journal.lire({ types: undefined }).some((e) => e.sujet === 'Départ des bandes')).toBe(true);
    const sim2 = new Simulation(config, 3);
    sim2.initialiser({ nbBandes: 2, tailleBande: 15 });
    expect(sim2.etat.parametresDepart).toEqual({ seed: 3, nbBandes: 2, tailleBande: 15 });
  });

  it('la config faune valide les espèces et refuse un régime inconnu', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    const { config } = parserConfig(textes);
    expect(Object.keys(config.fauneFlore.especes).length).toBeGreaterThanOrEqual(5);
    const casse = { ...textes, 'faune-flore': textes['faune-flore'].replace('"regime": "herbivore"', '"regime": "dragon"') };
    expect(() => parserConfig(casse)).toThrow(/regime/);
  });
});
