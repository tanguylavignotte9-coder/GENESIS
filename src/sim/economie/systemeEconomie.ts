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

export function fermentationMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.economie;
  const idFermentation = etat.savoir.tous().find((c) => c.nom === 'fermentation')?.id;
  if (idFermentation === undefined) return;
  const boissons = ['biere', 'vin', 'hydromel'];
  for (const groupe of etat.groupes.values()) {
    if (!connaissancesGroupe(etat, groupe.id).has(idFermentation)) continue;
    if (!etat.rng.chance(cfg.chanceFermentationParMois)) continue;
    const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
    const type = etat.rng.choix(boissons);
    const objet = new Objet(etat.prochainIdObjet++, type, groupe.dirigeantId, date);
    etat.objets.set(objet.id, objet);
    groupe.stocksCommuns[type] = (groupe.stocksCommuns[type] ?? 0) + 1;
    const vivants = groupe.membres.map((id) => etat.individus.get(id)).filter((i): i is import('../entites/individu').Individu => !!i && i.vivant);
    if (vivants.length > 0 && etat.rng.chance(cfg.chanceConsommationFermenteParMois)) {
      const buveur = etat.rng.choix(vivants);
      groupe.stocksCommuns[type] -= 1;
      buveur.bonheur = Math.min(100, buveur.bonheur + 10);
      buveur.besoins.stress = Math.max(0, buveur.besoins.stress - 10);
      if (!buveur.malus.includes('ivre')) buveur.malus.push('ivre');
      etat.journal.ajouter({
        date,
        type: TypeEvenement.Autre,
        sujet: 'Fête',
        description: `${buveur.nom} boit du ${type} avec ${groupe.nom} (ivresse).`,
        individusImpliques: [buveur.id],
        tuileX: Math.round(buveur.positionX),
        tuileY: Math.round(buveur.positionY),
      });
    }
  }
}

export function trocInterGroupesMensuel(etat: EtatPartage, config: ConfigComplete): void {
  const cfg = config.economie;
  const groupes = Array.from(etat.groupes.values());
  const centres = groupes.map((g) => {
    const vivants = g.membres.map((id) => etat.individus.get(id)).filter((i) => i && i.vivant);
    if (vivants.length === 0) return null;
    return {
      g,
      x: vivants.reduce((s, i) => s + i!.positionX, 0) / vivants.length,
      y: vivants.reduce((s, i) => s + i!.positionY, 0) / vivants.length,
    };
  });
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const a = centres[i];
      const b = centres[j];
      if (!a || !b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > cfg.porteeMarcheTuiles * 2) continue;
      if (!etat.rng.chance(cfg.chanceTrocParMois)) continue;
      const stockA = a.g.stocksCommuns.nourriture ?? 0;
      const stockB = b.g.stocksCommuns.nourriture ?? 0;
      if (stockA > 20 && stockB < 5) {
        const q = Math.min(10, stockA - 20);
        a.g.stocksCommuns.nourriture -= q;
        b.g.stocksCommuns.nourriture = (b.g.stocksCommuns.nourriture ?? 0) + q;
        const monnaieA = a.g.stocksCommuns.monnaie ?? 0;
        const prix = Math.min(monnaieA, q);
        a.g.stocksCommuns.monnaie = monnaieA - prix;
        b.g.stocksCommuns.monnaie = (b.g.stocksCommuns.monnaie ?? 0) + prix;
        etat.journal.ajouter({
          date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
          type: TypeEvenement.Autre,
          sujet: 'Échange inter-groupes',
          description: `${a.g.nom} vend ${q} nourriture à ${b.g.nom} contre ${prix} monnaie.`,
          individusImpliques: [],
          tuileX: Math.round((a.x + b.x) / 2),
          tuileY: Math.round((a.y + b.y) / 2),
        });
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
