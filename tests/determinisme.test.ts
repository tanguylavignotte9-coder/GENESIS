import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { serialiserSimulation, deserialiserSimulation } from '../src/sim/sauvegarde/serialiseur';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function charger() {
  const textes = lireDossierConfig(path.join(racine, 'config'));
  return parserConfig(textes);
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

describe('déterminisme', () => {
  it('deux mondes de même graine ont la même empreinte', () => {
    const { config } = charger();
    const a = new Simulation(config, 1234);
    const b = new Simulation(config, 1234);
    a.initialiser();
    b.initialiser();
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
    expect(a.etat.calendrier.an).toBe(b.etat.calendrier.an);
    expect(a.etat.journal.taille).toBe(b.etat.journal.taille);
  });

  it('deux graines différentes donnent des mondes différents', () => {
    const { config } = charger();
    const a = new Simulation(config, 1);
    const b = new Simulation(config, 2);
    a.initialiser();
    b.initialiser();
    expect(a.empreinteMonde()).not.toBe(b.empreinteMonde());
  });
});

describe('sauvegarde exacte et versionnée', () => {
  it('sérialise puis reprend exactement, et continue de façon identique', () => {
    const { config, empreintes } = charger();
    const a = new Simulation(config, 777);
    a.initialiser();
    avancer(a, 6);
    const json = serialiserSimulation(a, empreintes, new Date().toISOString());
    const { simulation: b, avertissements } = deserialiserSimulation(json, config, empreintes);
    expect(avertissements).toEqual([]);
    expect(b.empreinteMonde()).toBe(a.empreinteMonde());
    avancer(a, 6);
    avancer(b, 6);
    expect(b.empreinteMonde()).toBe(a.empreinteMonde());
    expect(b.etat.calendrier.an).toBe(a.etat.calendrier.an);
    expect(b.etat.journal.taille).toBe(a.etat.journal.taille);
  });

  it('avertit explicitement si la configuration a changé depuis la sauvegarde', () => {
    const { config, empreintes } = charger();
    const a = new Simulation(config, 9);
    a.initialiser();
    const json = serialiserSimulation(a, empreintes, new Date().toISOString());
    const empreintesModifiees = { ...empreintes, monde: empreintes.monde + 'x' };
    const { avertissements } = deserialiserSimulation(json, config, empreintesModifiees);
    expect(avertissements.length).toBeGreaterThan(0);
    expect(avertissements.some((m) => m.includes('monde.jsonc'))).toBe(true);
  });

  it('rejette une version de sauvegarde du futur', () => {
    const { config, empreintes } = charger();
    const a = new Simulation(config, 9);
    a.initialiser();
    const json = serialiserSimulation(a, empreintes, new Date().toISOString());
    const futur = JSON.parse(json);
    futur.version = 999;
    expect(() => deserialiserSimulation(JSON.stringify(futur), config, empreintes)).toThrow(/version/i);
  });
});
