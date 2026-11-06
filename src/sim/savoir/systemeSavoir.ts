import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { atomesInventables, ereDe, nomEre } from './arbreTechnologique';
import { TypeEvenement } from '../journal/journal';
import type { Individu } from '../entites/individu';

export function connaissancesGroupe(etat: EtatPartage, groupeId: number): Set<number> {
  const res = new Set<number>();
  const g = etat.groupes.get(groupeId);
  if (!g) return res;
  for (const id of g.membres) {
    const ind = etat.individus.get(id);
    if (ind) for (const c of ind.connaissances) res.add(c);
  }
  return res;
}

export function perceesMensuelles(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.societe;
  for (const g of etat.groupes.values()) {
    const connus = connaissancesGroupe(etat, g.id);
    const inventables = atomesInventables(etat.savoir, connus);
    if (inventables.length === 0) continue;
    const membres = g.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    for (const ind of membres) {
      if (ind.intelligence < cfg.seuilIntelligenceGenie) continue;
      const p = cfg.chancePerceeParMois * (ind.intelligence / 100);
      if (!etat.rng.chance(p)) continue;
      const dispos = atomesInventables(etat.savoir, new Set([...connus, ...Array.from(ind.connaissances)]));
      const pool = dispos.length > 0 ? dispos : inventables;
      const atome = etat.rng.choix(pool);
      ind.connaissances.add(atome.id);
      etat.journal.ajouter({
        date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
        type: TypeEvenement.Decouverte,
        sujet: 'Découverte',
        description: `${ind.nom} (${g.nom}) découvre « ${atome.nom} ».`,
        individusImpliques: [ind.id],
        tuileX: Math.round(ind.positionX),
        tuileY: Math.round(ind.positionY),
      });
    }
  }
}

export function transmissionMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.societe;
  for (const g of etat.groupes.values()) {
    const membres = g.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    if (membres.length === 0) continue;
    const connus = connaissancesGroupe(etat, g.id);
    const aEcole = g.aUnBatiment('ecole', etat.batiments);
    const aEcriture = [...connus].some((id) => etat.savoir.get(id)?.nom === 'ecriture');

    for (const eleve of membres) {
      if (eleve.ageAnnees > 40) continue;
      for (const maitre of membres) {
        if (maitre.id === eleve.id) continue;
        if (Math.hypot(maitre.positionX - eleve.positionX, maitre.positionY - eleve.positionY) > 4) continue;
        for (const c of maitre.connaissances) {
          if (eleve.connaissances.has(c)) continue;
          let taux = cfg.tauxTransmissionMaitreParMois;
          if (aEcole && c !== undefined && etat.savoir.get(c)?.nom === 'ecriture') taux = cfg.tauxTransmissionEcoleParMois;
          if (etat.rng.chance(taux)) {
            eleve.connaissances.add(c);
            break;
          }
        }
      }
      if (aEcriture) {
        for (const c of [...connus]) {
          if (eleve.connaissances.has(c)) continue;
          if (etat.rng.chance(cfg.tauxTransmissionEcritureParMois)) {
            eleve.connaissances.add(c);
          }
        }
      }
    }
  }
}

export function ereGroupe(etat: EtatPartage, groupeId: number): { ere: number; nom: string } {
  const connus = connaissancesGroupe(etat, groupeId);
  const ere = ereDe(connus, etat.savoir);
  return { ere, nom: nomEre(ere) };
}

export function verifierChangementEre(etat: EtatPartage, groupeId: number, ancienneEre: number): void {
  const { ere, nom } = ereGroupe(etat, groupeId);
  if (ere > ancienneEre) {
    const g = etat.groupes.get(groupeId);
    etat.journal.ajouter({
      date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
      type: TypeEvenement.Decouverte,
      sujet: 'Nouvelle ère',
      description: `${g?.nom ?? 'Un groupe'} entre dans le « ${nom} ».`,
      individusImpliques: [],
      tuileX: null,
      tuileY: null,
    });
  }
}
