import type { ConfigTemps } from '../config/schema';
import type { Calendrier } from './calendrier';

export enum Vitesse {
  Pause = 0,
  X1 = 1,
  X5 = 5,
  X10 = 10,
  X25 = 25,
  X50 = 50,
}

export function vitessesDisponibles(config: ConfigTemps): number[] {
  return [...config.vitessesDisponibles].sort((a, b) => a - b);
}

export class BoucleTemps {
  vitesse: number = 1;

  constructor(private config: ConfigTemps) {
    this.vitesse = config.vitessesDisponibles[0] ?? 1;
  }

  get enPause(): boolean {
    return this.vitesse === 0;
  }

  pause(): void {
    this.vitesse = 0;
  }

  definirVitesse(v: number): void {
    if (v === 0) {
      this.pause();
      return;
    }
    if (!this.config.vitessesDisponibles.includes(v)) return;
    this.vitesse = v;
  }

  avancerSecondesReelles(secondesReelles: number, calendrier: Calendrier): { jours: number; nouveauMois: boolean } {
    if (this.vitesse === 0 || secondesReelles <= 0) return { jours: 0, nouveauMois: false };
    const jours = (secondesReelles / this.config.secondesParMoisAX1) * this.config.joursParMois * this.vitesse;
    const avantAn = calendrier.an;
    const avantMois = calendrier.mois;
    calendrier.avancer(jours);
    return { jours, nouveauMois: calendrier.an !== avantAn || calendrier.mois !== avantMois };
  }
}
