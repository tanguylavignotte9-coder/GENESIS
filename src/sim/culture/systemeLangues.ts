import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Langue } from './langue';
import { TypeEvenement } from '../journal/journal';
import type { Individu } from '../entites/individu';

export function miseAJourLanguesMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.recit;
  const groupes = Array.from(etat.groupes.values());
  const centres = groupes.map((g) => {
    const vivants = g.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    if (vivants.length === 0) return null;
    return {
      x: vivants.reduce((s, i) => s + i.positionX, 0) / vivants.length,
      y: vivants.reduce((s, i) => s + i.positionY, 0) / vivants.length,
      langueId: g.langueId,
    };
  });

  for (let gi = 0; gi < groupes.length; gi++) {
    const g = groupes[gi];
    const centre = centres[gi];
    if (!centre) continue;
    let isolement = 0;
    for (let gj = 0; gj < groupes.length; gj++) {
      if (gj === gi || !centres[gj]) continue;
      const d = Math.hypot(centres[gj]!.x - centre.x, centres[gj]!.y - centre.y);
      const f = Math.min(1, d / cfg.distanceIsolementTotalTuiles);
      if (f > isolement) isolement = f;
    }
    const langue = etat.langues.get(g.langueId);
    if (!langue) continue;
    langue.divergence += (cfg.tauxDivergenceLangueParSiecle / 12) * isolement * (1 + langue.divergence);
    if (langue.divergence >= cfg.seuilDivergenceNouvelleLangue) {
      const nouvelle = new Langue(etat.prochainIdLangue++, `${langue.nom}-fille`, langue.id);
      etat.langues.set(nouvelle.id, nouvelle);
      g.langueId = nouvelle.id;
      for (const id of g.membres) {
        const ind = etat.individus.get(id);
        if (ind) ind.langueId = nouvelle.id;
      }
      langue.divergence = cfg.seuilDivergenceNouvelleLangue * 0.5;
      etat.journal.ajouter({
        date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
        type: TypeEvenement.Langue,
        sujet: 'Nouvelle langue',
        description: `${g.nom} parle désormais une langue distincte, née de la divergence de « ${langue.nom} ».`,
        individusImpliques: [...g.membres],
        tuileX: Math.round(centre.x),
        tuileY: Math.round(centre.y),
      });
    }
  }

  for (const ind of etat.individus.values()) {
    if (!ind.vivant) continue;
    for (const autre of etat.individus.values()) {
      if (autre.id === ind.id || !autre.vivant) continue;
      if (autre.langueId === ind.langueId) continue;
      if (Math.hypot(autre.positionX - ind.positionX, autre.positionY - ind.positionY) > 2) continue;
      if (!ind.languesConnues.includes(autre.langueId) && etat.rng.chance(0.05)) {
        ind.languesConnues.push(autre.langueId);
      }
    }
  }
}

export function peutCooperer(a: Individu, b: Individu, config: ConfigComplete): number {
  if (a.langueId === b.langueId) return 1;
  if (a.languesConnues.includes(b.langueId) || b.languesConnues.includes(a.langueId)) return 1 - config.recit.malusCooperationLangueDifferente * 0.5;
  return 1 - config.recit.malusCooperationLangueDifferente;
}
