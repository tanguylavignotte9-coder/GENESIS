import { Saison, Vegetation } from '../types';
import type { Rng } from '../rng';
import type { ConfigComplete, ConfigFauneFlore } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Animal } from './animal';
import { construireEspeces, poidsTotalPourVegetation, type Espece } from './especes';
import { empreinteOctets } from '../hash';
import { mourir } from '../entites/boucleIndividu';
import { TypeEvenement } from '../journal/journal';

export function peuplerMonde(etat: EtatPartage, config: ConfigFauneFlore): void {
  const { monde, rng } = etat;
  const especes = construireEspeces(config);
  const t = monde.taille;
  const effectif = rng.entier(config.effectifInitialMin, config.effectifInitialMax);
  const tuilesTerre: number[] = [];
  const poids: number[] = [];
  let poidsTotal = 0;
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      if (monde.estEau(x, y)) continue;
      const p = poidsTotalPourVegetation(especes, monde.vegetation[monde.index(x, y)] as Vegetation);
      if (p <= 0) continue;
      tuilesTerre.push(monde.index(x, y));
      poids.push(p);
      poidsTotal += p;
    }
  }
  for (let i = 0; i < effectif; i++) {
    let r = rng.reel(0, poidsTotal);
    let choix = tuilesTerre[0];
    for (let k = 0; k < tuilesTerre.length; k++) {
      r -= poids[k];
      if (r <= 0) {
        choix = tuilesTerre[k];
        break;
      }
    }
    const x = choix % t;
    const y = Math.floor(choix / t);
    const espece = choisirEspece(especes, monde.vegetation[choix] as Vegetation, rng);
    const a = new Animal(etat.prochainIdAnimal++, espece.id, x + rng.reel(-0.4, 0.4), y + rng.reel(-0.4, 0.4));
    a.ageAnnees = rng.reel(0, espece.ageMaxAnnees * 0.8);
    etat.animaux.set(a.id, a);
  }
}

function choisirEspece(especes: Map<string, Espece>, vegetation: Vegetation, rng: Rng): Espece {
  let total = 0;
  const liste: Espece[] = [];
  const poids: number[] = [];
  for (const e of especes.values()) {
    const p = e.poidsParVegetation.get(vegetation) ?? 0;
    if (p > 0) {
      liste.push(e);
      poids.push(p);
      total += p;
    }
  }
  if (liste.length === 0) return especes.values().next().value as Espece;
  let r = rng.reel(0, total);
  for (let i = 0; i < liste.length; i++) {
    r -= poids[i];
    if (r <= 0) return liste[i];
  }
  return liste[liste.length - 1];
}

export function construireIndexSpatial(etat: EtatPartage): Map<number, number[]> {
  const index = new Map<number, number[]>();
  const t = etat.monde.taille;
  for (const a of etat.animaux.values()) {
    if (!a.vivant) continue;
    const cle = Math.round(a.positionY) * t + Math.round(a.positionX);
    const arr = index.get(cle);
    if (arr) arr.push(a.id);
    else index.set(cle, [a.id]);
  }
  return index;
}

export function animauxProches(etat: EtatPartage, index: Map<number, number[]>, x: number, y: number, rayon: number, filtre?: (a: Animal) => boolean): Animal[] {
  const t = etat.monde.taille;
  const res: Animal[] = [];
  const x0 = Math.max(0, Math.floor(x - rayon));
  const x1 = Math.min(t - 1, Math.ceil(x + rayon));
  const y0 = Math.max(0, Math.floor(y - rayon));
  const y1 = Math.min(t - 1, Math.ceil(y + rayon));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const arr = index.get(cy * t + cx);
      if (!arr) continue;
      for (const id of arr) {
        const a = etat.animaux.get(id);
        if (!a || !a.vivant) continue;
        if (Math.hypot(a.positionX - x, a.positionY - y) <= rayon && (!filtre || filtre(a))) res.push(a);
      }
    }
  }
  return res;
}

