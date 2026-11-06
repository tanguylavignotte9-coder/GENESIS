import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { TypeEvenement } from '../src/sim/journal/journal';
import { biographie, sagaDuMoment } from '../src/sim/recit/chroniques';
import { peutCooperer } from '../src/sim/culture/systemeLangues';

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

describe('J5 — langues', () => {
  it('une langue isolée diverge et engendre une nouvelle langue', () => {
    const sim = nouvelleSim(42, { nbBandes: 2, tailleBande: 10 });
    sim.config.recit.tauxDivergenceLangueParSiecle = 24;
    const langueMere = sim.etat.langues.values().next().value!;
    langueMere.divergence = 0.5;
    avancer(sim, 2);
    expect(sim.etat.langues.size).toBeGreaterThan(1);
    const nouvelle = Array.from(sim.etat.langues.values()).find((l) => l.parentId === langueMere.id);
    expect(nouvelle).toBeDefined();
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Langue] }).length).toBeGreaterThan(0);
  });

  it('la barrière linguistique réduit la coopération, l\'apprentissage l\'atténue', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const [a, b] = vivants(sim);
    a.langueId = 1;
    b.langueId = 2;
    expect(peutCooperer(a, b, sim.config)).toBeLessThan(1);
    a.languesConnues.push(2);
    expect(peutCooperer(a, b, sim.config)).toBeGreaterThan(0.5);
  });
});

describe('J5 — religions', () => {
  it('un prophète charismatique fonde une religion générée et elle se propage', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    sim.config.recit.chanceRevelationParMois = 1;
    sim.config.recit.probabiliteScepticisme = 0;
    sim.config.recit.tauxPropagationReligionParMois = 1;
    const groupe = sim.etat.groupes.values().next().value!;
    const prophete = vivants(sim).sort((a, b) => b.charisme - a.charisme)[0];
    prophete.charisme = 95;
    prophete.ajouterMemoire(1, 'Drame vécu', 90, { an: 1, mois: 1 }, 40);
    avancer(sim, 4);
    expect(sim.etat.religions.size).toBeGreaterThan(0);
    const religion = sim.etat.religions.values().next().value!;
    expect(religion.propheteId).toBe(prophete.id);
    expect(religion.dieux.length).toBeGreaterThan(0);
    expect(religion.tabous.length).toBeGreaterThan(0);
    expect(groupe.religionId).toBe(religion.id);
    const croyants = vivants(sim).filter((i) => i.religionId === religion.id).length;
    expect(croyants).toBeGreaterThan(1);
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Religion] }).length).toBeGreaterThan(0);
  });

  it('des sceptiques existent et ne sont pas convertis', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    sim.config.recit.chanceRevelationParMois = 1;
    sim.config.recit.probabiliteScepticisme = 1;
    const prophete = vivants(sim).sort((a, b) => b.charisme - a.charisme)[0];
    prophete.charisme = 95;
    prophete.ajouterMemoire(1, 'Drame vécu', 90, { an: 1, mois: 1 }, 40);
    avancer(sim, 3);
    expect(sim.etat.religions.size).toBe(1);
    expect(vivants(sim).every((i) => i.religionId === null)).toBe(true);
  });
});

describe('J5 — santé mentale et récits', () => {
  it('un stress maximal prolongé mène à la folie (malus + journal)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    sim.config.recit.chanceFolieParMois = 1;
    sim.config.recit.moisStressMaxAvantFolie = 1;
    const cible = vivants(sim)[0];
    cible.besoins.stress = 100;
    avancer(sim, 3);
    expect(cible.malus).toContain('folie');
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Drame] }).some((e) => e.sujet === 'Folie' && e.individusImpliques.includes(cible.id))).toBe(true);
  });

  it('la biographie est factuelle : seulement les événements du journal de l\'individu', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    avancer(sim, 6);
    const cible = vivants(sim)[0];
    const bio = biographie(sim.etat, cible.id);
    for (const e of bio) expect(e.individusImpliques).toContain(cible.id);
  });

  it('la saga du moment suggère un événement marquant récent', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    avancer(sim, 6);
    const saga = sagaDuMoment(sim.etat);
    expect(saga).not.toBeNull();
    expect(['drame', 'mort', 'schisme', 'religion', 'fondation']).toContain(saga!.type);
  });

  it('reste déterministe avec langues, religions et santé mentale', () => {
    const a = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    const b = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteIndividus()).toBe(b.empreinteIndividus());
    expect(a.etat.langues.size).toBe(b.etat.langues.size);
    expect(a.etat.religions.size).toBe(b.etat.religions.size);
    expect(a.etat.journal.taille).toBe(b.etat.journal.taille);
  });
});
