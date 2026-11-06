import { Matiere, Vegetation, Meteo, estEau, estGisement } from '../types';
import { empreinteOctets } from '../hash';
import type { ConfigMonde } from '../config/schema';
import { Tuile } from './tuile';

export class Monde {
  readonly taille: number;
  readonly niveauxMax: number;
  readonly elevation: Uint8Array;
  readonly matiere: Uint8Array;
  readonly quantiteGisement: Float32Array;
  readonly temperature: Float32Array;
  readonly humidite: Float32Array;
  readonly vegetation: Uint8Array;
  readonly biomasseVegetation: Float32Array;
  readonly meteo: Uint8Array;
  readonly gele: Uint8Array;
  readonly pollution: Float32Array;
  readonly carcasseNourriture: Float32Array;
  readonly passage: Uint16Array;

  constructor(config: ConfigMonde) {
    this.taille = config.tailleGrille;
    this.niveauxMax = config.niveauxElevationMax;
    const n = this.taille * this.taille;
    this.elevation = new Uint8Array(n);
    this.matiere = new Uint8Array(this.niveauxMax * n).fill(Matiere.Vide);
    this.quantiteGisement = new Float32Array(this.niveauxMax * n);
    this.temperature = new Float32Array(n);
    this.humidite = new Float32Array(n);
    this.vegetation = new Uint8Array(n).fill(Vegetation.Aucun);
    this.biomasseVegetation = new Float32Array(n);
    this.meteo = new Uint8Array(n).fill(Meteo.Soleil);
    this.gele = new Uint8Array(n);
    this.pollution = new Float32Array(n);
    this.carcasseNourriture = new Float32Array(n);
    this.passage = new Uint16Array(n);
  }

  index(x: number, y: number): number {
    return y * this.taille + x;
  }

  indexNiveau(x: number, y: number, niveau: number): number {
    return niveau * this.taille * this.taille + this.index(x, y);
  }

  dansLimites(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.taille && y < this.taille;
  }

  estBord(x: number, y: number, epaisseur: number): boolean {
    return x < epaisseur || y < epaisseur || x >= this.taille - epaisseur || y >= this.taille - epaisseur;
  }

  tuile(x: number, y: number): Tuile {
    return new Tuile(this, x, y);
  }

  matiereNiveau(x: number, y: number, niveau: number): Matiere {
    return this.matiere[this.indexNiveau(x, y, niveau)];
  }

  poserNiveau(x: number, y: number, niveau: number, matiere: Matiere, quantiteGisement: number = 0): void {
    this.matiere[this.indexNiveau(x, y, niveau)] = matiere;
    this.quantiteGisement[this.indexNiveau(x, y, niveau)] = quantiteGisement;
    if (niveau > this.elevation[this.index(x, y)]) {
      this.elevation[this.index(x, y)] = niveau;
    }
  }

  elevationTuile(x: number, y: number): number {
    return this.elevation[this.index(x, y)];
  }

  estEau(x: number, y: number): boolean {
    return estEau(this.matiereNiveau(x, y, this.elevation[this.index(x, y)]));
  }

  estEauSalee(x: number, y: number): boolean {
    return this.matiereNiveau(x, y, this.elevation[this.index(x, y)]) === Matiere.EauSalee;
  }

  estGisementTuile(x: number, y: number): boolean {
    return estGisement(this.matiereNiveau(x, y, this.elevation[this.index(x, y)]));
  }

  distanceEquateur(y: number): number {
    return Math.abs(0.5 - y / this.taille) * 2;
  }

  estTraversable(x1: number, y1: number, x2: number, y2: number, aBateau: boolean): boolean {
    if (!this.dansLimites(x2, y2)) return false;
    const e1 = this.elevationTuile(x1, y1);
    const e2 = this.elevationTuile(x2, y2);
    if (Math.abs(e2 - e1) > 1) return false;
    const m2 = this.matiereNiveau(x2, y2, e2);
    if (m2 === Matiere.EauSalee) return aBateau;
    return true;
  }

  coutTraversee(x1: number, y1: number, x2: number, y2: number, aBateau: boolean): number {
    if (!this.estTraversable(x1, y1, x2, y2, aBateau)) return Infinity;
    const e1 = this.elevationTuile(x1, y1);
    const e2 = this.elevationTuile(x2, y2);
    let cout = 1;
    if (e2 > e1) cout += (e2 - e1) * 2;
    const m2 = this.matiereNiveau(x2, y2, e2);
    if (m2 === Matiere.EauDouce) cout += 2;
    if (m2 === Matiere.EauSalee) cout += 50;
    return cout;
  }

  voisins8(x: number, y: number): Array<[number, number]> {
    const res: Array<[number, number]> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.dansLimites(nx, ny)) res.push([nx, ny]);
      }
    }
    return res;
  }

  get empreinte(): string {
    let h = empreinteOctets(this.elevation);
    h += empreinteOctets(this.matiere);
    h += empreinteOctets(this.temperature);
    h += empreinteOctets(this.humidite);
    h += empreinteOctets(this.vegetation);
    h += empreinteOctets(this.meteo);
    h += empreinteOctets(this.gele);
    h += empreinteOctets(this.pollution);
    h += empreinteOctets(this.carcasseNourriture);
    h += empreinteOctets(this.passage);
    return h;
  }

  serialiser(): Record<string, unknown> {
    return {
      taille: this.taille,
      niveauxMax: this.niveauxMax,
      elevation: Array.from(this.elevation),
      matiere: Array.from(this.matiere),
      quantiteGisement: Array.from(this.quantiteGisement),
      temperature: Array.from(this.temperature),
      humidite: Array.from(this.humidite),
      vegetation: Array.from(this.vegetation),
      biomasseVegetation: Array.from(this.biomasseVegetation),
      meteo: Array.from(this.meteo),
      gele: Array.from(this.gele),
      pollution: Array.from(this.pollution),
      carcasseNourriture: Array.from(this.carcasseNourriture),
      passage: Array.from(this.passage),
    };
  }

  restaurer(d: Record<string, unknown>, config: ConfigMonde): void {
    const copie = (src: unknown, dst: Uint8Array | Uint16Array | Float32Array) => {
      const arr = src as number[];
      for (let i = 0; i < dst.length; i++) (dst as unknown as number[])[i] = arr[i];
    };
    copie(d.elevation, this.elevation);
    copie(d.matiere, this.matiere);
    copie(d.quantiteGisement, this.quantiteGisement);
    copie(d.temperature, this.temperature);
    copie(d.humidite, this.humidite);
    copie(d.vegetation, this.vegetation);
    copie(d.biomasseVegetation, this.biomasseVegetation);
    copie(d.meteo, this.meteo);
    copie(d.gele, this.gele);
    copie(d.pollution, this.pollution);
    copie(d.carcasseNourriture, this.carcasseNourriture);
    copie(d.passage, this.passage);
    void config;
  }
}
