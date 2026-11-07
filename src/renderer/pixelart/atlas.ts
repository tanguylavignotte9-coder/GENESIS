import type { ConfigRendu } from '../../sim/config/rendu';
import { fnv1a64 } from '../../sim/hash';

// ============================================================
// Atlas de sprites procédural (V1.2) — 100 % généré par code,
// aucun asset externe. Module PUR (pas de DOM, pas de Pixi) :
// il produit un tampon de pixels RGBA + une table de sprites.
// Le RNG de l'atlas est un mulberry32 dédié, grainé par
// config.rendu.graineAtlas : JAMAIS le RNG de la simulation.
// ============================================================

export type Rgb = [number, number, number];

export interface SpriteAtlas {
  x: number;
  y: number;
  w: number;
  h: number;
  frames: number;
}

export interface Atlas {
  largeur: number;
  hauteur: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
  sprites: Record<string, SpriteAtlas>;
}

export function decoderHex(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function mulberry32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashTuile(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export function melangerCouleurs(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export class Canevas {
  readonly px: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: Rgb, a: number = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb, a: number = 255): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, c, a);
    }
  }
  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.w + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  copierDepuis(src: Canevas, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const [r, g, b, a] = src.get(x, y);
        if (a > 0) this.set(dx + x, dy + y, [r, g, b], a);
      }
    }
  }
}

// ---------- Tuiles 8×8 (spécification exacte Annexe A + dérivés) ----------

function peindreTuileSimple(c: Canevas, base: Rgb, taches: Rgb[], nbTaches: number, rng: () => number): void {
  c.rect(0, 0, 8, 8, base);
  for (let i = 0; i < nbTaches; i++) {
    const t = taches[Math.floor(rng() * taches.length) % taches.length];
    c.set(Math.floor(rng() * 8), Math.floor(rng() * 8), t);
  }
}

function peindreArbre(c: Canevas, ax: number, ay: number, p: ConfigRendu['palettes']['foret']): void {
  const canopee = decoderHex(p.canopee);
  const clair = decoderHex(p.canopeeClair);
  const ombre = decoderHex(p.canopeeOmbre);
  const tronc = decoderHex(p.tronc);
  const troncOmbre = decoderHex(p.troncOmbre);
  c.rect(ax, ay, 3, 3, canopee);
  c.set(ax, ay, clair);
  c.set(ax + 1, ay + 1, clair);
  c.set(ax + 2, ay + 2, ombre);
  c.set(ax + 1, ay + 3, tronc);
  c.set(ax + 1, ay + 2, troncOmbre);
}

function peindreTuileEau(c: Canevas, p: ConfigRendu['palettes']['eau'], rng: () => number, frame: number): void {
  const base = decoderHex(p.base);
  const tache = decoderHex(p.taches[0]);
  const vague = decoderHex(p.vaguelettes);
  c.rect(0, 0, 8, 8, base);
  for (let i = 0; i < 4; i++) c.set(Math.floor(rng() * 8), Math.floor(rng() * 8), tache);
  // Vaguelettes : même graine => mêmes x/largeurs à chaque frame, seul y avance
  // de 1 px par frame (mod 8) — les vagues GLISSENT, elles ne sautent pas.
  for (let i = 0; i < 2; i++) {
    const w = 2 + Math.floor(rng() * 2);
    const x = Math.floor(rng() * (8 - w));
    const y = (Math.floor(rng() * 8) + frame + i * 4) % 8;
    c.rect(x, y, w, 1, vague);
  }
}

function peindreTuileForet(c: Canevas, p: ConfigRendu['palettes']['foret'], rng: () => number): void {
  peindreTuileSimple(c, decoderHex(p.base), p.taches.map(decoderHex), 4, rng);
  for (let i = 0; i < 2; i++) {
    peindreArbre(c, Math.floor(rng() * 5), Math.floor(rng() * 4), p);
  }
}

function peindreTuileMontagne(c: Canevas, p: ConfigRendu['palettes']['montagne'], rng: () => number): void {
  peindreTuileSimple(c, decoderHex(p.base), p.taches.map(decoderHex), 4, rng);
  const fiss = decoderHex(p.fissures);
  const arete = decoderHex(p.aretes);
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(rng() * 6);
    const y = 1 + Math.floor(rng() * 5);
    c.set(x, y, fiss);
    c.set(x, y - 1, arete);
  }
}

function peindreTuileDesert(c: Canevas, p: ConfigRendu['palettes']['desert'], rng: () => number): void {
  peindreTuileSimple(c, decoderHex(p.base), p.taches.map(decoderHex), 2, rng);
  const clair = decoderHex(p.duneClair);
  const ombre = decoderHex(p.duneOmbre);
  for (let i = 0; i < 3; i++) {
    const y = 1 + i * 2 + Math.floor(rng() * 2);
    const x0 = Math.floor(rng() * 4);
    const w = 3 + Math.floor(rng() * 4);
    c.rect(x0, y, w, 1, clair);
    c.rect(x0 + 1, y + 1, w - 1, 1, ombre);
  }
}

// ---------- Bâtiments ----------

type PeintreBatiment = (c: Canevas, p: ConfigRendu['palettes'], rng: () => number, frame: number, mature?: boolean) => void;

