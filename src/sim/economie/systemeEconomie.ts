import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Objet } from './objet';
import { Competence } from '../types';
import { TypeEvenement } from '../journal/journal';
import { TypeRelation } from '../entites/individu';
import { connaissancesGroupe } from '../savoir/systemeSavoir';

export function valeurObjet(etat: EtatPartage, config: ConfigComplete, objet: Objet): number {
  const base = config.economie.valeurBaseObjets[objet.type] ?? config.economie.valeurSubjectiveBase;
  return Math.max(0, base * (1 - objet.usure));
}

export function fabricationMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.economie;
  const types = Object.keys(cfg.valeurBaseObjets);
  if (types.length === 0) return;
  for (const groupe of etat.groupes.values()) {
    if (!groupe.aUnBatiment('feuDeCamp', etat.batiments) && !groupe.aUnBatiment('hutte', etat.batiments)) continue;
    const artisans = groupe.membres
      .map((id) => etat.individus.get(id))
      .filter((i) => i && i.vivant)
      .sort((a, b) => (b!.competences[Competence.Artisanat] ?? 0) - (a!.competences[Competence.Artisanat] ?? 0));
    const artisan = artisans[0];
    if (!artisan) continue;
    const comp = artisan.competences[Competence.Artisanat] ?? 0;
    if (etat.rng.chance(cfg.chanceFabricationParMois * (0.3 + comp / 100))) {
      const type = etat.rng.choix(types);
      const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
      const objet = new Objet(etat.prochainIdObjet++, type, artisan.id, date);
      etat.objets.set(objet.id, objet);
      artisan.objetIds.push(objet.id);
      artisan.competences[Competence.Artisanat] = Math.min(100, comp + config.individus.tauxApprentissageParMois * 6);
    }
    const idMonnaie = etat.savoir.tous().find((c) => c.nom === 'monnaie-metallique')?.id;
    if (idMonnaie !== undefined && connaissancesGroupe(etat, groupe.id).has(idMonnaie) && (groupe.aUnBatiment('forge', etat.batiments) || groupe.aUnBatiment('banque', etat.batiments))) {
      if (etat.rng.chance(config.societe.chanceFrappeMonnaieParMois)) {
        const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
        const piece = new Objet(etat.prochainIdObjet++, 'piece', groupe.dirigeantId, date);
        piece.valeurAffective = config.economie.valeurPiece;
        etat.objets.set(piece.id, piece);
        groupe.stocksCommuns.monnaie = (groupe.stocksCommuns.monnaie ?? 0) + config.economie.valeurPiece;
        const dejaFrappe = (groupe.stocksCommuns.monnaieFrappee ?? 0) > 0;
        if (!dejaFrappe) {
          groupe.stocksCommuns.monnaieFrappee = 1;
          etat.journal.ajouter({
            date,
            type: TypeEvenement.Decouverte,
            sujet: 'Monnaie',
            description: `${groupe.nom} frappe ses premières pièces : la monnaie émerge comme objets physiques réels.`,
            individusImpliques: [...groupe.membres],
            tuileX: null,
            tuileY: null,
          });
        }
      }
    }
  }
  for (const objet of etat.objets.values()) {
    if (objet.casse) continue;
    objet.usure += cfg.usureObjetParMois;
    if (objet.usure >= 1) {
      objet.casse = true;
      const proprio = objet.proprietaireId !== null ? etat.individus.get(objet.proprietaireId) : undefined;
      if (proprio) {
        proprio.objetIds = proprio.objetIds.filter((id) => id !== objet.id);
      }
    }
  }
}

export function trocMensuel(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.economie;
  for (const groupe of etat.groupes.values()) {
    const vivants = groupe.membres.map((id) => etat.individus.get(id)).filter((i) => i && i.vivant && i.objetIds.length > 0);
    for (let i = 0; i < vivants.length; i++) {
      for (let j = i + 1; j < vivants.length; j++) {
        const a = vivants[i]!;
        const b = vivants[j]!;
        if (Math.hypot(a.positionX - b.positionX, a.positionY - b.positionY) > 2) continue;
        if (!etat.rng.chance(cfg.chanceTrocParMois)) continue;
        const oa = etat.objets.get(etat.rng.choix(a.objetIds));
        const ob = etat.objets.get(etat.rng.choix(b.objetIds));
        if (!oa || !ob || oa.casse || ob.casse || oa.id === ob.id) continue;
        const va = valeurObjet(etat, config, oa);
        const vb = valeurObjet(etat, config, ob);
        if (Math.abs(va - vb) > Math.max(cfg.seuilEcartValeurPourEchange, (va + vb) * 0.5)) continue;
        const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
        oa.changerProprietaire(b.id, date);
        ob.changerProprietaire(a.id, date);
        oa.proprietaireId = b.id;
        ob.proprietaireId = a.id;
        a.objetIds = a.objetIds.filter((id) => id !== oa.id).concat(ob.id);
        b.objetIds = b.objetIds.filter((id) => id !== ob.id).concat(oa.id);
        a.ajouterRelation(b.id, TypeRelation.Gratitude, 5);
        b.ajouterRelation(a.id, TypeRelation.Gratitude, 5);
      }
    }
  }
}
