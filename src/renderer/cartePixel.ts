import { Application, Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import type { ConfigComplete } from '../sim/config/schema';
import type { ConfigRendu } from '../sim/config/rendu';
import { decoderMot } from '../sim/worker/digestRendu';
import {
  genererAtlas, hashTuile, saisonVersIndexPalette, peindreHumain, couleurPeau, couleurCheveuxValeur, couleurTunique,
  Canevas, type Atlas,
} from './pixelart/atlas';
import { planTuile, estMatiereEau, estMatiereGisement, MATIERE_EAU_SALEE, MATIERE_EAU_DOUCE } from './pixelart/planTuile';

// ============================================================
// Carte pixel art V1.2 — rendu sur le thread principal, purely
// piloté par les digests du worker. 1 tuile = tailleTuilePx px
// monde. Zoom par paliers nets, filtrage nearest-neighbor.
// ============================================================

export interface DigestCarte {
  couleurs: Uint32Array;
  tuiles: Uint32Array;
  chunkVersions: Uint32Array;
  chunkSize: number;
  nbChunksX: number;
  animaux: number[];
  individus: number[];
  vehicules: number[];
  batiments: number[];
  territoires: Array<{ id: number; couleur: number; tuiles: number[] }>;
  villages: Array<{ id: number; x: number; y: number; couleur: number }>;
  especes: string[];
  typesBatiments: string[];
  saisonNord: number;
  saisonSud: number;
  taille: number;
}

interface Chunk {
  sprite: Sprite;
  canvas: HTMLCanvasElement;
  tex: Texture;
  version: number;
  dirty: boolean;
}

interface Entite {
  id: number;
  x: number;
  y: number;
  sprite: Sprite;
  marqueurs: Sprite[];
  anime: boolean;
  cleBase: string;
  frameActuelle: number;
  teinte: number;
  cheveuxVal: number | null;
  grossesse: boolean;
  mobile: boolean;
  enMouvement: boolean;
}

const GISEMENT_PAR_TYPE_MINE: Record<string, number> = {
  'mine-fer': 9,
  'mine-cuivre': 10,
  'mine-etain': 11,
  'mine-or': 12,
  'mine-argent': 13,
  'mine-sel': 14,
  'mine-charbon': 5,
  'mine-uranium': 7,
  'puits-gaz': 6,
  'puits-petrole': 8,
};

export class CartePixel {
  app: Application;
  monde: Container;
  tailleMonde: number;
  private T: number;
  private config: ConfigComplete;
  private rendu: ConfigRendu;
  private atlas: Atlas;
  private atlasCanvas: HTMLCanvasElement;
  private atlasTex: Texture;
  private texSprites = new Map<string, Texture>();
  private texHumains = new Map<string, Texture>();

  private coucheChunks: Container;
  private coucheTerritoires: Graphics;
  private coucheVagues: Container;
  private coucheEntites: Container;
  private coucheOverlay: Graphics;
  private coucheMeteo: Graphics;

  private chunks = new Map<number, Chunk>();
  private lru: number[] = [];
  private fileRendu: number[] = [];

  private digest: DigestCarte | null = null;
  private palierIdx = 0;
  private animFrame = 0;
  private dernierFrame = -1;
  private dernierFrameMeteo = -1;
  private dernierRebuildVagues = 0;
  private positionsPrecedentes = new Map<number, [number, number]>();

  private entites: Entite[] = [];
  private vagues = new Map<number, Sprite>();
  private vaguesDirty = true;
  private selectionId: number | null = null;
  private survol: { x: number; y: number } | null = null;
  private favoris = new Set<number>();

  private minicarte: HTMLCanvasElement;
  private minicarteCtx: CanvasRenderingContext2D;
  private imageMinicarte: ImageData | null = null;
  private meteoDominante: { pluie: number; neige: number; nuage: number } = { pluie: 0, neige: 0, nuage: 0 };

  private constructor(app: Application, hote: HTMLElement, config: ConfigComplete, rendu: ConfigRendu) {
    this.app = app;
    this.config = config;
    this.rendu = rendu;
    this.T = rendu.tailleTuilePx;
    this.tailleMonde = config.monde.tailleGrille;
    this.atlas = genererAtlas(rendu);
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = this.atlas.largeur;
    this.atlasCanvas.height = this.atlas.hauteur;
    this.atlasCanvas.getContext('2d')!.putImageData(
      new ImageData(this.atlas.pixels, this.atlas.largeur, this.atlas.hauteur),
      0,
      0,
    );
    this.atlasTex = Texture.from(this.atlasCanvas);
    this.atlasTex.source.scaleMode = 'nearest';

    this.monde = new Container();
    this.coucheChunks = new Container();
    this.coucheTerritoires = new Graphics();
    this.coucheVagues = new Container();
    this.coucheEntites = new Container();
    this.coucheOverlay = new Graphics();
    this.monde.addChild(this.coucheChunks);
    this.monde.addChild(this.coucheTerritoires);
    this.monde.addChild(this.coucheVagues);
    this.monde.addChild(this.coucheEntites);
    this.monde.addChild(this.coucheOverlay);
    app.stage.addChild(this.monde);
    this.coucheMeteo = new Graphics();
    app.stage.addChild(this.coucheMeteo);

    this.minicarte = document.createElement('canvas');
    this.minicarte.id = 'minicarte';
    this.minicarte.width = this.tailleMonde;
    this.minicarte.height = this.tailleMonde;
    this.minicarte.style.width = `${rendu.minicarte.taillePx}px`;
    this.minicarte.style.height = `${rendu.minicarte.taillePx}px`;
    hote.parentElement?.appendChild(this.minicarte);
    this.minicarteCtx = this.minicarte.getContext('2d')!;

    app.ticker.add((ticker) => this.tick(ticker.lastTime));
    this.centrer();
  }

  static async creer(hote: HTMLElement, config: ConfigComplete, rendu: ConfigRendu): Promise<CartePixel> {
    const app = new Application();
    await app.init({ resizeTo: window, background: 0x0b0e13, antialias: false, preference: 'webgl' });
    hote.appendChild(app.canvas as HTMLCanvasElement);
    return new CartePixel(app, hote, config, rendu);
  }

  private texSprite(cle: string, frame: number = 0): Texture | null {
    const s = this.atlas.sprites[cle];
    if (!s) return null;
    const key = `${cle}#${frame}`;
    let t = this.texSprites.get(key);
    if (!t) {
      t = new Texture({ source: this.atlasTex.source, frame: new Rectangle(s.x + frame * s.w, s.y, s.w, s.h) });
      this.texSprites.set(key, t);
    }
    return t;
  }

  private texHumain(teinte: number, cheveux: number | null, tuniqueId: number, frame: number, grossesse: boolean): Texture {
    const tQ = Math.round(teinte / 5);
    const cQ = cheveux === null ? -1 : Math.round(cheveux / 10);
    const key = `${tQ}|${cQ}|${tuniqueId}|${frame}|${grossesse ? 1 : 0}`;
    let t = this.texHumains.get(key);
    if (t) return t;
    const P = this.rendu.palettes;
    const h = cheveux === null ? 5 : 6;
    const w = this.rendu.taillesSprites.humain[0];
    const c = new Canevas(w, h);
    peindreHumain(c, {
      peau: couleurPeau(teinte, P.peau),
      tunique: couleurTunique(tuniqueId, P),
      cheveux: cheveux === null ? undefined : couleurCheveuxValeur(cheveux, P),
      frame,
      grossesse,
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.putImageData(new ImageData(c.px, w, h), 0, 0);
    t = Texture.from(canvas);
    t.source.scaleMode = 'nearest';
    if (this.texHumains.size > 4000) this.texHumains.clear();
    this.texHumains.set(key, t);
    return t;
  }

  // ---------- Vue ----------

  get pxParTuile(): number {
    return this.rendu.paliersZoomPxParTuile[this.palierIdx];
  }

  private get echelle(): number {
    return this.pxParTuile / this.T;
  }

  centrer(): void {
    const s = this.echelle;
    this.monde.scale.set(s);
    this.monde.position.set(
      (this.app.screen.width - this.tailleMonde * this.T * s) / 2,
      (this.app.screen.height - this.tailleMonde * this.T * s) / 2 + 22,
    );
    this.apresChangementVue();
  }

  zoomPalier(sx: number, sy: number, dir: 1 | -1): void {
    const nouveauIdx = Math.max(0, Math.min(this.rendu.paliersZoomPxParTuile.length - 1, this.palierIdx + dir));
    if (nouveauIdx === this.palierIdx) return;
    const ancien = this.echelle;
    const nouveau = this.rendu.paliersZoomPxParTuile[nouveauIdx] / this.T;
    const mx = (sx - this.monde.x) / ancien;
    const my = (sy - this.monde.y) / ancien;
    this.palierIdx = nouveauIdx;
    this.monde.scale.set(nouveau);
    this.monde.x = sx - mx * nouveau;
    this.monde.y = sy - my * nouveau;
    this.apresChangementVue();
  }

  deplacer(dx: number, dy: number): void {
    this.monde.x += dx;
    this.monde.y += dy;
    this.apresChangementVue();
  }

  ecranVersMonde(sx: number, sy: number): { x: number; y: number } {
    return {
      x: ((sx - this.monde.x) / this.echelle) / this.T,
      y: ((sy - this.monde.y) / this.echelle) / this.T,
    };
  }

  centrerSurTuile(x: number, y: number): void {
    const s = this.echelle;
    this.monde.x = this.app.screen.width / 2 - x * this.T * s;
    this.monde.y = this.app.screen.height / 2 - y * this.T * s;
    this.apresChangementVue();
  }

  tuilesVisibles(): { x0: number; y0: number; x1: number; y1: number } {
    const s = this.echelle;
    const t = this.tailleMonde;
    return {
      x0: Math.max(0, Math.floor((-this.monde.x / s) / this.T)),
      y0: Math.max(0, Math.floor((-this.monde.y / s) / this.T)),
      x1: Math.min(t - 1, Math.ceil((this.app.screen.width - this.monde.x) / s / this.T)),
      y1: Math.min(t - 1, Math.ceil((this.app.screen.height - this.monde.y) / s / this.T)),
    };
  }

  private apresChangementVue(): void {
    this.vaguesDirty = true;
    this.mettreAJourVisibilite();
    this.appliquerTerritoiresVisibles();
    this.redessinerMinicarte();
  }

  private mettreAJourVisibilite(): void {
    const s = this.echelle;
    const pad = 32;
    const vx0 = -this.monde.x / s - pad;
    const vy0 = -this.monde.y / s - pad;
    const vx1 = (this.app.screen.width - this.monde.x) / s + pad;
    const vy1 = (this.app.screen.height - this.monde.y) / s + pad;
    for (const e of this.entites) {
      const x = e.x * this.T;
      const y = e.y * this.T;
      e.sprite.visible = x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
      for (const m of e.marqueurs) m.visible = e.sprite.visible;
    }
  }

  // ---------- Digest ----------

  appliquerDigest(msg: Record<string, unknown>): void {
    const d: DigestCarte = {
      couleurs: new Uint32Array(msg.couleurs as ArrayBuffer),
      tuiles: new Uint32Array(msg.tuiles as ArrayBuffer),
      chunkVersions: new Uint32Array(msg.chunkVersions as ArrayBuffer),
      chunkSize: msg.chunkSize as number,
      nbChunksX: msg.nbChunksX as number,
      animaux: (msg.animaux as number[]) ?? [],
      individus: (msg.individus as number[]) ?? [],
      vehicules: (msg.vehicules as number[]) ?? [],
      batiments: (msg.batiments as number[]) ?? [],
      territoires: (msg.territoires as DigestCarte['territoires']) ?? [],
      villages: (msg.villages as DigestCarte['villages']) ?? [],
      especes: (msg.especes as string[]) ?? [],
      typesBatiments: (msg.typesBatiments as string[]) ?? [],
      saisonNord: msg.saisonNord as number,
      saisonSud: msg.saisonSud as number,
      taille: msg.taille as number,
    };
    this.digest = d;
    this.imageMinicarte = null;

    let pluie = 0;
    let neige = 0;
    let nuage = 0;
    for (let i = 0; i < d.tuiles.length; i++) {
      const m = decoderMot(d.tuiles[i]).meteo;
      if (m === 2) pluie++;
      else if (m === 3) neige++;
      else if (m === 1) nuage++;
    }
    const n = Math.max(1, d.tuiles.length);
    this.meteoDominante = { pluie: pluie / n, neige: neige / n, nuage: nuage / n };

    const nbChunks = d.chunkVersions.length;
    for (let c = 0; c < nbChunks; c++) {
      const ex = this.chunks.get(c);
      if (!ex) {
        this.fileRendu.push(c);
      } else if (ex.version !== d.chunkVersions[c]) {
        ex.version = d.chunkVersions[c];
        ex.dirty = true;
        this.fileRendu.push(c);
      }
    }
    this.vaguesDirty = true;
    this.appliquerEntites();
    this.appliquerTerritoires();
    this.redessinerMinicarte();
    this.assurerChunksVisibles();
    this.mettreAJourVisibilite();
  }

  definirSelection(id: number | null): void {
    this.selectionId = id;
  }

  definirFavoris(f: Set<number>): void {
    this.favoris = new Set(f);
    this.appliquerEntites();
  }

  definirSurvol(sx: number, sy: number): void {
    const p = this.ecranVersMonde(sx, sy);
    this.survol = { x: Math.floor(p.x), y: Math.floor(p.y) };
  }

  // ---------- Chunks ----------

  private assurerChunksVisibles(): void {
    if (!this.digest) return;
    const s = this.echelle;
    const cs = this.digest.chunkSize;
    const t = this.tailleMonde;
    const px = cs * this.T;
    const vx0 = Math.max(0, Math.floor((-this.monde.x / s) / px));
    const vy0 = Math.max(0, Math.floor((-this.monde.y / s) / px));
    const vx1 = Math.min(Math.ceil(t / cs) - 1, Math.floor((this.app.screen.width - this.monde.x) / s / px));
    const vy1 = Math.min(Math.ceil(t / cs) - 1, Math.floor((this.app.screen.height - this.monde.y) / s / px));
    let rendus = 0;
    const file = this.fileRendu;
    this.fileRendu = [];
    for (let i = 0; i < file.length; i++) {
      const c = file[i];
      const cx = c % this.digest.nbChunksX;
      const cy = Math.floor(c / this.digest.nbChunksX);
      if (cx < vx0 - 1 || cx > vx1 + 1 || cy < vy0 - 1 || cy > vy1 + 1) {
        this.fileRendu.push(c);
        continue;
      }
      this.rendreChunk(cx, cy);
      if (++rendus >= 6 && i < file.length - 1) {
        for (let j = i + 1; j < file.length; j++) this.fileRendu.push(file[j]);
        break;
      }
    }
    for (let cy = vy0; cy <= vy1; cy++) {
      for (let cx = vx0; cx <= vx1; cx++) {
        const c = cy * this.digest.nbChunksX + cx;
        const ex = this.chunks.get(c);
        if (!ex || ex.dirty) this.rendreChunk(cx, cy);
      }
    }
  }

  private rendreChunk(cx: number, cy: number): void {
    if (!this.digest) return;
    const d = this.digest;
    const cs = d.chunkSize;
    const t = this.tailleMonde;
    const T = this.T;
    const px = cs * T;
    const c = cy * d.nbChunksX + cx;
    let chunk = this.chunks.get(c);
    if (!chunk) {
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const tex = Texture.from(canvas);
      tex.source.scaleMode = 'nearest';
      const sprite = new Sprite(tex);
      sprite.position.set(cx * px, cy * px);
      this.coucheChunks.addChild(sprite);
      chunk = { sprite, canvas, tex, version: 0, dirty: true };
      this.chunks.set(c, chunk);
      this.lru.push(c);
      if (this.chunks.size > this.rendu.maxChunkCache) {
        const vieux = this.lru.shift()!;
        const ex = this.chunks.get(vieux);
        if (ex) {
          this.coucheChunks.removeChild(ex.sprite);
          ex.tex.destroy();
          this.chunks.delete(vieux);
        }
      }
    }
    chunk.version = d.chunkVersions[c];
    chunk.dirty = false;
    const idx = this.lru.indexOf(c);
    if (idx >= 0) this.lru.splice(idx, 1);
    this.lru.push(c);

    const ctx = chunk.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, px, px);
    const saisonIdxNord = saisonVersIndexPalette(d.saisonNord);
    const saisonIdxSud = saisonVersIndexPalette(d.saisonSud);
    for (let ty = 0; ty < cs; ty++) {
      const y = cy * cs + ty;
      if (y >= t) break;
      for (let tx = 0; tx < cs; tx++) {
        const x = cx * cs + tx;
        if (x >= t) break;
        const i = y * t + x;
        const mot = d.tuiles[i];
        const dd = decoderMot(mot);
        const eGauche = x > 0 ? decoderMot(d.tuiles[i - 1]).elevation : dd.elevation;
        const eHaut = y > 0 ? decoderMot(d.tuiles[i - t]).elevation : dd.elevation;
        const terre = (ii: number) => ii >= 0 && ii < d.tuiles.length && !estMatiereEau(decoderMot(d.tuiles[ii]).matiere);
        const terreHaut = y > 0 && terre(i - t);
        const terreBas = y < t - 1 && terre(i + t);
        const terreGauche = x > 0 && terre(i - 1);
        const terreDroite = x < t - 1 && terre(i + 1);
        let profond = false;
        if (dd.matiere === MATIERE_EAU_SALEE) {
          profond = true;
          for (let dy = -1; dy <= 1 && profond; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= t || ny >= t) continue;
              if (decoderMot(d.tuiles[ny * t + nx]).matiere !== MATIERE_EAU_SALEE) {
                profond = false;
                break;
              }
            }
          }
        }
        const plan = planTuile(mot, {
          x,
          y,
          eGauche,
          eHaut,
          terreHaut,
          terreBas,
          terreGauche,
          terreDroite,
          profond,
          saisonIdx: y < t / 2 ? saisonIdxNord : saisonIdxSud,
          rendu: this.rendu,
        });
        const s = this.atlas.sprites[plan.sprite];
        if (s) {
          ctx.drawImage(this.atlasCanvas, s.x, s.y, s.w, s.h, tx * T, ty * T, T, T);
        }
        for (const r of plan.rects) {
          ctx.globalAlpha = r.a;
          ctx.fillStyle = r.c;
          ctx.fillRect(tx * T + r.x, ty * T + r.y, r.w, r.h);
        }
        ctx.globalAlpha = 1;
      }
    }
    chunk.tex.source.update();
  }

  // ---------- Territoires ----------

  private appliquerTerritoires(): void {
    if (!this.digest) return;
    const g = this.coucheTerritoires;
    g.clear();
    const T = this.T;
    for (const ter of this.digest.territoires) {
      const ensemble = new Set<number>();
      for (let i = 0; i + 1 < ter.tuiles.length; i += 2) ensemble.add(ter.tuiles[i + 1] * this.tailleMonde + ter.tuiles[i]);
      for (let i = 0; i + 1 < ter.tuiles.length; i += 2) {
        const x = ter.tuiles[i];
        const y = ter.tuiles[i + 1];
        g.rect(x * T, y * T, T, T).fill({ color: ter.couleur, alpha: 0.22 });
        if (!ensemble.has(y * this.tailleMonde + x - 1)) g.rect(x * T, y * T, 1, T).fill({ color: ter.couleur, alpha: 0.9 });
        if (!ensemble.has(y * this.tailleMonde + x + 1)) g.rect(x * T + T - 1, y * T, 1, T).fill({ color: ter.couleur, alpha: 0.9 });
        if (!ensemble.has((y - 1) * this.tailleMonde + x)) g.rect(x * T, y * T, T, 1).fill({ color: ter.couleur, alpha: 0.9 });
        if (!ensemble.has((y + 1) * this.tailleMonde + x)) g.rect(x * T, y * T + T - 1, T, 1).fill({ color: ter.couleur, alpha: 0.9 });
      }
    }
    this.appliquerTerritoiresVisibles();
  }

  private appliquerTerritoiresVisibles(): void {
    this.coucheTerritoires.visible = this.pxParTuile < this.rendu.seuils.frontieresPxParTuile;
  }

  // ---------- Entités ----------

  private appliquerEntites(): void {
    if (!this.digest) return;
    const d = this.digest;
    const T = this.T;
    const Z = this.pxParTuile;
    const complets = Z >= this.rendu.seuils.spritesCompletsPxParTuile;
    const cheveuxVisibles = Z >= this.rendu.seuils.cheveuxPxParTuile;
    const couche = this.coucheEntites;
    const utilises = new Set<number>();

    const obtenir = (i: number, id: number): Entite => {
      let e = this.entites[i];
      if (!e) {
        e = { id, x: 0, y: 0, sprite: new Sprite(), marqueurs: [], anime: false, cleBase: '', frameActuelle: 0, teinte: 0, cheveuxVal: null, grossesse: false, mobile: false, enMouvement: false };
        this.entites[i] = e;
        couche.addChild(e.sprite);
      }
      e.id = id;
      utilises.add(i);
      return e;
    };

    let i = 0;
    const nouvellesPositions = new Map<number, [number, number]>();
    // Animaux : id, x*10, y*10, especeIdx, flags
    for (let k = 0; k + 4 < d.animaux.length; k += 5) {
      const id = d.animaux[k];
      const x = d.animaux[k + 1] / 10;
      const y = d.animaux[k + 2] / 10;
      const especeIdx = d.animaux[k + 3];
      const domestique = (d.animaux[k + 4] & 1) !== 0;
      const e = obtenir(i++, id);
      e.x = x;
      e.y = y;
      const espece = d.especes[especeIdx] ?? '?';
      const precedent = this.positionsPrecedentes.get(id);
      const enMouvement = precedent !== undefined && Math.hypot(x - precedent[0], y - precedent[1]) > 0.02;
      nouvellesPositions.set(id, [x, y]);
      let cle: string;
      if (!complets) {
        cle = `marqueur:espece:${espece}`;
        e.sprite.position.set(x * T - 1, y * T - 1);
      } else if (espece === 'vautour') {
        cle = 'espece:vautour';
        e.sprite.position.set(x * T - 2, y * T - 2);
      } else {
        cle = `espece:${espece}`;
        e.sprite.position.set(x * T - 2, y * T - 2);
      }
      e.cleBase = cle;
      // Le vautour vole en permanence (battement d'ailes = animation intrinsèque),
      // les autres animaux ne s'animent que s'ils se déplacent.
      e.mobile = espece !== 'vautour';
      e.enMouvement = enMouvement;
      e.anime = complets && (espece === 'vautour' || !domestique);
      e.frameActuelle = !e.anime || !enMouvement ? 0 : this.animFrame;
      const tex = this.texSprite(cle, e.frameActuelle);
      if (tex) e.sprite.texture = tex;
      this.ajusterMarqueurs(e, null, false, false, cheveuxVisibles);
      if (complets && espece === 'vautour') {
        let ombre = e.marqueurs.find((m) => m.texture === this.texSprite('espece:vautour:ombre'));
        if (!ombre) {
          ombre = new Sprite(this.texSprite('espece:vautour:ombre')!);
          e.marqueurs.push(ombre);
          couche.addChild(ombre);
        }
        ombre.position.set(x * T - 1 + 2, y * T - 2 + 3);
      }
    }
    // Humains : id, x*10, y*10, teinte, cheveux, flags
    for (let k = 0; k + 5 < d.individus.length; k += 6) {
      const id = d.individus[k];
      const x = d.individus[k + 1] / 10;
      const y = d.individus[k + 2] / 10;
      const teinte = d.individus[k + 3];
      const cheveux = d.individus[k + 4];
      const flags = d.individus[k + 5];
      const dirigeant = (flags & 1) !== 0;
      const grossesse = (flags & 2) !== 0;
      const e = obtenir(i++, id);
      e.x = x;
      e.y = y;
      const precedent = this.positionsPrecedentes.get(id);
      const enMouvement = precedent !== undefined && Math.hypot(x - precedent[0], y - precedent[1]) > 0.02;
      nouvellesPositions.set(id, [x, y]);
      e.teinte = teinte;
      e.cheveuxVal = cheveuxVisibles ? cheveux : null;
      e.grossesse = grossesse;
      if (!complets) {
        e.cleBase = 'marqueur:humain';
        e.anime = false;
        e.mobile = true;
        e.enMouvement = enMouvement;
        e.frameActuelle = 0;
        const tex = this.texSprite('marqueur:humain');
        if (tex) e.sprite.texture = tex;
        e.sprite.position.set(x * T - 1, y * T - 1);
        this.ajusterMarqueurs(e, null, false, false, false);
      } else {
        e.cleBase = 'humain';
        e.mobile = true;
        e.enMouvement = enMouvement;
        e.anime = enMouvement;
        e.frameActuelle = enMouvement ? this.animFrame : 0;
        e.sprite.texture = this.texHumain(teinte, e.cheveuxVal, id, e.frameActuelle, grossesse);
        e.sprite.position.set(x * T - 1, y * T - 2);
        this.ajusterMarqueurs(e, this.favoris.has(id) ? 'marqueur:favori' : null, dirigeant, true, cheveuxVisibles);
      }
    }
    // Véhicules : id, x*10, y*10, typeIdx
    for (let k = 0; k + 3 < d.vehicules.length; k += 4) {
      const id = d.vehicules[k];
      const x = d.vehicules[k + 1] / 10;
      const y = d.vehicules[k + 2] / 10;
      const type = d.typesBatiments[d.vehicules[k + 3]] ?? '?';
      const e = obtenir(i++, id);
      e.x = x;
      e.y = y;
      const precedent = this.positionsPrecedentes.get(id);
      const enMouvement = precedent !== undefined && Math.hypot(x - precedent[0], y - precedent[1]) > 0.02;
      nouvellesPositions.set(id, [x, y]);
      if (!complets) {
        e.cleBase = 'marqueur:vehicule';
        e.anime = false;
        e.mobile = true;
        e.enMouvement = enMouvement;
        e.frameActuelle = 0;
        const tex = this.texSprite('marqueur:vehicule');
        if (tex) e.sprite.texture = tex;
        e.sprite.position.set(x * T - 1, y * T - 1);
      } else {
        e.cleBase = `bat:${type}`;
        e.mobile = true;
        e.enMouvement = enMouvement;
        e.anime = enMouvement;
        e.frameActuelle = enMouvement ? this.animFrame : 0;
        const s = this.atlas.sprites[e.cleBase];
        const tex = this.texSprite(e.cleBase, e.frameActuelle);
        if (tex) e.sprite.texture = tex;
        e.sprite.position.set(x * T - Math.round((s?.w ?? 8) / 2 / (s?.frames ?? 1)), y * T - Math.round((s?.h ?? 8) / 2));
      }
      this.ajusterMarqueurs(e, null, false, false, false);
    }
    // Bâtiments : id, x, y, typeIdx, durabilite, flags
    for (let k = 0; k + 5 < d.batiments.length; k += 6) {
      const id = d.batiments[k];
      const x = d.batiments[k + 1];
      const y = d.batiments[k + 2];
      const type = d.typesBatiments[d.batiments[k + 3]] ?? '?';
      const durabilite = d.batiments[k + 4];
      const enConstruction = (d.batiments[k + 5] & 1) !== 0;
      const e = obtenir(i++, id);
      e.x = x;
      e.y = y;
      let cle: string;
      if (!complets) {
        cle = `marqueur:bat:${type}`;
        const tex = this.texSprite(cle);
        if (tex) e.sprite.texture = tex;
        e.sprite.position.set(x * T - 2, y * T - 2);
        e.anime = false;
      } else if (enConstruction) {
        cle = `bat:${type}:chantier`;
        const tex = this.texSprite(cle);
        if (tex) e.sprite.texture = tex;
        const s = this.atlas.sprites[cle];
        e.sprite.position.set(x * T - Math.round((s?.w ?? 8) / 2), y * T - Math.round((s?.h ?? 8) / 2));
        e.anime = false;
      } else {
        const mot = d.tuiles[y * this.tailleMonde + x] ?? 0;
        const dm = decoderMot(mot);
        const gisementAttendu = GISEMENT_PAR_TYPE_MINE[type];
        if (gisementAttendu !== undefined && estMatiereGisement(dm.matiere) === false) {
          cle = `bat:${type}:muree`;
        } else if (gisementAttendu !== undefined && dm.matiere !== gisementAttendu) {
          cle = `bat:${type}:muree`;
        } else if (type === 'champ' && dm.biomasseQ >= 40) {
          cle = 'bat:champ:mature';
        } else if (durabilite <= 35) {
          cle = `bat:${type}:ruine`;
        } else {
          cle = `bat:${type}`;
        }
        e.cleBase = cle;
        e.mobile = false;
        e.enMouvement = false;
        e.anime = (this.atlas.sprites[cle]?.frames ?? 1) > 1;
        e.frameActuelle = 0;
        const s = this.atlas.sprites[cle];
        const tex = this.texSprite(cle, 0);
        if (tex) e.sprite.texture = tex;
        e.sprite.position.set(x * T - Math.round((s?.w ?? 8) / (s?.frames ?? 1) / 2), y * T - Math.round((s?.h ?? 8) / 2));
      }
      this.ajusterMarqueurs(e, null, false, false, false);
    }

    for (let k = this.entites.length - 1; k >= 0; k--) {
      if (!utilises.has(k)) {
        const e = this.entites[k];
        couche.removeChild(e.sprite);
        for (const m of e.marqueurs) couche.removeChild(m);
        this.entites.splice(k, 1);
      }
    }
    this.positionsPrecedentes = nouvellesPositions;
    this.mettreAJourVisibilite();
  }

  private ajusterMarqueurs(e: Entite, favori: string | null, dirigeant: boolean, auDessus: boolean, _cheveux: boolean): void {
    const couche = this.coucheEntites;
    for (const m of e.marqueurs) couche.removeChild(m);
    e.marqueurs = [];
    if (favori) {
      const s = new Sprite(this.texSprite(favori)!);
      s.position.set(e.x * this.T + 1, e.y * this.T - 3);
      e.marqueurs.push(s);
      couche.addChild(s);
    }
    if (dirigeant) {
      const s = new Sprite(this.texSprite('marqueur:dirigeant')!);
      s.position.set(e.x * this.T - 1, e.y * this.T - 3);
      e.marqueurs.push(s);
      couche.addChild(s);
    }
    void auDessus;
  }

  // ---------- Vagues animées ----------

  private reconstruireVagues(): void {
    if (!this.digest) return;
    this.coucheVagues.removeChildren();
    this.vagues.clear();
    if (this.pxParTuile < this.rendu.seuils.vaguesPxParTuile) return;
    const d = this.digest;
    const t = this.tailleMonde;
    const T = this.T;
    const v = this.tuilesVisibles();
    for (let y = v.y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        const i = y * t + x;
        const dm = decoderMot(d.tuiles[i]);
        if (!estMatiereEau(dm.matiere) || dm.gele) continue;
        if (dm.matiere === MATIERE_EAU_SALEE || dm.matiere === MATIERE_EAU_DOUCE) {
          const variante = hashTuile(x, y) % this.rendu.variantesParTuile;
          const tex = this.texSprite(`tuile:eau:v${variante}`, 0);
          if (!tex) continue;
          const s = new Sprite(tex);
          s.position.set(x * T, y * T);
          this.coucheVagues.addChild(s);
          this.vagues.set(i, s);
        }
      }
    }
    this.vaguesDirty = false;
  }

  // ---------- Minicarte ----------

  private redessinerMinicarte(): void {
    if (!this.digest) return;
    const d = this.digest;
    const t = this.tailleMonde;
    if (!this.imageMinicarte || this.imageMinicarte.width !== t) {
      this.imageMinicarte = this.minicarteCtx.createImageData(t, t);
    }
    this.imageMinicarte.data.set(new Uint8Array(d.couleurs.buffer, d.couleurs.byteOffset, d.couleurs.byteLength));
    this.minicarteCtx.putImageData(this.imageMinicarte, 0, 0);
    const ctx = this.minicarteCtx;
    const s = this.echelle;
    const vx = -this.monde.x / s / this.T;
    const vy = -this.monde.y / s / this.T;
    const vw = this.app.screen.width / s / this.T;
    const vh = this.app.screen.height / s / this.T;
    ctx.strokeStyle = this.rendu.minicarte.couleurVue;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(vx, vy, vw, vh);
    const m = this.rendu.minicarte.tailleMarqueurVillage;
    for (const v of d.villages) {
      ctx.fillStyle = `#${v.couleur.toString(16).padStart(6, '0')}`;
      ctx.fillRect(Math.round(v.x) - m / 2, Math.round(v.y) - m / 2, m, m);
    }
    ctx.globalAlpha = 1;
  }

  minicarteVersMonde(offsetX: number, offsetY: number): { x: number; y: number } {
    const rect = this.minicarte.getBoundingClientRect();
    return {
      x: ((offsetX - rect.left) / rect.width) * this.tailleMonde,
      y: ((offsetY - rect.top) / rect.height) * this.tailleMonde,
    };
  }

  get canvasMinicarte(): HTMLCanvasElement {
    return this.minicarte;
  }

  // ---------- Boucle d'animation ----------

  private tick(tempsMs: number): void {
    const frame = Math.floor(tempsMs / this.rendu.animations.msParFrame) % 2;
    if (frame !== this.dernierFrame) {
      this.dernierFrame = frame;
      this.animFrame = frame;
      for (const e of this.entites) {
        if (!e.sprite.visible) continue;
        // Entités mobiles : on n'alternance que si l'entité bouge vraiment,
        // sinon frame de repos (0) — jamais de scintillement sur place.
        // Bâtiments animés (feu, forge, moulin, cheminées, vautour) : animation
        // intrinsèque, ils continuent de tourner même immobiles.
        const f = e.mobile ? (e.enMouvement ? frame : 0) : frame;
        if (!e.anime && !(e.mobile && e.frameActuelle !== 0)) continue;
        if (f === e.frameActuelle) continue;
        e.frameActuelle = f;
        if (e.cleBase === 'humain') {
          e.sprite.texture = this.texHumain(e.teinte, e.cheveuxVal, e.id, f, e.grossesse);
          continue;
        }
        const tex = this.texSprite(e.cleBase, f);
        if (tex) e.sprite.texture = tex;
      }
      for (const s of this.vagues.values()) {
        const pos = s.position;
        const t = this.tailleMonde;
        const i = Math.floor(pos.y / this.T) * t + Math.floor(pos.x / this.T);
        const variante = hashTuile(Math.floor(pos.x / this.T), Math.floor(pos.y / this.T)) % this.rendu.variantesParTuile;
        const tex = this.texSprite(`tuile:eau:v${variante}`, frame);
        void i;
        if (tex) s.texture = tex;
      }
    }
    const frameMeteo = Math.floor(tempsMs / this.rendu.animations.msParFrameMeteo);
    if (frameMeteo !== this.dernierFrameMeteo) {
      this.dernierFrameMeteo = frameMeteo;
      this.dessinerMeteo(frameMeteo);
    }
    if (this.vaguesDirty && tempsMs - this.dernierRebuildVagues > 300) {
      this.dernierRebuildVagues = tempsMs;
      this.reconstruireVagues();
    }
    this.assurerChunksVisibles();
    this.dessinerOverlay(tempsMs);
  }

  private dessinerMeteo(frame: number): void {
    const g = this.coucheMeteo;
    g.clear();
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const A = this.rendu.animations;
    const m = this.meteoDominante;
    // Graine fixe par élément (hash de l'index seul) + dérive continue selon la
    // frame : les précipitations tombent/dérivent sans jamais "sauter" (anti-scintillement).
    if (m.pluie > 0.12) {
      for (let i = 0; i < A.pluieTraits; i++) {
        const h = hashTuile(i * 7 + 1, 7);
        const x = (h % 1000) / 1000 * (W + 40) - 20 + frame * 6;
        const y = ((h >> 10) % 1000) / 1000 * H;
        g.moveTo(x, y).lineTo(x - 4, y + 10).stroke({ width: 1, color: 0x7896dc, alpha: 0.35 });
      }
    } else if (m.neige > 0.12) {
      for (let i = 0; i < A.neigePoints; i++) {
        const h = hashTuile(i * 13 + 3, 11);
        const x = (h % 1000) / 1000 * W;
        const y = (((h >> 10) % 1000) / 1000 * H + frame * 22) % H;
        g.circle(x, y, 1).fill({ color: 0xffffff, alpha: 0.8 });
      }
    } else if (m.nuage > 0.2) {
      for (let i = 0; i < A.nuages; i++) {
        const h = hashTuile(i * 31 + 5, 99);
        const x = (((h % 1000) / 1000) * (W + 400) - (frame * 8 + i * 137) % (W + 400) + (W + 400)) % (W + 400) - 200;
        const y = ((h >> 10) % 1000) / 1000 * H;
        g.ellipse(x, y, 140 + (h % 100), 60 + ((h >> 5) % 60)).fill({ color: 0x141820, alpha: 0.16 });
      }
    }
  }

  private dessinerOverlay(tempsMs: number): void {
    const g = this.coucheOverlay;
    g.clear();
    const T = this.T;
    const epaisseur = Math.max(0.5, T / this.pxParTuile);
    if (this.survol && this.survol.x >= 0 && this.survol.y >= 0 && this.survol.x < this.tailleMonde && this.survol.y < this.tailleMonde) {
      g.rect(this.survol.x * T, this.survol.y * T, T, T).stroke({
        width: epaisseur,
        color: this.hexaVersEntier(this.rendu.palettes.contourSurvol),
        alpha: 0.6,
      });
    }
    if (this.selectionId !== null) {
      const e = this.entites.find((x) => x.id === this.selectionId);
      if (e) {
        const clignote = 0.45 + 0.45 * Math.sin(tempsMs / 160);
        g.rect(e.sprite.x, e.sprite.y, e.sprite.width, e.sprite.height).stroke({
          width: epaisseur,
          color: this.hexaVersEntier(this.rendu.palettes.contourSelection),
          alpha: clignote,
        });
      }
    }
  }

  private hexaVersEntier(hex: string): number {
    return parseInt(hex.slice(1), 16);
  }
}