const DERRICK = (c: Canevas, p: ConfigRendu['palettes'], teinte: Rgb): void => {
  const bois = decoderHex(p.bois.bois);
  const metal = decoderHex(p.metal.base);
  c.set(1, 6, bois); c.set(4, 6, bois);
  c.set(2, 5, bois); c.set(3, 5, bois);
  c.set(2, 4, bois); c.set(3, 4, bois);
  c.set(2, 3, bois); c.set(3, 3, bois);
  c.set(2, 2, metal); c.set(3, 2, metal);
  c.set(2, 1, metal); c.set(3, 1, metal);
  c.set(2, 0, teinte); c.set(3, 0, teinte);
  c.rect(1, 6, 4, 1, bois);
};

const BATIMENTS: Record<string, { w: number; h: number; frames: number; peindre: PeintreBatiment }> = {
  feuDeCamp: {
    w: 5, h: 5, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const f = p.flammes.map(decoderHex);
      const buche = decoderHex(p.bois.toitFonce);
      const bois = decoderHex(p.bois.bois);
      c.rect(0, 3, 5, 1, buche);
      c.set(1, 3, bois); c.set(3, 3, bois);
      if (frame === 0) {
        c.set(2, 0, f[0]);
        c.rect(1, 1, 3, 2, f[1]);
        c.set(2, 1, f[0]);
      } else {
        c.rect(1, 0, 3, 1, f[0]);
        c.rect(2, 1, 2, 2, f[1]);
        c.set(1, 2, f[2]);
      }
    },
  },
  hutte: {
    w: 7, h: 6, frames: 1,
    peindre: (c, p, rng) => {
      const toit = decoderHex(p.bois.toitFonce);
      const bois = decoderHex(p.bois.bois);
      const murs = decoderHex(p.bois.murs);
      const toits = decoderHex(p.bois.toits);
      const porte = decoderHex(p.bois.toitFonce);
      c.rect(0, 0, 7, 3, toit);
      for (let i = 0; i < 3; i++) c.set(Math.floor(rng() * 7), Math.floor(rng() * 3), bois);
      c.rect(1, 3, 5, 3, murs);
      c.set(3, 5, porte);
      c.set(1, 3, toits); c.set(5, 3, toits);
    },
  },
  grenier: {
    w: 5, h: 5, frames: 1,
    peindre: (c, p) => {
      const corps = decoderHex(p.bois.murs);
      const toit = decoderHex(p.bois.toits);
      const pilotis = decoderHex(p.bois.bois);
      const grain = decoderHex(p.sentier.clair);
      c.rect(0, 1, 5, 4, corps);
      c.rect(0, 0, 5, 1, toit);
      c.set(0, 4, pilotis); c.set(4, 4, pilotis);
      c.set(2, 2, grain);
    },
  },
  depot: {
    w: 8, h: 7, frames: 1,
    peindre: (c, p, rng) => {
      const toit = decoderHex(p.bois.toitFonce);
      const murs = decoderHex(p.bois.murs);
      const bois = decoderHex(p.bois.bois);
      c.rect(0, 0, 8, 3, toit);
      for (let i = 0; i < 4; i++) c.set(Math.floor(rng() * 8), Math.floor(rng() * 3), bois);
      c.rect(0, 3, 8, 4, murs);
      c.rect(3, 4, 2, 3, decoderHex(p.bois.toitFonce));
    },
  },
  puits: {
    w: 4, h: 4, frames: 1,
    peindre: (c, p) => {
      const pierre = decoderHex(p.pierre.base);
      const sombre = decoderHex('#2c3547');
      const clair = decoderHex(p.pierre.clair);
      c.rect(0, 0, 4, 4, pierre);
      c.rect(1, 1, 2, 2, sombre);
      c.set(0, 0, clair);
    },
  },
  enclos: {
    w: 8, h: 8, frames: 1,
    peindre: (c, p) => {
      const poteau = decoderHex(p.bois.poteau);
      const rail = decoderHex(p.bois.bois);
      for (let i = 0; i < 8; i += 2) {
        c.set(i, 0, poteau); c.set(i, 7, poteau); c.set(0, i, poteau); c.set(7, i, poteau);
      }
      c.rect(0, 3, 8, 1, rail);
      c.rect(3, 0, 1, 8, rail);
      c.rect(1, 5, 2, 1, decoderHex('#b09a80'));
      c.rect(5, 1, 2, 1, decoderHex('#8f7a60'));
    },
  },
  champ: {
    w: 8, h: 8, frames: 1,
    peindre: (c, p, _rng, _frame, mature) => {
      const bordure = decoderHex(p.bois.bois);
      const sillonA = decoderHex('#b89b3e');
      const sillonB = decoderHex('#8f7a2f');
      const pousse = decoderHex(mature ? '#d8b84a' : p.prairie.taches[0]);
      for (let y = 0; y < 8; y += 2) c.rect(0, y, 8, 1, y % 4 === 0 ? sillonA : sillonB);
      for (let i = 0; i < 6; i++) {
        c.set(1 + ((i * 3) % 6), 1 + ((i * 5) % 6), pousse);
      }
      c.rect(0, 0, 8, 1, bordure); c.rect(0, 7, 8, 1, bordure);
      c.rect(0, 0, 1, 8, bordure); c.rect(7, 0, 1, 8, bordure);
    },
  },
  fumoir: {
    w: 6, h: 6, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const murs = decoderHex(p.bois.murs);
      const toit = decoderHex(p.bois.toits);
      const fumee = decoderHex(p.fumee);
      c.rect(0, 3, 6, 3, murs);
      c.rect(0, 1, 6, 2, toit);
      c.set(2, 3, decoderHex(p.bois.toitFonce));
      // Fumée animée : pixels explicitement déplacés par `frame` (base fixe).
      if (frame === 0) {
        c.set(2, 0, fumee, 200);
        c.set(3, 1, fumee, 140);
      } else {
        c.set(3, 0, fumee, 200);
        c.set(2, 1, fumee, 140);
      }
    },
  },
  atelier: {
    w: 7, h: 6, frames: 1,
    peindre: (c, p) => {
      const bois = decoderHex(p.bois.bois);
      const planche = decoderHex(p.chantier.planche);
      const metal = decoderHex(p.metal.clair);
      c.rect(1, 3, 5, 1, planche);
      c.set(1, 4, bois); c.set(5, 4, bois);
      c.rect(0, 0, 7, 2, decoderHex(p.bois.toits));
      c.set(2, 2, metal); c.set(4, 2, metal);
      c.rect(2, 3, 2, 1, metal);
    },
  },
  marche: {
    w: 7, h: 5, frames: 1,
    peindre: (c, p, rng) => {
      const poteau = decoderHex(p.bois.poteau);
      c.set(0, 0, poteau); c.set(6, 0, poteau);
      c.rect(0, 1, 7, 1, decoderHex(p.bois.toitFonce));
      const marchandise = [p.flammes[0], p.prairie.taches[0], p.eau.vaguelettes].map(decoderHex);
      for (let i = 0; i < 5; i++) {
        c.set(1 + i, 2, marchandise[Math.floor(rng() * marchandise.length)]);
      }
      c.rect(0, 3, 7, 1, decoderHex(p.chantier.planche));
      c.rect(0, 4, 7, 1, decoderHex(p.bois.bois));
    },
  },
  ecole: {
    w: 8, h: 6, frames: 1,
    peindre: (c, p) => {
      const ardoise = decoderHex(p.pierre.sombre);
      const murs = decoderHex('#c8bfa8');
      c.rect(0, 0, 8, 2, ardoise);
      c.rect(0, 2, 8, 4, murs);
      c.rect(3, 4, 2, 2, decoderHex(p.bois.toitFonce));
      c.set(1, 3, decoderHex(p.pierre.clair));
      c.set(6, 3, decoderHex(p.pierre.clair));
    },
  },
  forge: {
    w: 7, h: 6, frames: 2,
    peindre: (c, p, rng, frame) => {
      const murs = decoderHex(p.pierre.base);
      const toit = decoderHex(p.bois.toitFonce);
      const metal = decoderHex(p.metal.base);
      const f = p.flammes.map(decoderHex);
      c.rect(0, 3, 7, 3, murs);
      c.rect(0, 1, 7, 2, toit);
      c.rect(2, 4, 3, 2, metal);
      c.set(3, 4, decoderHex(p.metal.clair));
      const fx = 1 + (frame % 2);
      c.set(fx, 3, f[1]); c.set(fx + 1, 3, f[0]); c.set(fx, 2, f[2]);
      void rng;
    },
  },
  banque: {
    w: 8, h: 6, frames: 1,
    peindre: (c, p) => {
      const pierre = decoderHex(p.pierre.base);
      const clair = decoderHex(p.pierre.clair);
      const sombre = decoderHex(p.pierre.sombre);
      c.rect(0, 0, 8, 1, sombre);
      c.rect(0, 1, 8, 1, clair);
      for (let x = 1; x <= 6; x += 2) c.rect(x, 2, 1, 3, clair);
      c.rect(0, 5, 8, 1, pierre);
      c.rect(3, 3, 2, 3, sombre);
    },
  },
  moulin: {
    w: 8, h: 8, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const murs = decoderHex(p.bois.murs);
      const toit = decoderHex(p.bois.toits);
      const bois = decoderHex(p.bois.bois);
      c.rect(2, 3, 4, 5, murs);
      c.rect(1, 1, 6, 2, toit);
      c.set(4, 4, decoderHex(p.bois.toitFonce));
      if (frame === 0) {
        c.rect(3, 0, 2, 8, bois);
        c.rect(0, 3, 8, 2, bois);
      } else {
        c.set(2, 1, bois); c.set(5, 1, bois); c.set(2, 6, bois); c.set(5, 6, bois);
        c.set(3, 2, bois); c.set(4, 2, bois); c.set(3, 5, bois); c.set(4, 5, bois);
      }
    },
  },
  carriere: {
    w: 8, h: 6, frames: 1,
    peindre: (c, p) => {
      const sombre = decoderHex(p.pierre.sombre);
      const base = decoderHex(p.pierre.base);
      const clair = decoderHex(p.pierre.clair);
      c.rect(0, 0, 8, 6, sombre);
      c.rect(1, 1, 6, 1, base);
      c.rect(2, 3, 4, 1, base);
      c.set(1, 2, clair); c.set(6, 4, clair); c.set(3, 5, clair);
    },
  },
  ponton: {
    w: 8, h: 4, frames: 1,
    peindre: (c, p) => {
      const planche = decoderHex(p.chantier.planche);
      const poteau = decoderHex(p.bois.poteau);
      for (let x = 0; x < 8; x++) c.rect(x, 1, 1, 2, x % 2 === 0 ? planche : decoderHex(p.bois.bois));
      c.set(0, 0, poteau); c.set(7, 0, poteau); c.set(0, 3, poteau); c.set(7, 3, poteau);
    },
  },
  port: {
    w: 8, h: 7, frames: 1,
    peindre: (c, p) => {
      const quai = decoderHex(p.pierre.base);
      const bois = decoderHex(p.bois.bois);
      const clair = decoderHex(p.pierre.clair);
      c.rect(0, 5, 8, 2, quai);
      c.rect(0, 5, 8, 1, clair);
      c.set(5, 0, bois); c.set(5, 1, bois); c.set(5, 2, bois); c.set(5, 3, bois); c.set(5, 4, bois);
      c.set(2, 1, bois); c.set(3, 1, bois); c.set(4, 1, bois);
      c.set(2, 2, bois);
      c.rect(0, 0, 3, 1, bois);
    },
  },
  bateau: {
    w: 7, h: 5, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const coque = decoderHex(p.vehicule.coque);
      const voile = decoderHex(p.vehicule.voile);
      const ecume = decoderHex(p.vehicule.ecume);
      c.rect(0, 3, 7, 2, coque);
      c.set(3, 0, coque); c.set(3, 1, coque); c.set(3, 2, coque);
      c.rect(4, 1, 2, 2, voile);
      if (frame === 1) {
        c.set(0, 2, ecume); c.set(6, 2, ecume);
      }
    },
  },
  charrette: {
    w: 7, h: 4, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const caisse = decoderHex(p.bois.murs);
      const roue = decoderHex(p.vehicule.roue);
      const attelage = decoderHex(p.bois.bois);
      c.rect(1, 0, 5, 2, caisse);
      c.set(0, 1, attelage); c.set(0, 2, attelage);
      c.set(2, 3, roue); c.set(4, 3, roue);
      if (frame === 1) {
        c.set(1, 3, roue); c.set(3, 3, roue); c.set(5, 3, roue);
      }
    },
  },
  raffinerie: {
    w: 9, h: 7, frames: 1,
    peindre: (c, p) => {
      const metal = decoderHex(p.metal.base);
      const clair = decoderHex(p.metal.clair);
      const sombre = decoderHex(p.pierre.sombre);
      c.rect(0, 3, 4, 4, metal);
      c.rect(5, 2, 4, 5, metal);
      c.set(1, 3, clair); c.set(6, 2, clair);
      c.rect(4, 1, 1, 3, sombre);
      c.set(2, 0, sombre); c.set(7, 0, sombre); c.set(7, 1, clair);
    },
  },
  'centrale-charbon': {
    w: 9, h: 7, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const murs = decoderHex(p.pierre.base);
      const cheminee = decoderHex(p.pierre.sombre);
      const fumee = decoderHex(p.fumee);
      c.rect(0, 4, 6, 3, murs);
      c.rect(7, 0, 2, 7, cheminee);
      c.set(7, 0, decoderHex(p.pierre.clair));
      const dx = frame === 0 ? 0 : 1;
      c.set(7 + dx, 0, fumee, 130);
      c.set(8 - dx, 0, fumee, 90);
    },
  },
  'centrale-gaz': {
    w: 9, h: 7, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const murs = decoderHex(p.metal.base);
      const cheminee = decoderHex(p.metal.clair);
      const fumee = decoderHex(p.fumee);
      c.rect(0, 4, 6, 3, murs);
      c.rect(7, 1, 2, 6, cheminee);
      const dx = frame === 0 ? 0 : 1;
      c.set(7 + dx, 0, fumee, 100);
      c.set(8 - dx, 0, fumee, 70);
    },
  },
  'centrale-nucleaire': {
    w: 9, h: 7, frames: 2,
    peindre: (c, p, _rng, frame) => {
      const cuve = decoderHex(p.metal.base);
      const clair = decoderHex(p.metal.clair);
      const cheminee = decoderHex(p.pierre.sombre);
      const fumee = decoderHex(p.fumee);
      c.rect(0, 2, 5, 5, cuve);
      c.rect(0, 2, 5, 1, clair);
      c.rect(6, 0, 2, 7, cheminee);
      const dx = frame === 0 ? 0 : 1;
      c.set(6 + dx, 0, fumee, 60);
    },
  },
};

