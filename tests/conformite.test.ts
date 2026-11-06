import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig, detecterClesDupliquees } from '../src/sim/config/parse';
import { Simulation } from '../src/sim/simulation';
import { TypeEvenement } from '../src/sim/journal/journal';
import { NOMS_FICHIERS_CONFIG } from '../src/sim/config/schema';
import { Matiere, Vegetation } from '../src/sim/types';
import { EntiteVehicule } from '../src/sim/transport/vehicule';
import { Objet } from '../src/sim/economie/objet';
import { mourir } from '../src/sim/entites/boucleIndividu';
import { Animal } from '../src/sim/faune/animal';
import { miseAJourMensuelleFaune } from '../src/sim/faune/systemeFaune';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function charger(tailleMonde = 400) {
  const textes = lireDossierConfig(path.join(racine, 'config'));
  const { config, empreintes } = parserConfig(textes);
  config.monde.tailleGrille = tailleMonde;
  return { config, empreintes };
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
  let securite = mois * 3000 + 2000;
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

describe('conformité V1 — config', () => {
  it('aucune clé dupliquée dans les fichiers de config, et le détecteur fonctionne', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    for (const nom of NOMS_FICHIERS_CONFIG) {
      expect(detecterClesDupliquees(textes[nom])).toEqual([]);
    }
    expect(detecterClesDupliquees('{"a": 1, "b": {"x": 1, "x": 2}}')).toEqual(['x']);
    expect(() => parserConfig({ ...textes, monde: textes.monde + '\n' })).not.toThrow();
    const avecDoublon = { ...textes, batiments: textes.batiments.replace('"types": {', '"types": { "marche": { "materiaux": {}, "dureeJours": 1 },') };
    expect(() => parserConfig(avecDoublon)).toThrow(/dupliquée/);
  });
});

describe('conformité V1 — transport & navigation', () => {
  it('un groupe côtier avec la construction navale fait ponton/port puis bateau', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    const monde = sim.etat.monde;
    let cote: { x: number; y: number } | null = null;
    for (let y = 0; y < monde.taille && !cote; y++) {
      for (let x = 0; x < monde.taille && !cote; x++) {
        if (monde.estEau(x, y)) continue;
        if (monde.voisins8(x, y).some(([nx, ny]) => monde.estEauSalee(nx, ny))) cote = { x, y };
      }
    }
    expect(cote).not.toBeNull();
    const groupe = sim.etat.groupes.values().next().value!;
    for (const ind of vivants(sim)) {
      ind.positionX = cote!.x;
      ind.positionY = cote!.y;
      ind.connaissances.add(idSavoir(sim, 'construction-navale'));
      ind.connaissances.add(idSavoir(sim, 'port'));
      ind.connaissances.add(idSavoir(sim, 'taille-pierre'));
      ind.connaissances.add(idSavoir(sim, 'feu'));
    }
    avancer(sim, 24);
    const typesBat = Array.from(sim.etat.batiments.values()).map((b) => b.type);
    expect(typesBat).toContain('ponton');
    const bateaux = Array.from(sim.etat.vehicules.values()).filter((v) => v.type === 'bateau' && !v.coule);
    expect(bateaux.length + (typesBat.includes('port') ? 1 : 0)).toBeGreaterThan(0);
  });

  it('un bateau permet de traverser l\'eau salée', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const monde = sim.etat.monde;
    expect(monde.estTraversable(0, 0, 1, 0, false)).toBe(false);
    expect(monde.estTraversable(0, 0, 1, 0, true)).toBe(true);
    const v = new EntiteVehicule(1, 'bateau', 5, 5, 20, { an: 1, mois: 1 }, 1, 0);
    sim.etat.vehicules.set(1, v);
    expect(sim.digestVehicules().length).toBe(3);
  });
});

describe('conformité V1 — migrations humaines', () => {
  it('schisme collectif : mécontentement -> nouveau groupe avec parent + journal', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 20 });
    sim.config.societe.chanceSchismeParMois = 1;
    sim.config.societe.seuilMecontentementGroupe = 100;
    sim.config.societe.seuilBonheurDepart = 0;
    const groupe = sim.etat.groupes.values().next().value!;
    for (const ind of vivants(sim)) ind.bonheur = 10;
    avancer(sim, 2);
    expect(sim.etat.groupes.size).toBeGreaterThanOrEqual(2);
    const enfants = Array.from(sim.etat.groupes.values()).filter((g) => g.parentId === groupe.id);
    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(sim.etat.journal.lire({ types: [TypeEvenement.Schisme] }).length).toBeGreaterThan(0);
  });

  it('départ individuel : un mécontent quitte sa bande (journal Départ)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 12 });
    sim.config.societe.chanceDepartIndividuelParMois = 1;
    sim.config.societe.seuilBonheurDepart = 100;
    const ind = vivants(sim)[0];
    const groupe = sim.etat.groupes.values().next().value!;
    ind.bonheur = 0;
    const membresAvant = groupe.membres.length;
    avancer(sim, 2);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Départ' && e.individusImpliques.includes(ind.id))).toBe(true);
    expect(groupe.membres.length).toBeLessThan(membresAvant);
  });
});

