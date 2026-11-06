import type { DateJeu } from '../types';

export class EntiteBatiment {
  id: number;
  type: string;
  x: number;
  y: number;
  groupeId: number | null;
  materiaux: Record<string, number>;
  durabilite: number;
  stocks: Record<string, number>;
  chantierRestantJours: number;
  enConstruction: boolean;
  fondeLe: DateJeu;

  constructor(id: number, type: string, x: number, y: number, materiaux: Record<string, number>, date: DateJeu, groupeId: number | null = null, dureeJours = 0) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.groupeId = groupeId;
    this.materiaux = { ...materiaux };
    this.durabilite = 1;
    this.stocks = {};
    this.chantierRestantJours = dureeJours;
    this.enConstruction = dureeJours > 0;
    this.fondeLe = { ...date };
  }

  serialiser(): Record<string, unknown> {
    return { ...this, materiaux: { ...this.materiaux }, stocks: { ...this.stocks } } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): EntiteBatiment {
    const b = new EntiteBatiment(d.id as number, d.type as string, d.x as number, d.y as number, d.materiaux as Record<string, number>, d.fondeLe as DateJeu);
    Object.assign(b, d);
    return b;
  }
}
