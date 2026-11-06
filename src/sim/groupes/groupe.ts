import { NiveauGroupe, type DateJeu } from '../types';
import type { Monde } from '../monde/monde';
import type { Individu } from '../entites/individu';

export class Groupe {
  id: number;
  nom: string;
  niveau: NiveauGroupe;
  membres: number[];
  dirigeantId: number | null;
  parentId: number | null;
  politiques: Record<string, unknown>;
  langueId: number;
  religionId: number | null;
  fondeLe: DateJeu;
  territoire: Array<{ x: number; y: number }>;
  stocksCommuns: Record<string, number>;

  constructor(id: number, nom: string, niveau: NiveauGroupe, langueId: number, date: DateJeu) {
    this.id = id;
    this.nom = nom;
    this.niveau = niveau;
    this.membres = [];
    this.dirigeantId = null;
    this.parentId = null;
    this.politiques = {};
    this.langueId = langueId;
    this.religionId = null;
    this.fondeLe = { ...date };
    this.territoire = [];
    this.stocksCommuns = {};
  }

  recalculerTerritoire(monde: Monde, individus: Map<number, Individu>, rayonDefaut: number): void {
    const ensemble = new Map<number, { x: number; y: number }>();
    for (const id of this.membres) {
      const ind = individus.get(id);
      if (!ind || !ind.vivant) continue;
      const x = Math.round(ind.positionX);
      const y = Math.round(ind.positionY);
      ensemble.set(monde.index(x, y), { x, y });
    }
    this.territoire = Array.from(ensemble.values());
    if (this.territoire.length === 0 && this.membres.length > 0) {
      this.territoire = [{ x: 0, y: 0 }];
    }
    void rayonDefaut;
  }

  bonheurMoyen(individus: Map<number, Individu>): number {
    if (this.membres.length === 0) return 50;
    let somme = 0;
    let n = 0;
    for (const id of this.membres) {
      const ind = individus.get(id);
      if (ind && ind.vivant) {
        somme += ind.bonheur;
        n++;
      }
    }
    return n === 0 ? 50 : somme / n;
  }

  serialiser(): Record<string, unknown> {
    return { ...this, territoire: this.territoire.map((t) => ({ ...t })) } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): Groupe {
    const g = new Groupe(d.id as number, d.nom as string, d.niveau as NiveauGroupe, d.langueId as number, d.fondeLe as DateJeu);
    Object.assign(g, d);
    return g;
  }
}