const MINES: Record<string, string> = {
  'mine-fer': 'fer',
  'mine-cuivre': 'cuivre',
  'mine-etain': 'etain',
  'mine-or': 'or',
  'mine-argent': 'argent',
  'mine-sel': 'sel',
  'mine-charbon': 'charbon',
  'mine-uranium': 'uranium',
};

function peindreMine(c: Canevas, p: ConfigRendu['palettes'], minerai: Rgb): void {
  const entree = decoderHex('#14100c');
  const bois = decoderHex(p.bois.bois);
  const tronc = decoderHex(p.bois.toitFonce);
  c.rect(2, 2, 3, 4, entree);
  c.set(1, 1, bois); c.set(4, 1, bois);
  c.set(1, 2, tronc); c.set(4, 2, tronc);
  c.set(0, 6, bois); c.set(5, 6, bois);
  c.set(2, 1, minerai); c.set(4, 0, minerai); c.set(3, 6, minerai);
}

function peindrePuitsDeriv(c: Canevas, p: ConfigRendu['palettes'], teinte: Rgb): void {
  DERRICK(c, p, teinte);
  c.set(0, 6, teinte); c.set(5, 6, teinte);
}

// ---------- Espèces (7, 2 frames marche/repos) ----------

type PeintreEspece = (c: Canevas, e: ConfigRendu['palettes']['especes'][string], frame: number) => void;

