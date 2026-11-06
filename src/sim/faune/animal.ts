import { Sexe } from '../types';

export class Animal {
  id: number;
  especeId: string;
  sexe: Sexe;
  ageAnnees: number;
  faim: number;
  sante: number;
  positionX: number;
  positionY: number;
  vivant: boolean;
  causeMort: string | null;

  constructor(id: number, especeId: string, x: number, y: number) {
    this.id = id;
    this.especeId = especeId;
    this.sexe = Sexe.Homme;
    this.ageAnnees = 0;
    this.faim = 20;
    this.sante = 100;
    this.positionX = x;
    this.positionY = y;
    this.vivant = true;
    this.causeMort = null;
  }

  serialiser(): Record<string, unknown> {
    return { ...this } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): Animal {
    const a = new Animal(d.id as number, d.especeId as string, d.positionX as number, d.positionY as number);
    Object.assign(a, d);
    return a;
  }
}
