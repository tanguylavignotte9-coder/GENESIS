import { NiveauGroupe, type DateJeu } from '../types';
import type { Monde } from '../monde/monde';
import type { Individu } from '../entites/individu';
import type { EntiteBatiment } from '../batiments/batiment';

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
  chantierEnCours: number | null;
  couleur: number;
  ere: number;

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
    this.chantierEnCours = null;
    this.ere = 0;
    const teinte = (id * 2654435761) % 360;
    this.couleur = hslVersRgb(teinte / 360, 0.65, 0.55);
  }

  ajouterStock(ressource: string, quantite: number, capacite: number): number {
    const actuel = this.stocksCommuns[ressource] ?? 0;
    const pris = Math.max(0, Math.min(quantite, capacite - actuel));
    this.stocksCommuns[ressource] = actuel + pris;
    return pris;
  }

  aUnBatiment(type: string, batiments: Map<number, EntiteBatiment>): boolean {
    for (const b of batiments.values()) {
      if (b.groupeId === this.id && b.type === type && !b.enConstruction) return true;
    }
    return false;
  }

  nbBatiments(type: string, batiments: Map<number, EntiteBatiment>): number {
    let n = 0;
    for (const b of batiments.values()) {
      if (b.groupeId === this.id && b.type === type && !b.enConstruction) n++;
    }
    return n;
  }

  recalculerTerritoire(monde: Monde, individus: Map<number, Individu>, batiments: Map<number, EntiteBatiment>, rayonDefaut: number, rayonBatiments: number): void {
    const ensemble = new Map<number, { x: number; y: number }>();
    for (const id of this.membres) {
      const ind = individus.get(id);
      if (!ind || !ind.vivant) continue;
      const x = Math.round(ind.positionX);
      const y = Math.round(ind.positionY);
      if (monde.dansLimites(x, y)) ensemble.set(monde.index(x, y), { x, y });
    }
    for (const b of batiments.values()) {
      if (b.groupeId !== this.id) continue;
      if (monde.dansLimites(b.x, b.y)) ensemble.set(monde.index(b.x, b.y), { x: b.x, y: b.y });
      for (let dy = -rayonBatiments; dy <= rayonBatiments; dy++) {
        for (let dx = -rayonBatiments; dx <= rayonBatiments; dx++) {
          const nx = b.x + dx;
          const ny = b.y + dy;
          if (monde.dansLimites(nx, ny) && Math.hypot(dx, dy) <= rayonBatiments) ensemble.set(monde.index(nx, ny), { x: nx, y: ny });
        }
      }
    }
    void rayonDefaut;
    this.territoire = Array.from(ensemble.values());
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

export function hslVersRgb(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
