import { Saison } from '../types';
import type { ConfigMonde, ConfigTemps } from '../config/schema';

export class Calendrier {
  an: number = 1;
  mois: number = 1;
  jourDansMois: number = 0;

  constructor(private configTemps: ConfigTemps) {}

  avancer(jours: number): void {
    this.jourDansMois += jours;
    while (this.jourDansMois >= this.configTemps.joursParMois) {
      this.jourDansMois -= this.configTemps.joursParMois;
      this.mois++;
      if (this.mois > this.configTemps.moisParAn) {
        this.mois = 1;
        this.an++;
      }
    }
  }

  get anneeEnCours(): number {
    return this.an;
  }

  get texteDate(): string {
    return `An ${this.an}, mois ${this.mois}`;
  }

  saisonPourDistanceEquateur(distanceEquateur: number, hemisphereNord: boolean): Saison {
    const m = this.mois;
    const c = this.configTemps.moisParAn;
    const limiteTrop = 0.3;
    const limitePol = 0.7;
    if (distanceEquateur < limiteTrop) {
      const moisHumideNord = m >= 5 && m <= 10;
      const humide = hemisphereNord ? moisHumideNord : !moisHumideNord;
      return humide ? Saison.Humide : Saison.Seche;
    }
    if (distanceEquateur > limitePol) {
      const hiverNord = m === 12 || m <= 2;
      const hiver = hemisphereNord ? hiverNord : !hiverNord;
      return hiver ? Saison.Hiver : Saison.Ete;
    }
    const printemps = m >= 3 && m <= Math.floor(c / 4) + 1;
    const ete = m > Math.floor(c / 4) + 1 && m <= Math.floor(c / 2) + 1;
    const automne = m > Math.floor(c / 2) + 1 && m <= Math.floor((3 * c) / 4) + 1;
    let saison: Saison;
    if (hemisphereNord) {
      if (printemps) saison = Saison.Printemps;
      else if (ete) saison = Saison.Ete;
      else if (automne) saison = Saison.Automne;
      else saison = Saison.Hiver;
    } else {
      if (printemps) saison = Saison.Automne;
      else if (ete) saison = Saison.Hiver;
      else if (automne) saison = Saison.Printemps;
      else saison = Saison.Ete;
    }
    return saison;
  }

  serialiser(): { an: number; mois: number; jourDansMois: number } {
    return { an: this.an, mois: this.mois, jourDansMois: this.jourDansMois };
  }

  restaurer(d: { an: number; mois: number; jourDansMois: number }): void {
    this.an = d.an;
    this.mois = d.mois;
    this.jourDansMois = d.jourDansMois;
  }
}

export function amplitudeSaisonCelsius(configMonde: ConfigMonde, distanceEquateur: number): number {
  if (distanceEquateur < configMonde.limiteZoneTropicale) return configMonde.amplitudeSaisonniereTropicaleCelsius;
  if (distanceEquateur > configMonde.limiteZonePolaire) return configMonde.amplitudeSaisonnierePolaireCelsius;
  return configMonde.amplitudeSaisonniereTempereeCelsius;
}

export function decalageSaisonnierCelsius(configMonde: ConfigMonde, distanceEquateur: number, saison: Saison, mois: number, moisParAn: number): number {
  const amplitude = amplitudeSaisonCelsius(configMonde, distanceEquateur);
  const phase = ((mois - 1) / moisParAn) * Math.PI * 2;
  switch (saison) {
    case Saison.Ete:
      return amplitude;
    case Saison.Hiver:
      return -amplitude;
    case Saison.Printemps:
    case Saison.Automne:
      return amplitude * Math.cos(phase);
    case Saison.Humide:
      return amplitude * 0.5;
    case Saison.Seche:
      return amplitude * 0.75;
    default:
      return 0;
  }
}
