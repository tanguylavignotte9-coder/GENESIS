import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { NiveauGroupe } from '../src/sim/types';
import { TypeEvenement } from '../src/sim/journal/journal';
import { mourir } from '../src/sim/entites/boucleIndividu';
import { Objet } from '../src/sim/economie/objet';

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

describe('J4 — premières sociétés', () => {
  it('un campement se sédentarise : feu puis hutte construits par chantier, la bande devient village', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    const groupe = sim.etat.groupes.values().next().value!;
    expect(groupe.niveau).toBe(NiveauGroupe.Bande);
    avancer(sim, 12);
    const types = Array.from(sim.etat.batiments.values()).map((b) => b.type);
    expect(types).toContain('feuDeCamp');
    expect(types).toContain('hutte');
    expect(groupe.niveau).toBe(NiveauGroupe.Village);
    const evenements = sim.etat.journal.lire({});
    expect(evenements.some((e) => e.sujet === 'Sédentarisation')).toBe(true);
    expect(evenements.some((e) => e.sujet === 'Bâtiment achevé')).toBe(true);
    for (const b of sim.etat.batiments.values()) {
      expect(b.enConstruction).toBe(false);
      expect(b.groupeId).toBe(groupe.id);
    }
  });

  it('le chantier avance par le travail réel (jours de chantier consommés par tick)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    avancer(sim, 2);
    const chantier = Array.from(sim.etat.batiments.values()).find((b) => b.enConstruction);
    if (chantier) {
      expect(chantier.chantierRestantJours).toBeGreaterThan(0);
    }
    avancer(sim, 12);
    expect(Array.from(sim.etat.batiments.values()).every((b) => !b.enConstruction)).toBe(true);
  });

  it('un bâtiment effondré à l\'usure disparaît et est consigné au journal', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    avancer(sim, 8);
    const b = Array.from(sim.etat.batiments.values())[0];
    expect(b).toBeDefined();
    b.durabilite = 0.0001;
    const id = b.id;
    avancer(sim, 2);
    expect(sim.etat.batiments.has(id)).toBe(false);
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Drame] }).some((e) => e.sujet === 'Effondrement')).toBe(true);
  });

  it('des objets sont fabriqués avec une histoire (fabricant, propriétaire)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    sim.config.economie.chanceFabricationParMois = 1;
    avancer(sim, 24);
    expect(sim.etat.objets.size).toBeGreaterThan(0);
    const objet = sim.etat.objets.values().next().value!;
    expect(objet.fabricantId).not.toBeNull();
    expect(objet.proprietaireId).toBe(objet.fabricantId);
    expect(objet.proprietaires.length).toBe(1);
  });

  it('le troc intra-groupe fait changer les objets de main avec historique', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    sim.config.economie.chanceTrocParMois = 1;
    sim.config.economie.seuilEcartValeurPourEchange = 1000;
    avancer(sim, 6);
    const a = Array.from(sim.etat.individus.values()).filter((i) => i.vivant)[0];
    const b = Array.from(sim.etat.individus.values()).filter((i) => i.vivant && i.id !== a.id)[1];
    const date = { an: 1, mois: 1 };
    const oa = new Objet(sim.etat.prochainIdObjet++, 'hache', a.id, date);
    const ob = new Objet(sim.etat.prochainIdObjet++, 'hache', b.id, date);
    sim.etat.objets.set(oa.id, oa);
    sim.etat.objets.set(ob.id, ob);
    a.objetIds.push(oa.id);
    b.objetIds.push(ob.id);
    a.positionX = 300;
    a.positionY = 300;
    b.positionX = 300.5;
    b.positionY = 300.5;
    avancer(sim, 3);
    expect(oa.proprietaires.length + ob.proprietaires.length).toBeGreaterThanOrEqual(3);
    expect(oa.proprietaireId).not.toBe(a.id);
  });

  it('la mort du dirigeant entraîne une succession et un événement de gouvernance', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    avancer(sim, 3);
    const groupe = sim.etat.groupes.values().next().value!;
    const ancien = groupe.dirigeantId!;
    const dirigeant = sim.etat.individus.get(ancien)!;
    mourir(sim.etat, sim.config, dirigeant, 'vieillesse');
    avancer(sim, 2);
    expect(groupe.dirigeantId).not.toBe(ancien);
    const nouveau = sim.etat.individus.get(groupe.dirigeantId!)!;
    expect(nouveau.vivant).toBe(true);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Changement de dirigeant')).toBe(true);
  });

  it('le territoire est recalculé depuis l\'activité réelle et exposé dans le digest', () => {
    const sim = nouvelleSim(42, { nbBandes: 2, tailleBande: 10 });
    avancer(sim, 6);
    for (const g of sim.etat.groupes.values()) {
      expect(g.territoire.length).toBeGreaterThan(0);
      expect(g.couleur).toBeGreaterThanOrEqual(0);
    }
    const digest = sim.digestTerritoires();
    expect(digest.length).toBe(2);
    expect(digest[0].tuiles.length).toBeGreaterThan(0);
  });

  it('reste déterministe avec bâtiments, objets et gouvernance', () => {
    const a = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    const b = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteIndividus()).toBe(b.empreinteIndividus());
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
    expect(a.etat.batiments.size).toBe(b.etat.batiments.size);
    expect(a.etat.objets.size).toBe(b.etat.objets.size);
    expect(a.etat.journal.taille).toBe(b.etat.journal.taille);
  });
});
