import { Matiere, Vegetation } from '../types';
import type { Rng } from '../rng';
import type { ConfigMonde } from '../config/schema';
import type { Monde } from './monde';
import { vegetationPourClimatAvecEcotone } from './vegetation';
import { temperatureBaseCelsius, humiditeBasePourcent } from './climat';

const TAILLE_GRILLE_BRUIT_MAX = 1024;

// Bruit de valeur multi-octaves (fBm), entièrement semé par le Rng de la sim.
// Chaque octave a sa propre grille dimensionnée pour couvrir toute la carte sans
// bouclage (apériodique à l'échelle de la carte) ; les bords sont clampés.
class ChampBruit {
  private readonly grilles: Float32Array[];
  private readonly tailles: number[];
  private readonly freqs: number[];
  private readonly gain: number;

  constructor(rng: Rng, celluleBase: number, octaves: number, lacunarite: number, gain: number, porteeTuiles: number) {
    this.gain = gain;
    this.grilles = [];
    this.tailles = [];
    this.freqs = [];
    let freq = 1 / celluleBase;
    for (let k = 0; k < octaves; k++) {
      const taille = Math.max(2, Math.min(TAILLE_GRILLE_BRUIT_MAX, Math.floor(porteeTuiles * freq) + 2));
      const g = new Float32Array(taille * taille);
      for (let i = 0; i < g.length; i++) g[i] = rng.suivant();
      this.grilles.push(g);
      this.tailles.push(taille);
      this.freqs.push(freq);
      freq *= lacunarite;
    }
  }

  private echantillon(k: number, u: number, v: number): number {
    const taille = this.tailles[k];
    const g = this.grilles[k];
    let xi = Math.floor(u);
    let yi = Math.floor(v);
    if (xi < 0) xi = 0; else if (xi > taille - 2) xi = taille - 2;
    if (yi < 0) yi = 0; else if (yi > taille - 2) yi = taille - 2;
    let fu = u - Math.floor(u);
    let fv = v - Math.floor(v);
    if (fu < 0) fu = 0; else if (fu > 1) fu = 1;
    if (fv < 0) fv = 0; else if (fv > 1) fv = 1;
    const x1 = xi + 1;
    const y1 = yi + 1;
    const tx = fu * fu * (3 - 2 * fu);
    const ty = fv * fv * (3 - 2 * fv);
    const a = g[yi * taille + xi];
    const b = g[yi * taille + x1];
    const c = g[y1 * taille + xi];
    const d = g[y1 * taille + x1];
    const haut = a + (b - a) * tx;
    const bas = c + (d - c) * tx;
    return haut + (bas - haut) * ty;
  }

  fbm(x: number, y: number): number {
    let somme = 0;
    let amp = 1;
    let total = 0;
    for (let k = 0; k < this.grilles.length; k++) {
      somme += amp * this.echantillon(k, x * this.freqs[k], y * this.freqs[k]);
      total += amp;
      amp *= this.gain;
    }
    return somme / total;
  }

  fbmRidged(x: number, y: number): number {
    let somme = 0;
    let amp = 1;
    let total = 0;
    for (let k = 0; k < this.grilles.length; k++) {
      const v = this.echantillon(k, x * this.freqs[k], y * this.freqs[k]);
      const r = 1 - Math.abs(2 * v - 1);
      somme += amp * r * r;
      total += amp;
      amp *= this.gain;
    }
    return somme / total;
  }
}

// Distance de chamfer (8 voisins, 2 passes) depuis les tuiles sources (valeur 0).
function distanceChamfer(estSource: Uint8Array, n: number, t: number): Float32Array {
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = estSource[i] ? 0 : 1e9;
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) m = Math.min(m, dist[i - t] + 1);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - t - 1] + 1);
      if (x < t - 1 && y > 0) m = Math.min(m, dist[i - t + 1] + 1);
      dist[i] = m;
    }
  }
  for (let y = t - 1; y >= 0; y--) {
    for (let x = t - 1; x >= 0; x--) {
      const i = y * t + x;
      if (dist[i] === 0) continue;
      let m = dist[i];
      if (x < t - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < t - 1) m = Math.min(m, dist[i + t] + 1);
      if (x < t - 1 && y < t - 1) m = Math.min(m, dist[i + t + 1] + 1);
      if (x > 0 && y < t - 1) m = Math.min(m, dist[i + t - 1] + 1);
      dist[i] = m;
    }
  }
  return dist;
}

