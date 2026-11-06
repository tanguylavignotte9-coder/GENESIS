import { NiveauGroupe } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Groupe, hslVersRgb } from './groupe';
import { TypeEvenement } from '../journal/journal';
import type { Individu } from '../entites/individu';

export function migrationsMensuelles(etat: EtatPartage, config: ConfigComplete): void {
  const cfgS = config.societe;
  const monde = etat.monde;
  const groupes = Array.from(etat.groupes.values());

  for (const g of groupes) {
    const vivants = g.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    if (vivants.length === 0) continue;

    let biomasseMoyenne = 0;
    for (const p of g.territoire) {
      biomasseMoyenne += monde.biomasseVegetation[monde.index(p.x, p.y)];
    }
    biomasseMoyenne = g.territoire.length > 0 ? biomasseMoyenne / g.territoire.length : 100;

    if (biomasseMoyenne < cfgS.seuilBiomasseMigration && !g.migrationCible) {
      const cible = meilleureTerre(monde, vivants, cfgS.porteeRechercheNouvelleTerreTuiles);
      if (cible) {
        g.migrationCible = cible;
        etat.journal.ajouter({
          date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
          type: TypeEvenement.Autre,
          sujet: 'Migration',
          description: `${g.nom} migre collectivement vers de nouvelles terres (biomasse épuisée localement).`,
          individusImpliques: [...g.membres],
          tuileX: cible.x,
          tuileY: cible.y,
        });
      }
    } else if (biomasseMoyenne >= cfgS.seuilBiomasseMigration * 2 && g.migrationCible) {
      g.migrationCible = null;
    }

    const bonheur = g.bonheurMoyen(etat.individus);
    if (bonheur < cfgS.seuilMecontentementGroupe && vivants.length >= 8 && etat.rng.chance(cfgS.chanceSchismeParMois)) {
      schisme(etat, config, g, vivants);
    }
  }
}

function schisme(etat: EtatPartage, config: ConfigComplete, g: Groupe, vivants: Individu[]): void {
  const meneur = vivants.slice().sort((a, b) => b.charisme - a.charisme)[0];
  const partants = vivants.filter(() => etat.rng.chance(0.4));
  if (partants.length < 3) return;
  const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
  const nom = `${g.nom} — dissidents`;
  const nouveau = new Groupe(etat.prochainIdGroupe++, nom, NiveauGroupe.Bande, g.langueId, date);
  nouveau.parentId = g.id;
  nouveau.religionId = g.religionId;
  nouveau.politiques = { ...g.politiques };
  const partStock = Math.floor((g.stocksCommuns.nourriture ?? 0) * (partants.length / vivants.length));
  g.stocksCommuns.nourriture = (g.stocksCommuns.nourriture ?? 0) - partStock;
  nouveau.stocksCommuns.nourriture = partStock;
  nouveau.dirigeantId = meneur.id;
  for (const p of partants) {
    p.groupeId = nouveau.id;
    nouveau.membres.push(p.id);
    const idx = g.membres.indexOf(p.id);
    if (idx >= 0) g.membres.splice(idx, 1);
  }
  if (g.dirigeantId !== null && !partants.some((p) => p.id === g.dirigeantId)) {
    /* le dirigeant reste */
  }
  nouveau.recalculerTerritoire(etat.monde, etat.individus, etat.batiments, config.societe.rayonTerritoireDefautTuiles, config.societe.rayonTerritoireBatimentsTuiles);
  nouveau.couleur = hslVersRgb(((nouveau.id * 2654435761) % 360) / 360, 0.65, 0.55);
  etat.groupes.set(nouveau.id, nouveau);
  etat.journal.ajouter({
    date,
    type: TypeEvenement.Schisme,
    sujet: 'Schisme de groupe',
    description: `${partants.length} membres menés par ${meneur.nom} quittent ${g.nom} (mécontentement) et fondent « ${nom} ».`,
    individusImpliques: partants.map((p) => p.id),
    tuileX: Math.round(meneur.positionX),
    tuileY: Math.round(meneur.positionY),
  });
}

function meilleureTerre(monde: EtatPartage['monde'], vivants: Individu[], portee: number): { x: number; y: number } | null {
  const cx = vivants.reduce((s, i) => s + i.positionX, 0) / vivants.length;
  const cy = vivants.reduce((s, i) => s + i.positionY, 0) / vivants.length;
  let best = -1;
  let bestPos: { x: number; y: number } | null = null;
  const t = monde.taille;
  const pas = 10;
  for (let y = Math.max(0, Math.floor(cy - portee)); y < Math.min(t, cy + portee); y += pas) {
    for (let x = Math.max(0, Math.floor(cx - portee)); x < Math.min(t, cx + portee); x += pas) {
      if (monde.estEau(x, y)) continue;
      const score = monde.biomasseVegetation[monde.index(x, y)] + (monde.temperature[monde.index(x, y)] > 5 ? 20 : 0);
      if (score > best) {
        best = score;
        bestPos = { x, y };
      }
    }
  }
  return bestPos;
}
