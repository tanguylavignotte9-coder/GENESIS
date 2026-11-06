import type { DateJeu } from '../types';

export interface ProprietaireHistorique {
  individuId: number;
  depuis: DateJeu;
}

export class Objet {
  id: number;
  type: string;
  fabricantId: number | null;
  proprietaires: ProprietaireHistorique[];
  usure: number;
  casse: boolean;
  reparations: number;
  valeurAffective: number;

  constructor(id: number, type: string, fabricantId: number | null, date: DateJeu) {
    this.id = id;
    this.type = type;
    this.fabricantId = fabricantId;
    this.proprietaires = fabricantId !== null ? [{ individuId: fabricantId, depuis: { ...date } }] : [];
    this.usure = 0;
    this.casse = false;
    this.reparations = 0;
    this.valeurAffective = 0;
  }

  changerProprietaire(individuId: number, date: DateJeu): void {
    this.proprietaires.push({ individuId, depuis: { ...date } });
  }

  serialiser(): Record<string, unknown> {
    return { ...this, proprietaires: this.proprietaires.map((p) => ({ ...p, depuis: { ...p.depuis } })) } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): Objet {
    const o = new Objet(d.id as number, d.type as string, d.fabricantId as number | null, { an: 1, mois: 1 });
    Object.assign(o, d);
    return o;
  }
}