const ESPECES: Record<string, { w: number; h: number; peindre: PeintreEspece }> = {
  cerf: {
    w: 6, h: 4,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      const detail = decoderHex(e.detail);
      c.rect(0, 1, 5, 2, corps);
      c.set(5, 0, corps);
      c.set(5, 1, detail);
      c.set(0, 1, clair);
      c.set(3, 0, clair); c.set(4, 0, clair);
      if (frame === 0) {
        c.set(1, 3, sombre); c.set(3, 3, sombre); c.set(4, 3, sombre); c.set(5, 2, sombre);
      } else {
        c.set(2, 3, sombre); c.set(4, 3, sombre); c.set(5, 2, sombre);
      }
    },
  },
  bison: {
    w: 8, h: 4,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      c.rect(1, 0, 5, 3, corps);
      c.set(0, 0, clair); c.set(0, 1, clair); c.set(6, 0, clair); c.set(7, 0, clair);
      c.set(2, 3, sombre); c.set(5, 3, sombre);
      if (frame === 1) c.set(3, 3, sombre);
    },
  },
  sanglier: {
    w: 6, h: 4,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      c.rect(0, 1, 5, 2, corps);
      c.set(1, 0, sombre); c.set(2, 0, sombre); c.set(3, 0, sombre);
      c.set(5, 1, clair);
      c.set(5, 2, clair);
      if (frame === 0) {
        c.set(1, 3, sombre); c.set(3, 3, sombre); c.set(4, 3, sombre);
      } else {
        c.set(2, 3, sombre); c.set(4, 3, sombre);
      }
    },
  },
  lapin: {
    w: 4, h: 3,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const dy = frame === 1 ? -1 : 0;
      c.rect(0, 1 + dy, 3, 2, corps);
      c.set(2, 0 + Math.max(0, dy), clair);
      c.set(3, 0 + Math.max(0, dy), clair);
      c.set(3, 1 + dy, decoderHex(e.detail));
    },
  },
  loup: {
    w: 7, h: 4,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      const detail = decoderHex(e.detail);
      c.rect(0, 1, 5, 2, corps);
      c.set(5, 0, corps);
      c.set(5, 1, detail);
      c.set(6, 1, clair);
      c.set(0, 0, sombre);
      if (frame === 0) {
        c.set(1, 3, sombre); c.set(3, 3, sombre); c.set(4, 3, sombre);
      } else {
        c.set(2, 3, sombre); c.set(4, 3, sombre);
      }
    },
  },
  ours: {
    w: 7, h: 5,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      c.rect(1, 1, 5, 3, corps);
      c.set(6, 0, corps);
      c.set(6, 1, clair);
      c.set(2, 0, sombre); c.set(4, 0, sombre);
      if (frame === 0) {
        c.set(2, 4, sombre); c.set(3, 4, sombre); c.set(5, 4, sombre); c.set(6, 3, sombre);
      } else {
        c.set(3, 4, sombre); c.set(5, 4, sombre); c.set(6, 3, sombre);
      }
    },
  },
  vautour: {
    w: 7, h: 4,
    peindre: (c, e, frame) => {
      const corps = decoderHex(e.corps);
      const clair = decoderHex(e.clair);
      const sombre = decoderHex(e.sombre);
      const detail = decoderHex(e.detail);
      // Silhouette FIXE (plané reconnaissable) : ailes, corps, tête, bec, queue.
      c.rect(0, 1, 7, 1, corps);
      c.rect(2, 2, 2, 1, corps);
      c.set(4, 2, corps);
      c.set(5, 2, detail);
      c.set(1, 2, sombre);
      // Seuls les 2 pixels des bouts d'ailes montent/descendent d'1 px entre frames.
      if (frame === 0) {
        c.set(0, 0, clair);
        c.set(6, 0, clair);
      } else {
        c.set(0, 2, clair);
        c.set(6, 2, clair);
      }
    },
  },
};

