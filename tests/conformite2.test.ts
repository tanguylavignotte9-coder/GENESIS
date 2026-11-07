import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { EntiteBatiment } from '../src/sim/batiments/batiment';
import { EntiteVehicule } from '../src/sim/transport/vehicule';
import { Animal } from '../src/sim/faune/animal';
import { miseAJourMensuelleFaune } from '../src/sim/faune/systemeFaune';
import { naufrageMensuel } from '../src/sim/transport/systemeTransport';
import { gouvernanceMensuelle } from '../src/sim/groupes/gouvernance';
import { tickIndividu, indexAnimauxPourTick } from '../src/sim/entites/boucleIndividu';
import { Matiere } from '../src/sim/types';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function charger(tailleMonde = 400) {
  const { config } = parserConfig(lireDossierConfig(path.join(racine, 'config')));
  config.monde.tailleGrille = tailleMonde;
  return config;
}

function nouvelleSim(seed: number, options?: { nbBandes?: number; tailleBande?: number }): Simulation {
  const sim = new Simulation(charger(), seed);
  sim.initialiser(options);
  return sim;
}

function avancer(sim: Simulation, mois: number): void {
  const c = sim.config;
  sim.definirVitesse(Math.max(...c.temps.vitessesDisponibles));
  const cible = sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois + mois;
  let securite = mois * 3000 + 2000;
  while (sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois < cible && securite-- > 0) {
    sim.tick(c.temps.pasDeTempsSecondesReel);
  }
}

describe('conformité V1 round 2 — élevage fonctionnel', () => {
  it('l\'enclos est construit (savoir élevage de départ) et capture des animaux -> troupeau -> produits', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    sim.config.fauneFlore.chanceCaptureParMois = 1;
    avancer(sim, 10);
    const enclos = Array.from(sim.etat.batiments.values()).find((b) => b.type === 'enclos' && !b.enConstruction);
    expect(enclos).toBeDefined();
    const proie = new Animal(sim.etat.prochainIdAnimal++, 'cerf', enclos!.x + 1, enclos!.y);
    sim.etat.animaux.set(proie.id, proie);
    miseAJourMensuelleFaune(sim.etat, sim.config);
    expect(proie.domestique).toBe(true);
    expect(proie.groupeId).toBe(enclos!.groupeId);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Capture')).toBe(true);
    const groupe = sim.etat.groupes.get(enclos!.groupeId!)!;
    expect((groupe.stocksCommuns.lait ?? 0)).toBeGreaterThan(0);
  });

  it('les animaux domestiqués se reproduisent en enclos', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const groupe = sim.etat.groupes.values().next().value!;
    const enclos = new EntiteBatiment(sim.etat.prochainIdBatiment++, 'enclos', 200, 200, {}, { an: 1, mois: 1 }, groupe.id, 0);
    sim.etat.batiments.set(enclos.id, enclos);
    const vache = new Animal(sim.etat.prochainIdAnimal++, 'bison', 200, 200);
    vache.domestique = true;
    vache.groupeId = groupe.id;
    vache.ageAnnees = 5;
    vache.faim = 10;
    vache.sante = 100;
    sim.etat.animaux.set(vache.id, vache);
    const avant = sim.etat.animaux.size;
    sim.config.fauneFlore.multiplicateurReproductionEnclos = 1000;
    miseAJourMensuelleFaune(sim.etat, sim.config);
    const bebes = Array.from(sim.etat.animaux.values()).filter((a) => a.domestique && a.id !== vache.id);
    expect(sim.etat.animaux.size).toBeGreaterThan(avant);
    expect(bebes.length).toBeGreaterThan(0);
    expect(bebes[0].groupeId).toBe(groupe.id);
  });
});

describe('conformité V1 round 2 — prélèvements du dirigeant', () => {
  it('la politique prelevements prélève sur les stocks communs vers la réserve, avec journal', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const groupe = sim.etat.groupes.values().next().value!;
    groupe.politiques = { prelevements: true };
    groupe.stocksCommuns.nourriture = 100;
    sim.config.societe.prelevementPourcentReserve = 0.5;
    sim.config.societe.seuilJournalPrelevement = 10;
    gouvernanceMensuelle(sim.etat, sim.config);
    expect(groupe.stocksCommuns.nourriture).toBe(50);
    expect(groupe.stocksCommuns.reserve).toBe(50);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Prélèvement')).toBe(true);
  });
});

describe('conformité V1 round 2 — noyade au gué', () => {
  it('traverser une rivière à gué peut tuer par noyade', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const monde = sim.etat.monde;
    sim.config.individus.chanceNoyadeParTraverseeGue = 1;
    for (const a of sim.etat.animaux.values()) a.vivant = false;
    let bx = -1;
    let by = -1;
    let rx = -1;
    let ry = -1;
    outer: for (let y = 2; y < monde.taille - 2; y++) {
      for (let x = 2; x < monde.taille - 2; x++) {
        if (monde.estEau(x, y)) continue;
        for (const [nx, ny] of monde.voisins8(x, y)) {
          if (monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)) === Matiere.EauDouce) {
            bx = x;
            by = y;
            rx = nx;
            ry = ny;
            break outer;
          }
        }
      }
    }
    expect(bx).toBeGreaterThanOrEqual(0);
    expect(monde.estTraversable(bx, by, rx, ry, false)).toBe(true);
    const ind = Array.from(sim.etat.individus.values()).find((i) => i.vivant)!;
    ind.positionX = bx;
    ind.positionY = by;
    ind.besoins.faim = 0;
    ind.besoins.soif = 0;
    ind.endurance = 0;
    const groupe = sim.etat.groupes.get(ind.groupeId!)!;
    groupe.migrationCible = { x: rx + (rx - bx) * 3, y: ry + (ry - by) * 3 };
    const index = indexAnimauxPourTick(sim.etat);
    for (let t = 0; t < 3000 && ind.vivant; t++) {
      ind.besoins.faim = 0;
      tickIndividu(sim.etat, sim.config, ind, 0.5, index);
    }
    expect(ind.vivant).toBe(false);
    expect(ind.causeMort).toBe('noyade');
  });
});

describe('conformité V1 round 2 — bug affichage naufrage', () => {
  it('le journal Naufrage affiche le bon nombre de passagers', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const monde = sim.etat.monde;
    let mer = -1;
    for (let i = 0; i < monde.taille * monde.taille; i++) {
      if (monde.matiereNiveau(i % monde.taille, Math.floor(i / monde.taille), monde.elevation[i]) === Matiere.EauSalee) {
        mer = i;
        break;
      }
    }
    const mx = mer % monde.taille;
    const my = Math.floor(mer / monde.taille);
    const groupe = sim.etat.groupes.values().next().value!;
    const v = new EntiteVehicule(sim.etat.prochainIdVehicule++, 'bateau', mx, my, 20, { an: 1, mois: 1 }, groupe.id, 0);
    const passagers = Array.from(sim.etat.individus.values()).filter((i) => i.vivant).slice(0, 2);
    v.passagers = passagers.map((p) => p.id);
    sim.etat.vehicules.set(v.id, v);
    sim.config.societe.chanceNaufrageParMois = 1;
    naufrageMensuel(sim.etat, sim.config);
    const evt = sim.etat.journal.lire({}).find((e) => e.sujet === 'Naufrage');
    expect(evt).toBeDefined();
    expect(evt!.description).toContain('2 passager');
    for (const p of passagers) expect(p.vivant).toBe(false);
  });
});
