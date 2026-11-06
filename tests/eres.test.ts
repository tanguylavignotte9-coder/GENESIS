import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { TypeEvenement } from '../src/sim/journal/journal';
import { ARBRE, atomesInventables, ereDe, nomEre } from '../src/sim/savoir/arbreTechnologique';
import { connaissancesGroupe, ereGroupe } from '../src/sim/savoir/systemeSavoir';
import { EntiteBatiment } from '../src/sim/batiments/batiment';
import { NiveauGroupe, Matiere } from '../src/sim/types';
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

function idSavoir(sim: Simulation, nom: string): number {
  return sim.etat.savoir.tous().find((c) => c.nom === nom)!.id;
}

describe('J6 — arbre technologique et percées', () => {
  it('l\'arbre a des prérequis cohérents et des ères nommées', () => {
    const { config } = charger();
    const sim = nouvelleSim(1, { nbBandes: 1, tailleBande: 5 });
    expect(ARBRE.length).toBeGreaterThanOrEqual(20);
    for (const a of ARBRE) {
      for (const p of a.prerequis) {
        expect(ARBRE.some((x) => x.nom === p)).toBe(true);
      }
    }
    expect(nomEre(0)).toBe('Âge de pierre');
    expect(nomEre(7)).toBe('Ère numérique');
    void config;
    void sim;
  });

  it('un génie découvre un atome dont les prérequis sont connus, consigné au journal', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    sim.config.societe.chancePerceeParMois = 1;
    sim.config.societe.seuilIntelligenceGenie = 50;
    const genie = vivants(sim).sort((a, b) => b.intelligence - a.intelligence)[0];
    genie.intelligence = 100;
    const groupe = sim.etat.groupes.values().next().value!;
    const connus = connaissancesGroupe(sim.etat, groupe.id);
    const avant = connaissancesGroupe(sim.etat, groupe.id).size;
    avancer(sim, 2);
    expect(connaissancesGroupe(sim.etat, groupe.id).size).toBeGreaterThan(avant);
    const decouvertes = sim.etat.journal.lire({}).filter((e) => e.sujet === 'Découverte');
    expect(decouvertes.length).toBeGreaterThan(0);
    const nouveaux = Array.from(connaissancesGroupe(sim.etat, groupe.id)).filter((id) => !connus.has(id));
    for (const id of nouveaux) {
      const atome = sim.etat.savoir.get(id)!;
      expect(atome.prerequis.every((p) => [...connus, ...nouveaux].includes(p))).toBe(true);
    }
    void genie;
    void atomesInventables;
  });

  it('la transmission maître → élève propage un savoir', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    sim.config.societe.tauxTransmissionMaitreParMois = 1;
    const groupe = sim.etat.groupes.values().next().value!;
    const [maitre, eleve] = vivants(sim);
    const idTaille = idSavoir(sim, 'taille-pierre');
    maitre.connaissances.add(idTaille);
    maitre.positionX = 400;
    maitre.positionY = 400;
    eleve.positionX = 400.5;
    eleve.positionY = 400.5;
    eleve.ageAnnees = 20;
    avancer(sim, 2);
    expect(eleve.connaissances.has(idTaille)).toBe(true);
    void groupe;
  });

  it('l\'ère du groupe progresse avec les connaissances', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const groupe = sim.etat.groupes.values().next().value!;
    expect(ereGroupe(sim.etat, groupe.id).nom).toBe('Âge de pierre');
    for (const ind of vivants(sim)) {
      ind.connaissances.add(idSavoir(sim, 'taille-pierre'));
      ind.connaissances.add(idSavoir(sim, 'poterie'));
      ind.connaissances.add(idSavoir(sim, 'mine-cuivre'));
      ind.connaissances.add(idSavoir(sim, 'mine-etain'));
      ind.connaissances.add(idSavoir(sim, 'fonderie'));
      ind.connaissances.add(idSavoir(sim, 'bronze'));
    }
    expect(ereGroupe(sim.etat, groupe.id).ere).toBe(1);
    expect(ereGroupe(sim.etat, groupe.id).nom).toBe('Âge du bronze');
    expect(ereDe(connaissancesGroupe(sim.etat, groupe.id), sim.etat.savoir)).toBe(1);
  });
});

