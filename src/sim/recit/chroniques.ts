import type { EtatPartage } from '../etat';
import { TypeEvenement, type Evenement } from '../journal/journal';

export function biographie(etat: EtatPartage, individuId: number): Evenement[] {
  return etat.journal.lire({ individuId });
}

export function chroniqueGroupe(etat: EtatPartage, groupeId: number): Evenement[] {
  const groupe = etat.groupes.get(groupeId);
  if (!groupe) return [];
  const membres = new Set(groupe.membres);
  return etat.journal.lire({}).filter((e) => e.individusImpliques.some((id) => membres.has(id)));
}

const TYPES_SAGA = new Set<TypeEvenement>([TypeEvenement.Drame, TypeEvenement.Mort, TypeEvenement.Schisme, TypeEvenement.Religion, TypeEvenement.Fondation]);

export interface ChroniqueEspece {
  naissances: number;
  morts: number;
  groupesFondes: number;
  religions: number;
  langues: number;
  decouvertes: number;
  anFin: number;
  moisFin: number;
  figures: Array<{ id: number; nom: string; evenements: number; mort: string | null }>;
  derniersEvenements: Evenement[];
}

export function chroniqueEspece(etat: EtatPartage): ChroniqueEspece {
  const tous = etat.journal.lire({});
  const compte: Map<number, number> = new Map();
  for (const e of tous) {
    for (const id of e.individusImpliques) compte.set(id, (compte.get(id) ?? 0) + 1);
  }
  const figures = Array.from(compte.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, n]) => {
      const ind = etat.individus.get(id);
      return { id, nom: ind?.nom ?? `#${id}`, evenements: n, mort: ind?.causeMort ?? null };
    });
  return {
    naissances: tous.filter((e) => e.type === TypeEvenement.Naissance).length,
    morts: tous.filter((e) => e.type === TypeEvenement.Mort).length,
    groupesFondes: tous.filter((e) => e.type === TypeEvenement.Fondation).length,
    religions: etat.religions.size,
    langues: etat.langues.size,
    decouvertes: tous.filter((e) => e.type === TypeEvenement.Decouverte).length,
    anFin: etat.calendrier.an,
    moisFin: etat.calendrier.mois,
    figures,
    derniersEvenements: tous.slice(-30),
  };
}

export function sagaDuMoment(etat: EtatPartage): Evenement | null {
  const sixDerniersIds = etat.journal.lire({}).slice(-200);
  let meilleure: Evenement | null = null;
  let meilleurScore = 0;
  for (const e of sixDerniersIds) {
    if (!TYPES_SAGA.has(e.type)) continue;
    const anciennete = sixDerniersIds.length - sixDerniersIds.indexOf(e);
    const score = e.individusImpliques.length * 2 + (e.type === TypeEvenement.Drame ? 10 : e.type === TypeEvenement.Schisme ? 8 : 3) + Math.max(0, 50 - anciennete) / 50;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = e;
    }
  }
  return meilleure;
}