// ---------- Humains (spécification exacte Annexe A, 3×5) ----------

export interface OptionsHumain {
  peau: Rgb;
  tunique: Rgb;
  cheveux?: Rgb;
  frame: number;
  grossesse?: boolean;
}

export function peindreHumain(c: Canevas, o: OptionsHumain): void {
  const pied = decoderHex('#3a2f24');
  const y0 = o.cheveux ? 1 : 0;
  if (o.cheveux) c.set(1, 0, o.cheveux);
  c.set(1, y0, o.peau);
  c.rect(0, y0 + 1, 3, 3, o.tunique);
  if (o.grossesse) c.set(1, y0 + 4, o.tunique);
  if (o.frame === 0) {
    c.set(0, y0 + 4, pied);
    c.set(2, y0 + 4, pied);
  } else {
    c.set(0, y0 + 4, pied);
    c.set(2, y0 + 3, pied);
  }
}

export function couleurPeau(teinte: number, p: ConfigRendu['palettes']['peau']): Rgb {
  const t = Math.max(0, Math.min(100, teinte)) / 100;
  return melangerCouleurs(decoderHex(p.min), decoderHex(p.max), t);
}

export function couleurCheveuxValeur(valeur: number, p: ConfigRendu['palettes']): Rgb {
  const t = Math.max(0, Math.min(100, valeur)) / 100;
  return decoderHex(p.cheveux[Math.floor(t * (p.cheveux.length - 1)) % p.cheveux.length]);
}