type PoserEauDouce = (x: number, y: number) => void;

// Dépression fermée atteinte par une rivière : la cuvette d'élévation e devient un lac
// (au moins tailleMinLacTuiles) ; renvoie l'éventuel émissaire (tuile de bord plus basse), sinon null.
function creerLac(
  monde: Monde,
  config: ConfigMonde,
  estTerre: Uint8Array,
  elev: Uint8Array,
  poserEauDouce: PoserEauDouce,
  cx: number,
  cy: number,
  e: number,
): [number, number] | null {
  const t = monde.taille;
  const comp: number[] = [];
  const dansComp = new Set<number>();
  const pile = [monde.index(cx, cy)];
  dansComp.add(pile[0]);
  while (pile.length > 0) {
    const i = pile.pop()!;
    comp.push(i);
    const x = i % t;
    const y = Math.floor(i / t);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
        const ni = ny * t + nx;
        if (dansComp.has(ni) || !estTerre[ni] || elev[ni] !== e) continue;
        dansComp.add(ni);
        pile.push(ni);
      }
    }
  }
  // Bord de la cuvette : mer (exutoire) ou tuiles terrestres de bordure.
  let toucheMer = false;
  let emissaire: [number, number] | null = null;
  let emissaireElev = Infinity;
  const bordureTerre: number[] = [];
  for (const i of comp) {
    const x = i % t;
    const y = Math.floor(i / t);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
        const ni = ny * t + nx;
        if (dansComp.has(ni)) continue;
        if (!estTerre[ni]) {
          if (monde.estEauSalee(nx, ny)) toucheMer = true;
          continue;
        }
        bordureTerre.push(ni);
        if (elev[ni] < e && elev[ni] < emissaireElev) {
          emissaireElev = elev[ni];
          emissaire = [nx, ny];
        }
      }
    }
  }
  // Taille minimale du lac : compléter avec les tuiles de bordure les plus basses.
  if (comp.length < config.tailleMinLacTuiles) {
    const vus = new Set(comp);
    const ajouts: number[] = [];
    for (const ni of bordureTerre) if (!vus.has(ni)) { vus.add(ni); ajouts.push(ni); }
    ajouts.sort((a, b) => (elev[a] - elev[b]) || (a - b));
    for (const ni of ajouts) {
      if (comp.length >= config.tailleMinLacTuiles) break;
      comp.push(ni);
      dansComp.add(ni);
    }
  }
  // Borne supérieure : on ne noie que les premières tuiles de la cuvette (au plus près du blocage).
  const nbLac = Math.min(comp.length, config.tailleMaxLacTuiles);
  for (let k = 0; k < nbLac; k++) {
    const i = comp[k];
    poserEauDouce(i % t, Math.floor(i / t));
  }
  if (toucheMer) return null;
  return emissaire;
}