describe('J6 — extraction, monnaie, pollution, nations', () => {
  it('une mine épuise réellement son gisement et alimente le stock du groupe', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const monde = sim.etat.monde;
    let tileFer = -1;
    for (let i = 0; i < monde.taille * monde.taille; i++) {
      const elev = monde.elevation[i];
      if (monde.matiere[monde.indexNiveau(i % monde.taille, Math.floor(i / monde.taille), elev)] === Matiere.Fer) {
        tileFer = i;
        break;
      }
    }
    expect(tileFer).toBeGreaterThanOrEqual(0);
    const fx = tileFer % monde.taille;
    const fy = Math.floor(tileFer / monde.taille);
    const groupe = sim.etat.groupes.values().next().value!;
    const elev = monde.elevationTuile(fx, fy);
    const idx = monde.indexNiveau(fx, fy, elev);
    const qInit = monde.quantiteGisement[idx];
    const mine = new EntiteBatiment(sim.etat.prochainIdBatiment++, 'mine-fer', fx, fy, {}, { an: 1, mois: 1 }, groupe.id, 0);
    sim.etat.batiments.set(mine.id, mine);
    avancer(sim, 3);
    expect(monde.quantiteGisement[idx]).toBeLessThan(qInit);
    expect(groupe.stocksCommuns.fer ?? 0).toBeGreaterThan(0);
  });

  it('un gisement à 0 devient de la terre et est consigné', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const monde = sim.etat.monde;
    let tileFer = -1;
    for (let i = 0; i < monde.taille * monde.taille; i++) {
      const elev = monde.elevation[i];
      if (monde.matiere[monde.indexNiveau(i % monde.taille, Math.floor(i / monde.taille), elev)] === Matiere.Fer) {
        tileFer = i;
        break;
      }
    }
    const fx = tileFer % monde.taille;
    const fy = Math.floor(tileFer / monde.taille);
    const elev = monde.elevationTuile(fx, fy);
    const idx = monde.indexNiveau(fx, fy, elev);
    monde.quantiteGisement[idx] = 1;
    sim.config.societe.extractionParMoisParMine = 100;
    const groupe = sim.etat.groupes.values().next().value!;
    const mine = new EntiteBatiment(sim.etat.prochainIdBatiment++, 'mine-fer', fx, fy, {}, { an: 1, mois: 1 }, groupe.id, 0);
    sim.etat.batiments.set(mine.id, mine);
    avancer(sim, 2);
    expect(monde.quantiteGisement[idx]).toBe(0);
    expect(monde.matiere[idx]).toBe(Matiere.Terre);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Gisement épuisé')).toBe(true);
  });

  it('la monnaie émerge comme objets pièces quand la monnaie métallique est maîtrisée', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const groupe = sim.etat.groupes.values().next().value!;
    for (const ind of vivants(sim)) {
      ind.connaissances.add(idSavoir(sim, 'forge'));
      ind.connaissances.add(idSavoir(sim, 'mine-or'));
      ind.connaissances.add(idSavoir(sim, 'monnaie-metallique'));
    }
    sim.config.societe.chanceFrappeMonnaieParMois = 1;
    const forge = new EntiteBatiment(sim.etat.prochainIdBatiment++, 'forge', Math.round(vivants(sim)[0].positionX), Math.round(vivants(sim)[0].positionY), {}, { an: 1, mois: 1 }, groupe.id, 0);
    sim.etat.batiments.set(forge.id, forge);
    avancer(sim, 3);
    const pieces = Array.from(sim.etat.objets.values()).filter((o) => o.type === 'piece');
    expect(pieces.length).toBeGreaterThan(0);
    expect((groupe.stocksCommuns.monnaie ?? 0)).toBeGreaterThan(0);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Monnaie')).toBe(true);
  });

  it('la pollution industrielle se répand autour des bâtiments polluants et affecte la santé', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const monde = sim.etat.monde;
    const groupe = sim.etat.groupes.values().next().value!;
    sim.config.societe.pollutionParMoisParBatimentPolluant = 0.2;
    const ind = vivants(sim)[0];
    const fx = Math.round(ind.positionX);
    const fy = Math.round(ind.positionY);
    const forge = new EntiteBatiment(sim.etat.prochainIdBatiment++, 'forge', fx, fy, {}, { an: 1, mois: 1 }, groupe.id, 0);
    sim.etat.batiments.set(forge.id, forge);
    avancer(sim, 6);
    expect(monde.pollution[monde.index(fx, fy)]).toBeGreaterThan(sim.config.societe.seuilPollutionSante);
    const santeAvant = ind.sante.valeur;
    const i = monde.index(fx, fy);
    monde.pollution[i] = 0.9;
    ind.positionX = fx;
    ind.positionY = fy;
    ind.besoins.faim = 0;
    ind.besoins.soif = 0;
    ind.besoins.sommeil = 0;
    ind.besoins.stress = 0;
    ind.besoins.securite = 0;
    const jours = (sim.config.temps.pasDeTempsSecondesReel / sim.config.temps.secondesParMoisAX1) * sim.config.temps.joursParMois * 50;
    tickIndividu(sim.etat, sim.config, ind, jours, indexAnimauxPourTick(sim.etat));
    expect(ind.sante.valeur).toBeLessThan(santeAvant);
  });

  it('un village avec un grand territoire devient une nation', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    sim.config.societe.seuilTerritoireNationTuiles = 5;
    const groupe = sim.etat.groupes.values().next().value!;
    groupe.niveau = NiveauGroupe.Village;
    groupe.territoire = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i }));
    avancer(sim, 2);
    expect(groupe.niveau).toBe(NiveauGroupe.Nation);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Nation')).toBe(true);
  });

  it('reste déterministe avec savoirs, mines, monnaie et pollution', () => {
    const a = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    const b = nouvelleSim(77, { nbBandes: 2, tailleBande: 10 });
    avancer(a, 12);
    avancer(b, 12);
    expect(a.empreinteIndividus()).toBe(b.empreinteIndividus());
    expect(a.empreinteMonde()).toBe(b.empreinteMonde());
    expect(a.etat.batiments.size).toBe(b.etat.batiments.size);
    expect(a.etat.savoir.tous().length).toBe(b.etat.savoir.tous().length);
    expect(a.etat.journal.taille).toBe(b.etat.journal.taille);
  });
});
