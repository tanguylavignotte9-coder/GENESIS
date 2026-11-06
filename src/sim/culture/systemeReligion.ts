import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { creerReligion, type Religion } from './religion';
import { TypeEvenement } from '../journal/journal';
import type { Individu } from '../entites/individu';

const NOMS_DIEUX = ['Ael', 'Korun', 'Mira', 'Talos', 'Sylva', 'Nergal', 'Ilios', 'Vessa', 'Ombre', 'Kharon'];
const TABOUS_POSSIBLES = ['le cannibalisme', 'le meurtre', 'l\'adultère', 'le vol', 'le porc', 'le travail le jour sacré', 'l\'inceste'];
const NOMS_CULTES = ['Culte', 'Foi', 'Voie', 'Ordre', 'Cercle'];

export function miseAJourReligionsMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.recit;
  const groupes = Array.from(etat.groupes.values());

  for (const g of groupes) {
    if (g.religionId !== null) continue;
    const membres = g.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    const prophete = membres
      .filter((i) => i.charisme >= cfg.seuilCharismeProphete && i.memoire.some((m) => m.intensite >= 60))
      .sort((a, b) => b.charisme - a.charisme)[0];
    if (!prophete) continue;
    if (!etat.rng.chance(cfg.chanceRevelationParMois)) continue;
    const nbDieux = etat.rng.entier(1, 3);
    const dieux: string[] = [];
    for (let i = 0; i < nbDieux; i++) dieux.push(etat.rng.choix(NOMS_DIEUX));
    const tabous = [etat.rng.choix(TABOUS_POSSIBLES), etat.rng.choix(TABOUS_POSSIBLES)];
    const joursSacres: number[] = [];
    const nbJours = etat.rng.entier(1, 3);
    for (let i = 0; i < nbJours; i++) joursSacres.push(etat.rng.entier(1, 12));
    const nom = `${etat.rng.choix(NOMS_CULTES)} de ${prophete.nom}`;
    const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
    const religion = creerReligion(etat.prochainIdReligion++, nom, prophete.id, null, dieux, [...new Set(tabous)], joursSacres, date);
    etat.religions.set(religion.id, religion);
    g.religionId = religion.id;
    for (const m of membres) {
      if (etat.rng.chance(1 - cfg.probabiliteScepticisme)) m.religionId = religion.id;
    }
    etat.journal.ajouter({
      date,
      type: TypeEvenement.Religion,
      sujet: 'Nouvelle religion',
      description: `${prophete.nom} fonde « ${nom} » (dieux : ${dieux.join(', ')} ; tabous : ${[...new Set(tabous)].join(', ')}) et convainc ${g.nom}.`,
      individusImpliques: [prophete.id, ...membres.map((m) => m.id)],
      tuileX: Math.round(prophete.positionX),
      tuileY: Math.round(prophete.positionY),
    });
  }

  for (const ind of etat.individus.values()) {
    if (!ind.vivant || ind.religionId === null) continue;
    const religion = etat.religions.get(ind.religionId);
    if (!religion) continue;
    for (const autre of etat.individus.values()) {
      if (autre.id === ind.id || !autre.vivant || autre.religionId !== null) continue;
      if (Math.hypot(autre.positionX - ind.positionX, autre.positionY - ind.positionY) > 2) continue;
      if (etat.rng.chance(cfg.tauxPropagationReligionParMois * (1 + ind.charisme / 200))) {
        autre.religionId = ind.religionId;
        if (autre.groupeId !== null) {
          const g = etat.groupes.get(autre.groupeId);
          if (g && g.religionId === null) g.religionId = ind.religionId;
        }
      }
    }
  }

  for (const religion of Array.from(etat.religions.values())) {
    const croyants = Array.from(etat.individus.values()).filter((i) => i.religionId === religion.id && i.vivant);
    if (croyants.length < 3) continue;
    const bonheurMoyen = croyants.reduce((s, i) => s + i.bonheur, 0) / croyants.length;
    if (bonheurMoyen >= cfg.seuilBonheurSchisme) continue;
    if (!etat.rng.chance(cfg.chanceSchismeParMois)) continue;
    const schisme = creerReligion(
      etat.prochainIdReligion++,
      `${religion.nom} réformé`,
      etat.rng.choix(croyants).id,
      religion.id,
      [...religion.dieux],
      [...religion.tabous],
      [...religion.joursSacres],
      { an: etat.calendrier.an, mois: etat.calendrier.mois },
    );
    etat.religions.set(schisme.id, schisme);
    for (const c of croyants) {
      if (etat.rng.chance(0.3)) c.religionId = schisme.id;
    }
    etat.journal.ajouter({
      date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
      type: TypeEvenement.Schisme,
      sujet: 'Schisme religieux',
      description: `« ${schisme.nom} » naît du schisme de « ${religion.nom} ».`,
      individusImpliques: croyants.map((c) => c.id),
      tuileX: null,
      tuileY: null,
    });
  }
}

export function religionsCompatibles(a: Individu, b: Individu): boolean {
  if (a.religionId === null || b.religionId === null) return true;
  return a.religionId === b.religionId;
}

export function listeReligions(etat: EtatPartage): Religion[] {
  return Array.from(etat.religions.values());
}