export function genererMonde(monde: Monde, config: ConfigMonde, rng: Rng): void {
  const t = monde.taille;
  const n = t * t;
  const bord = config.epaisseurBordEauSalee;
  const niveauxMax = config.niveauxElevationMax;

  const celluleContinentale = Math.max(4, (config.longueurOndeContinentaleFraction * t) / 8);
  const celluleCretes = Math.max(2, (config.longueurOndeCretesFraction * t) / 6);
  const celluleAngle = Math.max(2, (config.longueurOndeCretesFraction * t) / 3);
  const celluleHumidite = Math.max(2, config.longueurOndeHumiditeGrandeTuiles / 8);
  const celluleEcotone = Math.max(1, config.longueurOndeEcotoneTuiles / 4);

  const champContinental = new ChampBruit(rng, celluleContinentale, config.octavesBruitRelief, config.lacunariteBruitRelief, config.gainBruitRelief, t);
  const champWarpA = new ChampBruit(rng, celluleContinentale, 2, 2, 0.5, t);
  const champWarpB = new ChampBruit(rng, celluleContinentale, 2, 2, 0.5, t);
  const champAngle = new ChampBruit(rng, celluleAngle, 2, 2, 0.5, t);
  const champCretes = new ChampBruit(rng, celluleCretes, 4, config.lacunariteBruitRelief, config.gainBruitRelief, t);
  const champHumidite = new ChampBruit(rng, celluleHumidite, config.octavesBruitHumidite, 2, config.gainBruitHumidite, t);
  const champEcotoneT = new ChampBruit(rng, celluleEcotone, 2, 2, 0.5, t);
  const champEcotoneH = new ChampBruit(rng, celluleEcotone, 2, 2, 0.5, t);

  // 1. Champ continental avec domain warping et marge d'océan périphérique (bords toujours sous la mer).
  const warpTuiles = config.intensiteDomainWarpingFraction * t;
  const margeTuiles = Math.max(1, config.largeurMargeOceanPeripheriqueFraction * t);
  const c = new Float32Array(n);
  const estInterieur = new Uint8Array(n);
  let nbInterieur = 0;
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      const inter = !monde.estBord(x, y, bord);
      estInterieur[i] = inter ? 1 : 0;
      if (inter) nbInterieur++;
      const wx = (champWarpA.fbm(x, y) - 0.5) * 2 * warpTuiles;
      const wy = (champWarpB.fbm(x, y) - 0.5) * 2 * warpTuiles;
      const v = champContinental.fbm(x + wx, y + wy);
      const dx = Math.min(x, t - 1 - x);
      const dy = Math.min(y, t - 1 - y);
      const f = Math.min(1, Math.min(dx, dy) / margeTuiles);
      const falloff = f * f * (3 - 2 * f);
      c[i] = v * falloff;
    }
  }

  // 2. Seuil de niveau de la mer calé par quantile pour viser fractionTerreCible sur l'intérieur.
  const BINS = 2048;
  const hist = new Int32Array(BINS);
  for (let i = 0; i < n; i++) {
    if (estInterieur[i]) hist[Math.min(BINS - 1, Math.floor(c[i] * BINS))]++;
  }
  const cible = config.fractionTerreCible * nbInterieur;
  let acc = 0;
  let seuilMer = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    acc += hist[b];
    if (acc >= cible) {
      seuilMer = b / BINS;
      break;
    }
  }
  let cMax = 0;
  for (let i = 0; i < n; i++) if (c[i] > cMax) cMax = c[i];

  // 3. Relief fractal : masque continental + crêtes orientées (chaînes, pas dômes), quantifié en niveaux.
  const estTerre = new Uint8Array(n);
  const relief = new Float32Array(n);
  let reliefMax = 0;
  let nbTerre = 0;
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (!estInterieur[i] || c[i] <= seuilMer) continue;
      estTerre[i] = 1;
      nbTerre++;
      const h = (c[i] - seuilMer) / Math.max(1e-6, cMax - seuilMer);
      const a = champAngle.fbm(x, y) * Math.PI;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const crete = champCretes.fbmRidged(x * ca - y * sa, x * sa + y * ca);
      const r = h * (1 + crete * config.poidsCretesMontagne);
      relief[i] = r;
      if (r > reliefMax) reliefMax = r;
    }
  }
  const elev = new Uint8Array(n);
  const seuils = config.seuilsNiveauxTerre;
  for (let i = 0; i < n; i++) {
    if (!estTerre[i]) continue;
    const rn = relief[i] / Math.max(1e-6, reliefMax);
    let e = 1;
    for (let k = 0; k < seuils.length && k < niveauxMax - 2; k++) {
      if (rn > seuils[k]) e++;
    }
    elev[i] = Math.min(niveauxMax - 1, e);
  }

  // 4. Océan à étages : profondeur = éloignement de la terre (plateau, pente, abysse).
  const distTerre = distanceChamfer(estTerre, n, t);
  const profMax = Math.min(config.profondeurMaxOceanNiveaux, niveauxMax - 1);
  for (let i = 0; i < n; i++) {
    if (estTerre[i]) continue;
    const d = distTerre[i];
    let e = 1;
    if (d > config.seuilPlateauContinentalTuiles) e++;
    if (d > config.seuilPenteContinentaleTuiles) e++;
    if (d > config.seuilAbysseTuiles) e++;
    elev[i] = Math.min(profMax, e);
  }
  // Profondeur 1-Lipschitzienne (8 voisins) : la mer reste franchissable par paliers d'un niveau.
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (estTerre[i]) continue;
      let m = elev[i];
      if (x > 0) m = Math.min(m, elev[i - 1] + 1);
      if (y > 0) m = Math.min(m, elev[i - t] + 1);
      if (x > 0 && y > 0) m = Math.min(m, elev[i - t - 1] + 1);
      if (x < t - 1 && y > 0) m = Math.min(m, elev[i - t + 1] + 1);
      elev[i] = Math.max(1, m);
    }
  }
  for (let y = t - 1; y >= 0; y--) {
    for (let x = t - 1; x >= 0; x--) {
      const i = y * t + x;
      if (estTerre[i]) continue;
      let m = elev[i];
      if (x < t - 1) m = Math.min(m, elev[i + 1] + 1);
      if (y < t - 1) m = Math.min(m, elev[i + t] + 1);
      if (x < t - 1 && y < t - 1) m = Math.min(m, elev[i + t + 1] + 1);
      if (x > 0 && y < t - 1) m = Math.min(m, elev[i + t - 1] + 1);
      elev[i] = Math.max(1, m);
    }
  }

  // 5. Écriture des piles : niveau 0 = socle de pierre partout, eau salée en surface de mer.
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      monde.poserNiveau(x, y, 0, Matiere.Pierre);
      const e = elev[i];
      if (estTerre[i]) {
        for (let k = 1; k < e; k++) monde.poserNiveau(x, y, k, Matiere.Terre);
        monde.poserNiveau(x, y, e, Matiere.Terre);
      } else {
        for (let k = 1; k < e; k++) monde.poserNiveau(x, y, k, Matiere.Pierre);
        monde.poserNiveau(x, y, e, Matiere.EauSalee);
      }
    }
  }

  // 6. Distance à l'eau (plages et bonus d'humidité).
  const estEauInit = new Uint8Array(n);
  for (let i = 0; i < n; i++) estEauInit[i] = estTerre[i] ? 0 : 1;
  const distEau = distanceChamfer(estEauInit, n, t);

  // 7. Climat : température inchangée (latitude + refroidissement par élévation), humidité continue bruitee.
  for (let y = 0; y < t; y++) {
    const distEq = monde.distanceEquateur(y);
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      const e = elev[i];
      monde.temperature[i] = temperatureBaseCelsius(config, distEq) - Math.max(0, e - 1) * config.refroidissementParNiveauCelsius;
      const proximiteEau = Math.max(0, Math.min(1, 1 - distEau[i] / config.largeurBonusHumiditeEauTuiles));
      monde.humidite[i] = humiditeBasePourcent(config, distEq, champHumidite.fbm(x, y), proximiteEau);
    }
  }

  // 8. Surfaces terrestres : sable uniquement en côte basse, peu pentue, proche de l'eau et tempérée/chaude.
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (!estTerre[i]) continue;
      const e = elev[i];
      let pente = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
          const ni = ny * t + nx;
          if (estTerre[ni]) pente = Math.max(pente, Math.abs(e - elev[ni]));
        }
      }
      const temp = monde.temperature[i];
      let surface = Matiere.Terre;
      if (
        e <= config.niveauMaxPlage &&
        distEau[i] <= config.largeurMaxPlageTuiles &&
        pente <= config.seuilPentePlageNiveaux &&
        temp >= config.temperatureMinPlageCelsius
      ) {
        surface = Matiere.Sable;
      } else if (e >= config.seuilNiveauRoche || pente > config.seuilPentePlageNiveaux || temp < config.temperatureMinPlageCelsius) {
        surface = Matiere.Pierre;
      }
      monde.poserNiveau(x, y, e, surface);
    }
  }

  // 9. Rivières : sources en altitude, écoulement vers le bas avec inertie directionnelle,
  //    confluences (débit cumulé), élargissement du tronc aval, lacs en dépression fermée.
  const estRiviere = new Uint8Array(n);
  const debit = new Uint8Array(n);
  const candidats: number[] = [];
  for (let i = 0; i < n; i++) {
    if (estTerre[i] && elev[i] >= config.elevationMinSourceRiviere) candidats.push(i);
  }
  const nbSources = Math.max(
    config.nbSourcesRivieresMin,
    Math.min(config.nbSourcesRivieresMax, Math.round((nbTerre * config.densiteSourcesRivieresParMillierTuilesTerre) / 1000)),
  );
  // Tirage des sources en favorisant l'altitude (les rivières naissent en montagne).
  const sources: number[] = [];
  let tentativesSources = 0;
  while (sources.length < nbSources && tentativesSources < nbSources * 100 && candidats.length > 0) {
    tentativesSources++;
    const c = candidats[rng.entier(0, candidats.length - 1)];
    if (sources.includes(c)) continue;
    if (rng.chance(Math.min(1, elev[c] / Math.max(1, niveauxMax - 1)))) sources.push(c);
  }
  const nb = sources.length;

  const poserEauDouce: PoserEauDouce = (x, y) => {
    const i = monde.index(x, y);
    const e = monde.elevationTuile(x, y);
    monde.matiere[monde.indexNiveau(x, y, e)] = Matiere.EauDouce;
    monde.vegetation[i] = Vegetation.Aucun;
    monde.humidite[i] = Math.min(100, monde.humidite[i] + 25);
  };

  for (let s = 0; s < nb; s++) {
    let cx = sources[s] % t;
    let cy = Math.floor(sources[s] / t);
    const ci0 = monde.index(cx, cy);
    poserEauDouce(cx, cy);
    estRiviere[ci0] = 1;
    debit[ci0] = 1;
    let dirX = rng.entier(-1, 1);
    let dirY = rng.entier(-1, 1);
    if (dirX === 0 && dirY === 0) dirX = 1;
    const visites = new Set<number>();
    for (let pas = 0; pas < config.pasMaxRiviere; pas++) {
      const ci = monde.index(cx, cy);
      if (visites.has(ci)) break;
      visites.add(ci);
      const e = elev[ci];
      let bestScore = Infinity;
      let bestX = -1;
      let bestY = -1;
      let bestMer = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
          const ni = ny * t + nx;
          if (visites.has(ni)) continue;
          const m = monde.matiereNiveau(nx, ny, elev[ni]);
          let key: number;
          if (m === Matiere.EauSalee) key = -1;
          else if (estRiviere[ni]) {
            if (elev[ni] > e) continue;
            key = elev[ni];
          } else if (m === Matiere.EauDouce) continue;
          else if (estTerre[ni] && elev[ni] < e) key = elev[ni];
          else if (estTerre[ni] && elev[ni] === e) key = e + 0.5;
          else continue;
          const align = dx * dirX + dy * dirY;
          const score = key - align * config.inertieDirectionnelleRiviere * 1.5;
          if (score < bestScore) {
            bestScore = score;
            bestX = nx;
            bestY = ny;
            bestMer = m === Matiere.EauSalee;
          }
        }
      }
      if (bestX < 0) {
        const emissaire = creerLac(monde, config, estTerre, elev, poserEauDouce, cx, cy, e);
        if (emissaire) {
          const [ex, ey] = emissaire;
          const ei = monde.index(ex, ey);
          poserEauDouce(ex, ey);
          estRiviere[ei] = 1;
          debit[ei] = Math.min(255, debit[ei] + debit[ci]);
          dirX = ex - cx;
          dirY = ey - cy;
          cx = ex;
          cy = ey;
          continue;
        }
        break;
      }
      if (bestMer) break;
      const ni = monde.index(bestX, bestY);
      poserEauDouce(bestX, bestY);
      estRiviere[ni] = 1;
      debit[ni] = Math.min(255, debit[ni] + debit[ci]);
      dirX = bestX - cx;
      dirY = bestY - cy;
      cx = bestX;
      cy = bestY;
    }
  }

  // Élargissement à 2 tuiles des troncs aval de grandes confluences.
  for (let i = 0; i < n; i++) {
    if (!estRiviere[i] || debit[i] < config.seuilDebitElargissement) continue;
    const x = i % t;
    const y = Math.floor(i / t);
    let bestX = -1;
    let bestY = -1;
    let bestElev = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
        const ni = ny * t + nx;
        if (estRiviere[ni] || !estTerre[ni]) continue;
        const m = monde.matiereNiveau(nx, ny, elev[ni]);
        if (m === Matiere.EauSalee || m === Matiere.EauDouce) continue;
        if (elev[ni] < bestElev) {
          bestElev = elev[ni];
          bestX = nx;
          bestY = ny;
        }
      }
    }
    if (bestX >= 0) {
      poserEauDouce(bestX, bestY);
      const ni = monde.index(bestX, bestY);
      estRiviere[ni] = 1;
      debit[ni] = debit[i];
    }
  }

  // 10. Végétation : classification par seuils conservée, entrées bruitées à petite maille (écotones en mosaïque).
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = y * t + x;
      if (!estTerre[i] || monde.estEau(x, y)) continue;
      monde.vegetation[i] = vegetationPourClimatAvecEcotone(
        config,
        monde.temperature[i],
        monde.humidite[i],
        champEcotoneT.fbm(x, y),
        champEcotoneH.fbm(x, y),
      );
      monde.biomasseVegetation[i] = 40 + rng.reel(0, 40);
    }
  }

  // 11. Gisements sur terre, pondérés par le relief : minerais métalliques plutôt en montagne,
  //     charbon/pétrole/gaz plutôt en plaine, sel sans préférence.
  const METAUX = new Set(['fer', 'cuivre', 'etain', 'or', 'argent', 'uranium']);
  const SEDIMENTAIRES = new Set(['charbon', 'petrole', 'gaz']);
  for (const [nom, g] of Object.entries(config.gisements)) {
    const matiere = matiereGisement(nom);
    const metallique = METAUX.has(nom);
    const sedimentaire = SEDIMENTAIRES.has(nom);
    const nbGisements = rng.entier(g.nbMin, g.nbMax);
    let places = 0;
    let tentatives = 0;
    while (places < nbGisements && tentatives < nbGisements * 50) {
      tentatives++;
      const x = rng.entier(bord, t - bord - 1);
      const y = rng.entier(bord, t - bord - 1);
      const i = monde.index(x, y);
      if (!estTerre[i]) continue;
      const e = elev[i];
      const m = monde.matiereNiveau(x, y, e);
      if (m !== Matiere.Terre && m !== Matiere.Sable && m !== Matiere.Pierre) continue;
      let proba = 1;
      if (metallique) proba = Math.min(1, e * config.facteurMontagneGisementsMetalliques);
      else if (sedimentaire) proba = Math.max(0.15, 1 - e * config.facteurPlaineGisementsSedimentaires);
      if (!rng.chance(proba)) continue;
      monde.matiere[monde.indexNiveau(x, y, e)] = matiere;
      monde.quantiteGisement[monde.indexNiveau(x, y, e)] = rng.reel(g.quantiteMin, g.quantiteMax);
      monde.vegetation[i] = Vegetation.Aucun;
      places++;
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