export function miseAJourMensuelleFaune(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.fauneFlore;
  const monde = etat.monde;
  const rng = etat.rng;
  const especes = construireEspeces(cfg);
  const t = monde.taille;
  const index = construireIndexSpatial(etat);

  for (let i = 0; i < monde.carcasseNourriture.length; i++) {
    if (monde.carcasseNourriture[i] > 0) {
      monde.carcasseNourriture[i] = Math.max(0, monde.carcasseNourriture[i] * (1 - cfg.decroissanceCarcasseParMois));
    }
  }

  const naissances: Animal[] = [];
  for (const a of etat.animaux.values()) {
    if (!a.vivant) continue;
    const espece = especes.get(a.especeId) ?? especes.values().next().value as Espece;
    a.ageAnnees += 1 / 12;
    a.faim = Math.min(100, a.faim + espece.faimParMois);

    const x = Math.round(a.positionX);
    const y = Math.round(a.positionY);
    if (!monde.dansLimites(x, y)) continue;
    const i = monde.index(x, y);
    const temp = monde.temperature[i];
    if (temp < cfg.seuilFroidFauneCelsius) {
      a.sante -= cfg.perteSanteFroidFauneParMois;
    } else if (a.faim < 50) {
      a.sante = Math.min(100, a.sante + 5);
    }

    if (a.faim >= 70) {
      if (espece.regime === 'herbivore') {
        const pris = Math.min(monde.biomasseVegetation[i], cfg.consommationVegetationParAnimalParMois);
        monde.biomasseVegetation[i] -= pris;
        a.faim = Math.max(0, a.faim - pris * 4);
      } else if (espece.regime === 'charognard') {
        const pris = Math.min(monde.carcasseNourriture[i], cfg.consommationVegetationParAnimalParMois);
        monde.carcasseNourriture[i] -= pris;
        a.faim = Math.max(0, a.faim - pris * 6);
      } else {
        const proie = animauxProches(etat, index, a.positionX, a.positionY, cfg.porteeChassePredateurTuiles, (p) => {
          const pe = especes.get(p.especeId);
          return pe !== undefined && pe.regime !== 'predateur';
        });
        if (proie.length > 0 && rng.chance(cfg.chanceKillPredateurParMois)) {
          const victime = rng.choix(proie);
          const ve = especes.get(victime.especeId) ?? espece;
          tuerAnimal(etat, victime, 'prédation');
          monde.carcasseNourriture[monde.index(Math.round(victime.positionX), Math.round(victime.positionY))] += ve.tailleCarcasse;
          a.faim = Math.max(0, a.faim - 50);
        }
      }
    }

    if (a.faim >= 100) {
      a.sante -= cfg.perteSanteFamineFauneParMois;
    }

    const saison = etat.calendrier.saisonPourDistanceEquateur(monde.distanceEquateur(y), y < t / 2);
    const froid = saison === Saison.Hiver && temp < cfg.seuilFroidFauneCelsius;
    const predateurProche = especes.get(a.especeId)?.regime !== 'predateur'
      ? animauxProches(etat, index, a.positionX, a.positionY, 4, (p) => {
          const pe = especes.get(p.especeId);
          return pe !== undefined && pe.regime === 'predateur';
        })
      : [];
    let dx = 0;
    let dy = 0;
    if (a.domestique) {
      dx = 0;
      dy = 0;
    } else if (predateurProche.length > 0) {
      const p = predateurProche[0];
      dx = Math.sign(a.positionX - p.positionX);
      dy = Math.sign(a.positionY - p.positionY);
    } else if (froid) {
      dy = y < t / 2 ? 1 : -1;
    } else if (espece.regime === 'herbivore' && a.faim > 40) {
      let meilleur = -1;
      for (const [nx, ny] of monde.voisins8(x, y)) {
        if (!monde.estTraversable(x, y, nx, ny, false)) continue;
        const b = monde.biomasseVegetation[monde.index(nx, ny)];
        if (b > meilleur) {
          meilleur = b;
          dx = nx - x;
          dy = ny - y;
        }
      }
      if (meilleur < monde.biomasseVegetation[i] * 0.8) {
        dx = 0;
        dy = 0;
      }
    } else if (espece.regime === 'predateur') {
      const proie = animauxProches(etat, index, a.positionX, a.positionY, cfg.porteeChassePredateurTuiles * 2, (p) => {
        const pe = especes.get(p.especeId);
        return pe !== undefined && pe.regime !== 'predateur';
      });
      if (proie.length > 0) {
        const cible = proie.reduce((m, p) => (Math.hypot(p.positionX - a.positionX, p.positionY - a.positionY) < Math.hypot(m.positionX - a.positionX, m.positionY - a.positionY) ? p : m));
        dx = Math.sign(cible.positionX - a.positionX);
        dy = Math.sign(cible.positionY - a.positionY);
      }
    }
    const pas = Math.max(1, Math.round(espece.vitesseTuilesParMois / 12));
    if (dx !== 0 || dy !== 0) {
      const nx = Math.round(a.positionX + dx * pas * rng.reel(0.3, 1));
      const ny = Math.round(a.positionY + dy * pas * rng.reel(0.3, 1));
      if (monde.dansLimites(nx, ny) && monde.estTraversable(x, y, nx, ny, false)) {
        a.positionX = nx;
        a.positionY = ny;
        const pi = monde.index(nx, ny);
        if (monde.passage[pi] < 65535) monde.passage[pi] += 2;
      }
    }

    if (!a.domestique && a.faim < 50 && a.sante > 60 && a.ageAnnees > 2 && a.ageAnnees < espece.ageMaxAnnees * 0.8 && rng.chance(espece.reproductionParMois * cfg.multiplicateurReproductionFaune)) {
      const bebe = new Animal(etat.prochainIdAnimal++, a.especeId, a.positionX, a.positionY);
      bebe.ageAnnees = 0;
      naissances.push(bebe);
    }

    if (a.sante <= 0) tuerAnimal(etat, a, a.faim >= 100 ? 'famine' : 'froid');
    else if (a.ageAnnees >= espece.ageMaxAnnees) tuerAnimal(etat, a, 'vieillesse');
  }
  for (const bebe of naissances) etat.animaux.set(bebe.id, bebe);

  elevageMensuel(etat, config);
  preditationSurHumains(etat, config);
}

