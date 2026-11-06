import { Matiere, Vegetation } from '../types';
import type { Rng } from '../rng';
import type { ConfigMonde } from '../config/schema';
import type { Monde } from './monde';
import { vegetationPourClimat } from './vegetation';
import { temperatureBaseCelsius, humiditeBasePourcent } from './climat';

function creerBruit(rng: Rng, tailleBruit: number): Float32Array {
  const g = new Float32Array(tailleBruit * tailleBruit);
  for (let i = 0; i < g.length; i++) g[i] = rng.suivant();
  return g;
}

function bruit2(g: Float32Array, tailleBruit: number, x: number, y: number): number {
  const fx = x * (tailleBruit - 1);
  const xi = Math.floor(fx);
  const yi = Math.floor(y * (tailleBruit - 1));
  const tx = fx - xi;
  const ty = y * (tailleBruit - 1) - yi;
  const x1 = Math.min(xi + 1, tailleBruit - 1);
  const y1 = Math.min(yi + 1, tailleBruit - 1);
  const a = g[yi * tailleBruit + xi];
  const b = g[yi * tailleBruit + x1];
  const c = g[y1 * tailleBruit + xi];
  const d = g[y1 * tailleBruit + x1];
  const haut = a + (b - a) * tx;
  const bas = c + (d - c) * tx;
  return haut + (bas - haut) * ty;
}

function fbm(g: Float32Array, tailleBruit: number, x: number, y: number): number {
  return (
    bruit2(g, tailleBruit, x, y) * 0.65 +
    bruit2(g, tailleBruit, (x * 2.7 + 0.37) % 1, (y * 2.7 + 0.11) % 1) * 0.35
  );
}

