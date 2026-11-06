import { Matiere, estEau, estGisement } from '../types';
import type { Monde } from './monde';

export class Tuile {
  constructor(
    private monde: Monde,
    readonly x: number,
    readonly y: number,
  ) {}

  get index(): number {
    return this.monde.index(this.x, this.y);
  }

  get elevationMax(): number {
    return this.monde.elevation[this.index];
  }

  niveauRempli(niveau: number): boolean {
    return niveau >= 0 && niveau <= this.elevationMax;
  }

  matiereNiveau(niveau: number): Matiere {
    if (!this.niveauRempli(niveau)) return Matiere.Vide;
    return this.monde.matiereNiveau(this.x, this.y, niveau);
  }

  get matiereSurface(): Matiere {
    return this.matiereNiveau(this.elevationMax);
  }

  get estEau(): boolean {
    return estEau(this.matiereSurface);
  }

  get estGisement(): boolean {
    return estGisement(this.matiereSurface);
  }

  quantiteGisementNiveau(niveau: number): number {
    if (!this.niveauRempli(niveau)) return 0;
    return this.monde.quantiteGisement[this.monde.indexNiveau(this.x, this.y, niveau)];
  }

  get quantiteGisementSurface(): number {
    return this.quantiteGisementNiveau(this.elevationMax);
  }

  get temperatureCelsius(): number {
    return this.monde.temperature[this.index];
  }

  temperatureCelsiusNiveau(niveau: number, refroidissementParNiveau: number): number {
    return this.temperatureCelsius - refroidissementParNiveau * Math.max(0, this.elevationMax - niveau);
  }

  get humiditePourcent(): number {
    return this.monde.humidite[this.index];
  }

  get vegetation() {
    return this.monde.vegetation[this.index];
  }

  get meteo() {
    return this.monde.meteo[this.index];
  }

  get gele(): boolean {
    return this.monde.gele[this.index] === 1;
  }

  get pollution(): number {
    return this.monde.pollution[this.index];
  }
}