describe('conformité V1 — rumeurs avec distorsion', () => {
  it('une nouvelle se transmet de bouche en bouche et se déforme', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const [a, b] = vivants(sim);
    a.positionX = 300;
    a.positionY = 300;
    b.positionX = 300.5;
    b.positionY = 300.5;
    sim.config.recit.chanceTransmissionRumeurParMois = 1;
    a.ajouterMemoire(1, 'Un loup a tué un homme près du village', 90, { an: 1, mois: 1 }, 40);
    for (let t = 0; t < 400 && !b.memoire.some((m) => m.estRumeur); t++) {
      a.positionX = 300;
      a.positionY = 300;
      b.positionX = 300.5;
      b.positionY = 300.5;
      sim.definirVitesse(50);
      sim.tick(0.1);
    }
    const rumeur = b.memoire.find((m) => m.estRumeur);
    expect(rumeur).toBeDefined();
    expect(rumeur!.distorsion).toBeGreaterThanOrEqual(1);
    expect(rumeur!.souvenir).not.toBe('Un loup a tué un homme près du village');
  });
});

describe('conformité V1 — héritage et orphelins', () => {
  it('les objets du mort vont à son enfant, et l\'orphelin est pris en charge (journal)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    const groupe = sim.etat.groupes.values().next().value!;
    const parent = vivants(sim)[0];
    const objet = new Objet(sim.etat.prochainIdObjet++, 'hache', parent.id, { an: 1, mois: 1 });
    sim.etat.objets.set(objet.id, objet);
    parent.objetIds.push(objet.id);
    const bebe = vivants(sim).find((i) => i.id !== parent.id)!;
    bebe.ageAnnees = 5;
    bebe.mere = parent.id;
    bebe.pereRegistre = null;
    parent.enfants.push(bebe.id);
    mourir(sim.etat, sim.config, parent, 'famine');
    expect(objet.proprietaireId).toBe(bebe.id);
    expect(bebe.objetIds).toContain(objet.id);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Héritage')).toBe(true);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Orphelin' && e.individusImpliques.includes(bebe.id))).toBe(true);
    expect(bebe.relations.some((r) => r.type === 'famille' && r.vers === groupe.dirigeantId)).toBe(true);
  });
});

describe('conformité V1 — prédation sur humains', () => {
  it('un prédateur proche peut tuer un humain (cause prédation)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    sim.config.fauneFlore.chanceKillPredateurParMois = 1;
    const humain = vivants(sim)[0];
    const loup = new Animal(sim.etat.prochainIdAnimal++, 'loup', Math.round(humain.positionX) + 1, Math.round(humain.positionY));
    sim.etat.animaux.set(loup.id, loup);
    miseAJourMensuelleFaune(sim.etat, sim.config);
    expect(humain.vivant).toBe(false);
    expect(humain.causeMort).toBe('prédation');
  });
});

describe('conformité V1 — sentiers par piétinement', () => {
  it('le passage répété use la végétation en sentier visible', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 8 });
    const monde = sim.etat.monde;
    let tuile = -1;
    for (let i = 0; i < monde.taille * monde.taille; i++) {
      if (monde.vegetation[i] !== Vegetation.Aucun && !monde.estEau(Math.floor(i % monde.taille) % monde.taille, Math.floor(i / monde.taille))) {
        if (!monde.estEau(i % monde.taille, Math.floor(i / monde.taille))) {
          tuile = i;
          break;
        }
      }
    }
    expect(tuile).toBeGreaterThanOrEqual(0);
    monde.passage[tuile] = 999;
    avancer(sim, 1);
    expect(monde.vegetation[tuile]).toBe(Vegetation.Aucun);
  });
});

describe('conformité V1 — fermentation et échanges inter-groupes', () => {
  it('fermentation maîtrisée -> boisson fabriquée (bière/vin/hydromel)', () => {
    const sim = nouvelleSim(42, { nbBandes: 1, tailleBande: 10 });
    sim.config.economie.chanceFermentationParMois = 1;
    for (const ind of vivants(sim)) ind.connaissances.add(idSavoir(sim, 'fermentation'));
    avancer(sim, 3);
    const boissons = Array.from(sim.etat.objets.values()).filter((o) => ['biere', 'vin', 'hydromel'].includes(o.type));
    expect(boissons.length).toBeGreaterThan(0);
  });

  it('troc inter-groupes : nourriture contre monnaie entre groupes proches', () => {
    const sim = nouvelleSim(42, { nbBandes: 2, tailleBande: 10 });
    sim.config.economie.chanceTrocParMois = 1;
    const [g1, g2] = Array.from(sim.etat.groupes.values());
    for (const ind of vivants(sim)) {
      if (ind.groupeId === g1.id) {
        ind.positionX = 300;
        ind.positionY = 300;
      } else {
        ind.positionX = 305;
        ind.positionY = 305;
      }
    }
    g1.stocksCommuns.nourriture = 100;
    g1.stocksCommuns.monnaie = 50;
    g2.stocksCommuns.nourriture = 0;
    avancer(sim, 2);
    expect(g2.stocksCommuns.nourriture ?? 0).toBeGreaterThan(0);
    expect(sim.etat.journal.lire({}).some((e) => e.sujet === 'Échange inter-groupes')).toBe(true);
  });
});