export function couleurTunique(id: number, p: ConfigRendu['palettes']): Rgb {
  const h = fnv1a64(`tunique:${id}`);
  return decoderHex(p.vetements[parseInt(h.slice(0, 8), 16) % p.vetements.length]);
}

// ---------- Assemblage de l'atlas ----------

const SAISONS_ORDRE = ['printemps', 'ete', 'automne', 'hiver'] as const;
export type SaisonPalette = (typeof SAISONS_ORDRE)[number];

export function saisonVersIndexPalette(saison: number): number {
  switch (saison) {
    case 0: return 0;
    case 2: return 2;
    case 3: return 3;
    case 5: return 0;
    default: return 1;
  }
}

export function genererAtlas(rendu: ConfigRendu): Atlas {
  const largeur = 1024;
  const entrees: Array<{ cle: string; c: Canevas; frames: number }> = [];
  const g = rendu.graineAtlas;
  const P = rendu.palettes;
  const V = rendu.variantesParTuile;
  // Graine identique pour TOUTES les frames d'un même sprite : seuls les pixels
  // explicitement déplacés par le paramètre `frame` (vaguelettes, flammes) peuvent
  // différer d'une frame à l'autre. Jamais de frame dans la graine (anti-scintillement).
  const rngPour = (cle: string, v: number = 0, frame: number = 0): (() => number) => {
    void frame;
    const h = parseInt(fnv1a64(`${cle}:${v}`).slice(0, 8), 16);
    return mulberry32((g ^ h) >>> 0);
  };

  const ajouterTuile = (cle: string, v: number, peindre: (c: Canevas, rng: () => number, frame: number) => void, frames: number = 1): void => {
    const c = new Canevas(8 * frames, 8);
    for (let f = 0; f < frames; f++) {
      const sous = new Canevas(8, 8);
      peindre(sous, rngPour(`${cle}:v${v}`), f);
      c.copierDepuis(sous, f * 8, 0);
    }
    entrees.push({ cle: `${cle}:v${v}`, c, frames });
  };

  for (let v = 0; v < V; v++) {
    ajouterTuile('tuile:eau', v, (c, rng, frame) => peindreTuileEau(c, P.eau, rng, frame), 4);
    ajouterTuile('tuile:eauProfonde', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.eauProfonde.base), P.eauProfonde.taches.map(decoderHex), 3, rng);
    });
    ajouterTuile('tuile:eauGelee', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.eauGelee.base), P.eauGelee.taches.map(decoderHex), 4, rng);
    });
    ajouterTuile('tuile:plage', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.plage.base), P.plage.taches.map(decoderHex), 5, rng);
    });
    ajouterTuile('tuile:colline', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.colline.base), P.colline.taches.map(decoderHex), 7, rng);
      const roche = decoderHex(P.colline.roche);
      c.set(Math.floor(rng() * 8), Math.floor(rng() * 8), roche);
      c.set(Math.floor(rng() * 8), Math.floor(rng() * 8), roche);
    });
    ajouterTuile('tuile:montagne', v, (c, rng) => peindreTuileMontagne(c, P.montagne, rng));
    ajouterTuile('tuile:neige', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.neige.base), P.neige.taches.map(decoderHex), 4, rng);
    });
    ajouterTuile('tuile:terre', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.terre.base), P.terre.taches.map(decoderHex), 6, rng);
    });
    ajouterTuile('tuile:toundra', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.toundra.base), P.toundra.taches.map(decoderHex), 4, rng);
      const mousse = P.toundra.mousse.map(decoderHex);
      for (let i = 0; i < 3; i++) c.set(Math.floor(rng() * 8), Math.floor(rng() * 8), mousse[Math.floor(rng() * mousse.length) % mousse.length]);
    });
    ajouterTuile('tuile:taiga', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.taiga.base), P.taiga.taches.map(decoderHex), 5, rng);
      peindreArbre(c, Math.floor(rng() * 5), Math.floor(rng() * 4), P.taiga);
      if (v % 2 === 1) peindreArbre(c, Math.floor(rng() * 5), Math.floor(rng() * 4), P.taiga);
    });
    ajouterTuile('tuile:jungle', v, (c, rng) => {
      peindreTuileSimple(c, decoderHex(P.jungle.base), P.jungle.taches.map(decoderHex), 5, rng);
      for (let i = 0; i < 3; i++) peindreArbre(c, Math.floor(rng() * 5), Math.floor(rng() * 3), P.jungle);
    });
    ajouterTuile('tuile:desert', v, (c, rng) => peindreTuileDesert(c, P.desert, rng));
    for (let s = 0; s < 4; s++) {
      const saison = rendu.saisons[SAISONS_ORDRE[s]];
      ajouterTuile(`tuile:prairie:s${s}`, v, (c, rng) => {
        peindreTuileSimple(c, decoderHex(saison.prairie.base), saison.prairie.taches.map(decoderHex), 6, rng);
      });
      ajouterTuile(`tuile:foret:s${s}`, v, (c, rng) => peindreTuileForet(c, saison.foret, rng));
      ajouterTuile(`tuile:savane:s${s}`, v, (c, rng) => {
        peindreTuileSimple(c, decoderHex(saison.savane.base), saison.savane.taches.map(decoderHex), 6, rng);
        if (v === 0) {
          const arbre = decoderHex(P.savane.arbre);
          const canopee = decoderHex(P.savane.canopee);
          c.set(3, 2, arbre);
          c.rect(2, 0, 3, 2, canopee);
        }
      });
    }
  }

  // Bâtiments : 33 types (+ variantes chantier / ruine / murée générées).
  for (const [type, def] of Object.entries(BATIMENTS)) {
    const c = new Canevas(def.w * def.frames, def.h);
    for (let f = 0; f < def.frames; f++) {
      const sous = new Canevas(def.w, def.h);
      def.peindre(sous, P, rngPour(`bat:${type}`), f, false);
      c.copierDepuis(sous, f * def.w, 0);
    }
    entrees.push({ cle: `bat:${type}`, c, frames: def.frames });
    entrees.push({ cle: `bat:${type}:chantier`, c: peindreChantier(new Canevas(def.w, def.h), P, rngPour(`bat:${type}:chantier`, 0)), frames: 1 });
    entrees.push({ cle: `bat:${type}:ruine`, c: peindreRuine(c, def, rngPour(`bat:${type}:ruine`, 0)), frames: 1 });
  }
  {
    const def = BATIMENTS['champ'];
    const c = new Canevas(def.w, def.h);
    def.peindre(c, P, rngPour('bat:champ:mature', 0), 0, true);
    entrees.push({ cle: 'bat:champ:mature', c, frames: 1 });
  }
  for (const [type, minerai] of Object.entries(MINES)) {
    const couleur = decoderHex(P.gisement[minerai]);
    const c = new Canevas(7, 6);
    peindreMine(c, P, couleur);
    entrees.push({ cle: `bat:${type}`, c, frames: 1 });
    entrees.push({ cle: `bat:${type}:chantier`, c: peindreChantier(new Canevas(7, 6), P, rngPour(`bat:${type}:chantier`, 0)), frames: 1 });
    entrees.push({ cle: `bat:${type}:ruine`, c: peindreRuine(c, { w: 7, h: 6 }, rngPour(`bat:${type}:ruine`, 0)), frames: 1 });
    const muree = new Canevas(7, 6);
    muree.copierDepuis(c, 0, 0);
    muree.rect(2, 2, 3, 4, decoderHex(P.pierre.base));
    muree.set(3, 3, decoderHex(P.pierre.clair));
    entrees.push({ cle: `bat:${type}:muree`, c: muree, frames: 1 });
  }
  for (const [type, minerai] of Object.entries({ 'puits-gaz': 'gaz', 'puits-petrole': 'petrole' })) {
    const couleur = decoderHex(P.gisement[minerai]);
    const c = new Canevas(6, 7);
    peindrePuitsDeriv(c, P, couleur);
    entrees.push({ cle: `bat:${type}`, c, frames: 1 });
    entrees.push({ cle: `bat:${type}:chantier`, c: peindreChantier(new Canevas(6, 7), P, rngPour(`bat:${type}:chantier`, 0)), frames: 1 });
    entrees.push({ cle: `bat:${type}:ruine`, c: peindreRuine(c, { w: 6, h: 7 }, rngPour(`bat:${type}:ruine`, 0)), frames: 1 });
  }

  // Espèces : 7 × 2 frames + ombre du vautour.
  for (const [id, def] of Object.entries(ESPECES)) {
    const e = P.especes[id];
    const c = new Canevas(def.w * 2, def.h);
    for (let f = 0; f < 2; f++) {
      const sous = new Canevas(def.w, def.h);
      def.peindre(sous, e, f);
      c.copierDepuis(sous, f * def.w, 0);
    }
    entrees.push({ cle: `espece:${id}`, c, frames: 2 });
  }
  {
    // Ombre portée du vautour : petit rectangle 2×1 semi-transparent (pas un 2e animal).
    const ombre = new Canevas(2, 1);
    ombre.rect(0, 0, 2, 1, [20, 20, 24], 90);
    entrees.push({ cle: 'espece:vautour:ombre', c: ombre, frames: 1 });
  }

  // Marqueurs LOD faible zoom.
  {
    const point = new Canevas(2, 2);
    point.rect(0, 0, 2, 2, [255, 255, 255], 242);
    entrees.push({ cle: 'marqueur:humain', c: point, frames: 1 });
    for (const [id, e] of Object.entries(P.especes)) {
      const m = new Canevas(2, 2);
      m.rect(0, 0, 2, 2, decoderHex(e.corps), 242);
      entrees.push({ cle: `marqueur:espece:${id}`, c: m, frames: 1 });
    }
    const veh = new Canevas(3, 3);
    veh.rect(0, 0, 3, 3, decoderHex(P.vehicule.coque), 242);
    entrees.push({ cle: 'marqueur:vehicule', c: veh, frames: 1 });
    const fav = new Canevas(1, 1);
    fav.rect(0, 0, 1, 1, decoderHex(P.marqueurFavori));
    entrees.push({ cle: 'marqueur:favori', c: fav, frames: 1 });
    const couronne = new Canevas(3, 1);
    couronne.rect(0, 0, 3, 1, decoderHex(P.marqueurDirigeant));
    entrees.push({ cle: 'marqueur:dirigeant', c: couronne, frames: 1 });
  }

  // Bâtiments en marqueur 4×4 couleur type (faible zoom).
  for (const type of [...Object.keys(BATIMENTS), ...Object.keys(MINES), 'puits-gaz', 'puits-petrole']) {
    const m = new Canevas(4, 4);
    m.rect(0, 0, 4, 4, couleurMarqueurBatiment(type, P), 242);
    entrees.push({ cle: `marqueur:bat:${type}`, c: m, frames: 1 });
  }

  // Empaquetage en étagères (shelf packing) dans l'atlas.
  let x = 0;
  let y = 0;
  let hauteurLigne = 0;
  const sprites: Record<string, SpriteAtlas> = {};
  const hauteurMax = 4096;
  const pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(largeur * hauteurMax * 4);
  for (const e of entrees) {
    if (x + e.c.w > largeur) {
      x = 0;
      y += hauteurLigne;
      hauteurLigne = 0;
    }
    if (y + e.c.h > hauteurMax) throw new Error('Atlas trop grand');
    for (let yy = 0; yy < e.c.h; yy++) {
      for (let xx = 0; xx < e.c.w; xx++) {
        const [r, g, b, a] = e.c.get(xx, yy);
        const i = ((y + yy) * largeur + (x + xx)) * 4;
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
      }
    }
    sprites[e.cle] = { x, y, w: e.c.w, h: e.c.h, frames: e.frames };
    x += e.c.w;
    hauteurLigne = Math.max(hauteurLigne, e.c.h);
  }
  const hauteur = y + hauteurLigne;
  return { largeur, hauteur, pixels: pixels.slice(0, largeur * hauteur * 4), sprites };
}