function elevageMensuel(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.fauneFlore;
  const monde = etat.monde;
  const especes = construireEspeces(cfg);
  for (const groupe of etat.groupes.values()) {
    if (!groupe.aUnBatiment('enclos', etat.batiments)) continue;
    const enclos = Array.from(etat.batiments.values()).find((b) => b.groupeId === groupe.id && b.type === 'enclos' && !b.enConstruction);
    if (!enclos) continue;
    let troupeau = 0;
    for (const a of etat.animaux.values()) {
      if (!a.vivant || a.groupeId !== groupe.id || !a.domestique) continue;
      troupeau++;
      const distEnclos = Math.hypot(a.positionX - enclos.x, a.positionY - enclos.y);
      if (distEnclos > 3 && etat.rng.chance(0.5)) {
        a.positionX = enclos.x + etat.rng.reel(-1, 1);
        a.positionY = enclos.y + etat.rng.reel(-1, 1);
      }
      if (a.faim < 60 && a.sante > 60 && a.ageAnnees > 1 && etat.rng.chance((especes.get(a.especeId)?.reproductionParMois ?? 0.1) * cfg.multiplicateurReproductionEnclos * cfg.multiplicateurReproductionFaune)) {
        const bebe = new Animal(etat.prochainIdAnimal++, a.especeId, enclos.x, enclos.y);
        bebe.domestique = true;
        bebe.groupeId = groupe.id;
        bebe.ageAnnees = 0;
        etat.animaux.set(bebe.id, bebe);
        troupeau++;
      }
      groupe.stocksCommuns.lait = (groupe.stocksCommuns.lait ?? 0) + cfg.productionAnimalParMois;
      groupe.ajouterStock('nourriture', cfg.productionAnimalParMois, config.batiments.capaciteGrenierBase);
    }
    const proie = animauxProches(etat, construireIndexSpatial(etat), enclos.x, enclos.y, 5, (a) => {
      const e = especes.get(a.especeId);
      return e !== undefined && e.regime !== 'predateur' && !a.domestique;
    });
    for (const p of proie) {
      if (etat.rng.chance(cfg.chanceCaptureParMois)) {
        p.domestique = true;
        p.groupeId = groupe.id;
        p.positionX = enclos.x;
        p.positionY = enclos.y;
        etat.journal.ajouter({
          date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
          type: TypeEvenement.Autre,
          sujet: 'Capture',
          description: `${groupe.nom} capture un ${p.especeId} dans son enclos.`,
          individusImpliques: [],
          tuileX: enclos.x,
          tuileY: enclos.y,
        });
      }
    }
    void monde;
    void troupeau;
  }
}

function preditationSurHumains(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.fauneFlore;
  const especes = construireEspeces(cfg);
  const monde = etat.monde;
  const t = monde.taille;
  const indexHumains = new Map<number, number[]>();
  for (const ind of etat.individus.values()) {
    if (!ind.vivant) continue;
    const cle = Math.round(ind.positionY) * t + Math.round(ind.positionX);
    const arr = indexHumains.get(cle);
    if (arr) arr.push(ind.id);
    else indexHumains.set(cle, [ind.id]);
  }
  for (const a of etat.animaux.values()) {
    if (!a.vivant) continue;
    const e = especes.get(a.especeId);
    if (!e || e.regime !== 'predateur') continue;
    const x = Math.round(a.positionX);
    const y = Math.round(a.positionY);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!monde.dansLimites(nx, ny)) continue;
        const arr = indexHumains.get(ny * t + nx);
        if (!arr) continue;
        for (const hid of arr) {
          const h = etat.individus.get(hid);
          if (h && h.vivant && Math.hypot(h.positionX - a.positionX, h.positionY - a.positionY) <= 3 && etat.rng.chance(cfg.chanceKillPredateurParMois)) {
            mourir(etat, config, h, 'prédation');
          }
        }
      }
    }
  }
}

function tuerAnimal(etat: EtatPartage, a: Animal, cause: string): void {
  if (!a.vivant) return;
  a.vivant = false;
  a.causeMort = cause;
}

export function empreinteAnimaux(etat: EtatPartage): string {
  const arr = new Uint32Array(etat.animaux.size * 5);
  let i = 0;
  for (const a of etat.animaux.values()) {
    arr[i++] = a.id;
    arr[i++] = Math.round(a.positionX * 16) * 65536 + Math.round(a.positionY * 16);
    arr[i++] = a.especeId.length * 1000 + (a.especeId.charCodeAt(0) || 0);
    arr[i++] = Math.round(a.faim * 100) + (a.vivant ? 10000 : 0);
    arr[i++] = Math.round(a.sante * 100) + Math.round(a.ageAnnees * 100);
  }
  return empreinteOctets(arr);
}
