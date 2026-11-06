import type { DateJeu } from '../types';

export class EntiteVehicule {
  id: number;
  type: string;
  x: number;
  y: number;
  groupeId: number | null;
  capacite: number;
  passagers: number[];
  enConstruction: boolean;
  chantierRestantJours: number;
  coule: boolean;
  construitLe: DateJeu;

  constructor(id: number, type: string, x: number, y: number, capacite: number, date: DateJeu, groupeId: number | null, dureeJours: number) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.groupeId = groupeId;
    this.capacite = capacite;
    this.passagers = [];
    this.enConstruction = dureeJours > 0;
    this.chantierRestantJours = dureeJours;
    this.coule = false;
    this.construitLe = { ...date };
  }

  serialiser(): Record<string, unknown> {
    return { ...this, passagers: [...this.passagers], construitLe: { ...this.construitLe } } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): EntiteVehicule {
    const v = new EntiteVehicule(d.id as number, d.type as string, d.x as number, d.y as number, d.capacite as number, d.construitLe as DateJeu, d.groupeId as number | null, 0);
    Object.assign(v, d);
    return v;
  }
}