function peindreChantier(c: Canevas, p: ConfigRendu['palettes'], rng: () => number): Canevas {
  const bois = decoderHex(p.chantier.bois);
  const planche = decoderHex(p.chantier.planche);
  for (let i = 0; i < c.w; i += 2) {
    c.set(i, 0, bois);
    c.set(i, c.h - 1, bois);
  }
  for (let j = 0; j < c.h; j += 2) {
    c.set(0, j, bois);
    c.set(c.w - 1, j, bois);
  }
  c.rect(1, Math.floor(c.h / 2), c.w - 2, 1, planche);
  c.rect(1, Math.floor(c.h / 2) - 2, c.w - 2, 1, planche);
  for (let i = 0; i < 3; i++) c.set(1 + Math.floor(rng() * (c.w - 2)), c.h - 1, planche);
  return c;
}

function peindreRuine(cBase: Canevas, def: { w: number; h: number }, rng: () => number): Canevas {
  const c = new Canevas(def.w, def.h);
  c.copierDepuis(cBase, 0, 0);
  // Toit effondré : on retire des pixels de la partie haute, on disperse des débris en bas.
  const nb = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < nb; i++) {
    const x = Math.floor(rng() * def.w);
    const y = Math.floor(rng() * Math.max(1, Math.floor(def.h / 2)));
    const [r, g, b] = c.get(x, y);
    c.set(x, y, [r, g, b], 0);
  }
  for (let i = 0; i < 4; i++) {
    const [r, g, b, a] = cBase.get(Math.floor(rng() * def.w), Math.floor(rng() * def.h));
    if (a > 0) c.set(Math.floor(rng() * def.w), def.h - 1 - Math.floor(rng() * 2), [r, g, b], 220);
  }
  return c;
}

