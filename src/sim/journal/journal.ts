import type { DateJeu } from '../types';

export enum TypeEvenement {
  Monde = 'monde',
  Naissance = 'naissance',
  Mort = 'mort',
  Fondation = 'fondation',
  Schisme = 'schisme',
  Decouverte = 'decouverte',
  Religion = 'religion',
  Langue = 'langue',
  Drame = 'drame',
  Autre = 'autre',
}

export interface Evenement {
  id: number;
  date: DateJeu;
  type: TypeEvenement;
  sujet: string;
  description: string;
  individusImpliques: number[];
  tuileX: number | null;
  tuileY: number | null;
}

export interface FiltreJournal {
  types?: TypeEvenement[];
  depuisId?: number;
  limite?: number;
  individuId?: number;
}

export class Journal {
  private evenements: Evenement[] = [];
  private prochainId = 1;
  private abonnes: Array<(e: Evenement) => void> = [];

  ajouter(e: Omit<Evenement, 'id'>): Evenement {
    const evenement: Evenement = { ...e, id: this.prochainId++ };
    this.evenements.push(evenement);
    for (const cb of this.abonnes) cb(evenement);
    return evenement;
  }

  lire(filtre: FiltreJournal = {}): Evenement[] {
    let res = this.evenements;
    if (filtre.depuisId !== undefined) res = res.filter((e) => e.id > filtre.depuisId!);
    if (filtre.types && filtre.types.length > 0) res = res.filter((e) => filtre.types!.includes(e.type));
    if (filtre.individuId !== undefined) res = res.filter((e) => e.individusImpliques.includes(filtre.individuId!));
    if (filtre.limite !== undefined) res = res.slice(-filtre.limite);
    return res.map((e) => ({ ...e, individusImpliques: [...e.individusImpliques] }));
  }

  abonner(cb: (e: Evenement) => void): () => void {
    this.abonnes.push(cb);
    return () => {
      this.abonnes = this.abonnes.filter((x) => x !== cb);
    };
  }

  get taille(): number {
    return this.evenements.length;
  }

  get dernierId(): number {
    return this.prochainId - 1;
  }

  serialiser(): { evenements: Evenement[]; prochainId: number } {
    return { evenements: this.evenements.map((e) => ({ ...e, individusImpliques: [...e.individusImpliques] })), prochainId: this.prochainId };
  }

  restaurer(d: { evenements: Evenement[]; prochainId: number }): void {
    this.evenements = d.evenements.map((e) => ({ ...e, individusImpliques: [...e.individusImpliques] }));
    this.prochainId = d.prochainId;
  }
}
