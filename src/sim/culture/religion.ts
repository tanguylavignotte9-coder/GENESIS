import type { DateJeu } from '../types';

export interface Religion {
  id: number;
  nom: string;
  propheteId: number;
  parentId: number | null;
  dieux: string[];
  tabous: string[];
  joursSacres: number[];
  fondeeLe: DateJeu;
}

export function creerReligion(id: number, nom: string, propheteId: number, parentId: number | null, dieux: string[], tabous: string[], joursSacres: number[], date: DateJeu): Religion {
  return { id, nom, propheteId, parentId, dieux: [...dieux], tabous: [...tabous], joursSacres: [...joursSacres], fondeeLe: { ...date } };
}
