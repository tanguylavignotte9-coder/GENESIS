import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { Calendrier } from '../src/sim/temps/calendrier';
import { Saison } from '../src/sim/types';
import { BoucleTemps } from '../src/sim/temps/boucleTemps';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function config() {
  return parserConfig(lireDossierConfig(path.join(racine, 'config'))).config;
}

describe('temps et vitesses', () => {
  it('1 mois = 300 secondes réelles à ×1', () => {
    const c = config();
    const cal = new Calendrier(c.temps);
    const boucle = new BoucleTemps(c.temps);
    boucle.definirVitesse(1);
    boucle.avancerSecondesReelles(299, cal);
    expect(cal.mois).toBe(1);
    boucle.avancerSecondesReelles(1, cal);
    expect(cal.mois).toBe(2);
  });

  it('la pause fige le temps', () => {
    const c = config();
    const cal = new Calendrier(c.temps);
    const boucle = new BoucleTemps(c.temps);
    boucle.pause();
    const r = boucle.avancerSecondesReelles(1000, cal);
    expect(r.jours).toBe(0);
    expect(cal.mois).toBe(1);
  });

  it('×50 fait passer 50 mois en 300 secondes', () => {
    const c = config();
    const cal = new Calendrier(c.temps);
    const boucle = new BoucleTemps(c.temps);
    boucle.definirVitesse(50);
    boucle.avancerSecondesReelles(300, cal);
    expect(cal.an * 12 + cal.mois).toBe(1 * 12 + 51);
  });

  it('refuse une vitesse non autorisée', () => {
    const c = config();
    const boucle = new BoucleTemps(c.temps);
    boucle.definirVitesse(7);
    expect(boucle.vitesse).not.toBe(7);
  });

  it('les saisons suivent la latitude et l\'hémisphère', () => {
    const c = config();
    const cal = new Calendrier(c.temps);
    cal.mois = 7;
    expect(cal.saisonPourDistanceEquateur(0.5, true)).toBe(Saison.Ete);
    expect(cal.saisonPourDistanceEquateur(0.5, false)).toBe(Saison.Hiver);
    expect(cal.saisonPourDistanceEquateur(0.1, true)).toBe(Saison.Humide);
    cal.mois = 1;
    expect(cal.saisonPourDistanceEquateur(0.1, true)).toBe(Saison.Seche);
  });

  it('la simulation avance mois par mois et déclenche la météo mensuelle', () => {
    const c = config();
    const sim = new Simulation(c, 5);
    sim.initialiser();
    sim.definirVitesse(50);
    const empreinteInitiale = sim.empreinteMonde();
    for (let i = 0; i < 60; i++) sim.tick(c.temps.pasDeTempsSecondesReel);
    expect(sim.etat.calendrier.mois + sim.etat.calendrier.an * 12).toBeGreaterThan(12 + 1);
    expect(sim.empreinteMonde()).not.toBe(empreinteInitiale);
  });
});
