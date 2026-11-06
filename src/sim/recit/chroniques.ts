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