export function couleurMarqueurBatiment(type: string, p: ConfigRendu['palettes']): Rgb {
  if (type.startsWith('mine-')) {
    const minerai = type.slice(5);
    return decoderHex(p.gisement[minerai] ?? '#888888');
  }
  if (type === 'puits-gaz') return decoderHex(p.gisement.gaz);
  if (type === 'puits-petrole') return decoderHex(p.gisement.petrole);
  if (type === 'bateau' || type === 'ponton' || type === 'port') return decoderHex(p.eau.base);
  if (type === 'charrette') return decoderHex(p.vehicule.roue);
  if (type === 'champ') return decoderHex('#b89b3e');
  if (type.startsWith('centrale-')) return decoderHex(p.pierre.sombre);
  if (type === 'carriere') return decoderHex(p.pierre.base);
  return decoderHex(p.bois.toits);
}

export const TYPES_BATIMENTS_ATTENDUS = [
  'feuDeCamp', 'hutte', 'grenier', 'depot', 'puits', 'enclos', 'champ', 'fumoir',
  'atelier', 'marche', 'ecole', 'forge', 'banque', 'moulin', 'carriere',
  'ponton', 'port', 'bateau', 'charrette',
  'mine-fer', 'mine-cuivre', 'mine-etain', 'mine-or', 'mine-argent', 'mine-sel', 'mine-charbon', 'mine-uranium',
  'puits-gaz', 'puits-petrole', 'raffinerie',
  'centrale-charbon', 'centrale-gaz', 'centrale-nucleaire',
];
