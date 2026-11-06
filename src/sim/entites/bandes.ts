import { Competence, NiveauGroupe, Sexe, type DateJeu } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Individu } from './individu';
import { Groupe } from '../groupes/groupe';
import { genererNomFamille, genererPrenom, nomComplet } from '../culture/noms';
import { TypeEvenement } from '../journal/journal';

const SAVOIRS_DEPART = ['agriculture', 'construction-hutte', 'feu', 'vetements-basiques', 'elevage'];

export function poserBandesInitiales(etat: EtatPartage, config: ConfigComplete): void {
  const monde = etat.monde;
  const rng = etat.rng;
  const cfgI = config.individus;
  const cfgS = config.societe;
  const t = monde.taille;

  for (const nomSavoir of SAVOIRS_DEPART) {
    if (!etat.savoir.tous().some((c) => c.nom === nomSavoir)) {
      etat.savoir.ajouter(nomSavoir, []);
    }
  }
  const idsSavoirsDepart = etat.savoir.tous().filter((c) => SAVOIRS_DEPART.includes(c.nom)).map((c) => c.id);

  const nbBandes = etat.parametresDepart.nbBandes;
  const tailleBande = etat.parametresDepart.tailleBande;
  const langueMereId = etat.langues.values().next().value?.id ?? 0;

  const candidats: number[] = [];
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      if (monde.estEau(x, y) || monde.estEauSalee(x, y)) continue;
      if (monde.elevationTuile(x, y) > 3) continue;
      let presEau = false;
      outer: for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (monde.dansLimites(nx, ny) && monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)) === 2) {
            presEau = true;
            break outer;
          }
        }
      }
      if (presEau && monde.temperature[monde.index(x, y)] > 0) candidats.push(monde.index(x, y));
    }
  }
  rng.melanger(candidats);

  for (let b = 0; b < nbBandes; b++) {
    const site = candidats.length > 0 ? candidats.pop()! : monde.index(Math.floor(t / 2), Math.floor(t / 2));
    const sx = site % t;
    const sy = Math.floor(site / t);
    const nomFamille = genererNomFamille(rng);
    const nomGroupe = `Bande ${nomFamille}`;
    const date: DateJeu = { an: etat.calendrier.an, mois: etat.calendrier.mois };
    const groupe = new Groupe(etat.prochainIdGroupe++, nomGroupe, NiveauGroupe.Bande, langueMereId, date);
    groupe.stocksCommuns = { nourriture: cfgI.stockNourritureInitialParBande };
    etat.groupes.set(groupe.id, groupe);

    for (let m = 0; m < tailleBande; m++) {
      const sexe = rng.chance(0.5) ? Sexe.Homme : Sexe.Femme;
      const ind = new Individu(etat.prochainIdIndividu++, '');
      ind.sexe = sexe;
      ind.nomFamille = nomFamille;
      ind.nom = nomComplet(genererPrenom(rng, sexe), nomFamille);
      ind.ageAnnees = distribuerAge(rng);
      ind.positionX = sx + rng.reel(-2, 2);
      ind.positionY = sy + rng.reel(-2, 2);
      ind.langueId = langueMereId;
      ind.groupeId = groupe.id;
      ind.neLe = { an: Math.max(1, date.an - Math.floor(ind.ageAnnees)), mois: rng.entier(1, 12) };
      for (const [attr, plage] of Object.entries(cfgI.attributsInnes)) {
        if (attr === 'sante') ind.sante.valeur = rng.reel(plage.min, plage.max);
        else (ind as unknown as Record<string, number>)[attr] = rng.reel(plage.min, plage.max);
      }
      for (const [comp, plage] of Object.entries(cfgI.competencesInitiales)) {
        ind.competences[comp as Competence] = rng.reel(plage.min, plage.max);
      }
      for (const idSavoir of idsSavoirsDepart) ind.connaissances.add(idSavoir);
      ind.traits = {
        honnetete: rng.reel(20, 80),
        courage: rng.reel(20, 80),
        colere: rng.reel(20, 80),
        ambition: rng.reel(20, 80),
        altruisme: rng.reel(20, 80),
        curiosite: rng.reel(20, 80),
      };
      groupe.membres.push(ind.id);
      etat.individus.set(ind.id, ind);
    }
    if (groupe.membres.length > 0) {
      const adultes = groupe.membres
        .map((id) => etat.individus.get(id)!)
        .filter((i) => i.ageAnnees >= cfgI.ageMaturiteMoyenAnnees && i.vivant)
        .sort((a, b) => b.ageAnnees - a.ageAnnees);
      groupe.dirigeantId = (adultes[0] ?? etat.individus.get(groupe.membres[0])!).id;
    }
    groupe.recalculerTerritoire(monde, etat.individus, etat.batiments, cfgS.rayonTerritoireDefautTuiles, cfgS.rayonTerritoireBatimentsTuiles);
    etat.journal.ajouter({
      date,
      type: TypeEvenement.Fondation,
      sujet: `Fondation de ${nomGroupe}`,
      description: `${tailleBande} individus s'installent près de (${sx}, ${sy}), stocks de départ : ${cfgI.stockNourritureInitialParBande} nourriture.`,
      individusImpliques: [...groupe.membres],
      tuileX: sx,
      tuileY: sy,
    });
  }
}

function distribuerAge(rng: import('../rng').Rng): number {
  const r = rng.suivant();
  if (r < 0.3) return rng.reel(0, 14);
  if (r < 0.75) return rng.reel(15, 45);
  if (r < 0.95) return rng.reel(45, 65);
  return rng.reel(65, 85);
}
