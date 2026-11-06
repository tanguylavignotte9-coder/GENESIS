import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import type { Individu } from '../entites/individu';
import { TypeEvenement } from '../journal/journal';

export function gouvernanceMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfgS = config.societe;
  for (const groupe of etat.groupes.values()) {
    if (Object.keys(groupe.politiques).length === 0) {
      for (const p of cfgS.politiquesDisponibles) groupe.politiques[p] = true;
    }
    const dirigeant = groupe.dirigeantId !== null ? etat.individus.get(groupe.dirigeantId) : undefined;
    if (dirigeant && dirigeant.vivant && dirigeant.ageAnnees < cfgS.ageMaxDirigeantAnnees) continue;

    const adultes = groupe.membres
      .map((id) => etat.individus.get(id))
      .filter((i): i is Individu => !!i && i.vivant && i.ageAnnees >= config.individus.ageMaturiteMoyenAnnees);
    if (adultes.length === 0) continue;
    let nouveau = adultes[0]!;
    let meilleurScore = -Infinity;
    for (const ind of adultes) {
      const score = ind.ageAnnees * cfgS.poidsAgeDirigeant + ind.charisme * cfgS.poidsCharismeDirigeant;
      if (score > meilleurScore) {
        meilleurScore = score;
        nouveau = ind;
      }
    }
    if (groupe.dirigeantId !== nouveau.id) {
      const ancienNom = dirigeant ? dirigeant.nom : 'personne';
      groupe.dirigeantId = nouveau.id;
      etat.journal.ajouter({
        date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
        type: TypeEvenement.Autre,
        sujet: 'Changement de dirigeant',
        description: `${nouveau.nom} devient dirigeant de ${groupe.nom} (${ancienNom} ne dirige plus).`,
        individusImpliques: [nouveau.id],
        tuileX: null,
        tuileY: null,
      });
    }
  }
}

export function recalculerTerritoires(etat: EtatPartage, config: ConfigComplete): void {
  for (const groupe of etat.groupes.values()) {
    groupe.recalculerTerritoire(etat.monde, etat.individus, etat.batiments, config.societe.rayonTerritoireDefautTuiles, config.societe.rayonTerritoireBatimentsTuiles);
  }
}