export function genererMonde(monde: Monde, config: ConfigMonde, rng: Rng): void {
  const t = monde.taille;
  const bruit = creerBruit(rng, 65);
  const bruit2g = creerBruit(rng, 33);
  const bord = config.epaisseurBordEauSalee;

  const nbContinents = rng.entier(config.nbContinentsMin, config.nbContinentsMax);
  const continents: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < nbContinents; i++) {
    continents.push({
      x: rng.entier(Math.floor(t * 0.15), Math.floor(t * 0.85)),
      y: rng.entier(Math.floor(t * 0.15), Math.floor(t * 0.85)),
      r: rng.entier(Math.floor(t * 0.06), Math.floor(t * 0.17)),
    });
  }
  const nbIles = rng.entier(config.nbIlesMin, config.nbIlesMax);
  const iles: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < nbIles; i++) {
    iles.push({
      x: rng.entier(bord + 5, t - bord - 6),
      y: rng.entier(bord + 5, t - bord - 6),
      r: rng.entier(5, 26),
    });
  }

  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = monde.index(x, y);
      monde.poserNiveau(x, y, 0, Matiere.Pierre);
      if (monde.estBord(x, y, bord)) {
        monde.poserNiveau(x, y, 1, Matiere.EauSalee);
        continue;
      }
      let f = 0;
      for (const c of continents) {
        const d = Math.hypot(x - c.x, y - c.y);
        const v = Math.max(0, 1 - d / c.r) * (0.65 + 0.5 * fbm(bruit, 65, x / t, y / t));
        if (v > f) f = v;
      }
      for (const ile of iles) {
        const d = Math.hypot(x - ile.x, y - ile.y);
        const v = Math.max(0, 1 - d / ile.r) * (0.7 + 0.4 * fbm(bruit, 65, x / t, y / t));
        if (v > f) f = v;
      }
      if (f > 0.3) {
        const detail = bruit2(bruit, 65, ((x / t) * 6 + 0.37) % 1, ((y / t) * 6 + 0.11) % 1);
        const elev = Math.max(1, Math.min(config.niveauxElevationMax - 1, Math.round(f * 3.4 + (detail - 0.5) * 2.4)));
        const matiereSurface = f < 0.42 ? Matiere.Sable : Matiere.Terre;
        for (let n = 1; n < elev; n++) monde.poserNiveau(x, y, n, Matiere.Terre);
        monde.poserNiveau(x, y, elev, matiereSurface);
      } else {
        monde.poserNiveau(x, y, 1, Matiere.EauSalee);
      }
    }
  }

  const sources: Array<[number, number]> = [];
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const elev = monde.elevationTuile(x, y);
      if (elev >= config.elevationMinSourceRiviere && monde.matiereNiveau(x, y, elev) !== Matiere.EauDouce) {
        if (rng.chance(0.06)) sources.push([x, y]);
      }
    }
  }
  const maxSources = nbContinents * config.nbSourcesRivieresParContinentMax + config.nbSourcesRivieresParContinentMin;
  while (sources.length > maxSources) sources.splice(rng.entier(0, sources.length - 1), 1);
  for (const [sx, sy] of sources) {
    let cx = sx;
    let cy = sy;
    const visites = new Set<number>();
    for (let pas = 0; pas < 3000; pas++) {
      const ci = monde.index(cx, cy);
      if (visites.has(ci)) break;
      visites.add(ci);
      const elev = monde.elevationTuile(cx, cy);
      const m = monde.matiereNiveau(cx, cy, elev);
      if (m === Matiere.EauSalee) break;
      if (m !== Matiere.EauDouce) {
        monde.matiere[monde.indexNiveau(cx, cy, elev)] = Matiere.EauDouce;
        monde.vegetation[ci] = Vegetation.Aucun;
        monde.humidite[ci] = Math.min(100, monde.humidite[ci] + 25);
      }
      let meilleur: [number, number] | null = null;
      let meilleureElev = monde.estEauSalee(cx, cy) ? -1 : elev;
      for (const [nx, ny] of monde.voisins8(cx, cy)) {
        const ne = monde.elevationTuile(nx, ny);
        const nm = monde.matiereNiveau(nx, ny, ne);
        if (nm === Matiere.EauSalee) {
          meilleur = [nx, ny];
          meilleureElev = -1;
          break;
        }
        if (nm !== Matiere.EauDouce && ne < meilleureElev) {
          meilleureElev = ne;
          meilleur = [nx, ny];
        }
      }
      if (!meilleur) {
        if (monde.matiereNiveau(cx, cy, elev) !== Matiere.EauSalee) {
          monde.matiere[monde.indexNiveau(cx, cy, elev)] = Matiere.EauDouce;
        }
        break;
      }
      cx = meilleur[0];
      cy = meilleur[1];
    }
  }

  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = monde.index(x, y);
      const distEq = monde.distanceEquateur(y);
      const elev = monde.elevation[i];
      const estTerre = !monde.estEau(x, y);
      let presEau = false;
      if (estTerre) {
        for (const [nx, ny] of monde.voisins8(x, y)) {
          if (monde.estEau(nx, ny)) {
            presEau = true;
            break;
          }
        }
      }
      const temp = temperatureBaseCelsius(config, distEq) - Math.max(0, elev - 1) * config.refroidissementParNiveauCelsius;
      monde.temperature[i] = temp;
      monde.humidite[i] = humiditeBasePourcent(config, distEq, fbm(bruit2g, 33, x / t, y / t), presEau);
      if (estTerre) {
        monde.vegetation[i] = vegetationPourClimat(temp, monde.humidite[i]);
        monde.biomasseVegetation[i] = 40 + rng.reel(0, 40);
      }
    }
  }

  for (const [nom, g] of Object.entries(config.gisements)) {
    const matiere = matiereGisement(nom);
    const nb = rng.entier(g.nbMin, g.nbMax);
    let places = 0;
    let tentatives = 0;
    while (places < nb && tentatives < nb * 50) {
      tentatives++;
      const x = rng.entier(bord + 1, t - bord - 2);
      const y = rng.entier(bord + 1, t - bord - 2);
      const elev = monde.elevationTuile(x, y);
      const m = monde.matiereNiveau(x, y, elev);
      if (elev >= 1 && (m === Matiere.Terre || m === Matiere.Sable || m === Matiere.Pierre)) {
        monde.matiere[monde.indexNiveau(x, y, elev)] = matiere;
        monde.quantiteGisement[monde.indexNiveau(x, y, elev)] = rng.reel(g.quantiteMin, g.quantiteMax);
        monde.vegetation[monde.index(x, y)] = Vegetation.Aucun;
        places++;
      }
    }
  }
}

export function matiereGisement(nom: string): Matiere {
  switch (nom) {
    case 'charbon': return Matiere.Charbon;
    case 'gaz': return Matiere.Gaz;
    case 'uranium': return Matiere.Uranium;
    case 'petrole': return Matiere.Petrole;
    case 'fer': return Matiere.Fer;
    case 'cuivre': return Matiere.Cuivre;
    case 'etain': return Matiere.Etain;
    case 'or': return Matiere.Or;
    case 'argent': return Matiere.Argent;
    case 'sel': return Matiere.Sel;
    default: return Matiere.Pierre;
  }
}
