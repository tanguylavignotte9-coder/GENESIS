import { Action, Competence, Sexe, Matiere } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { Individu, TypeRelation } from './individu';
import { creerEnfant } from './genetique';
import { TypeEvenement } from '../journal/journal';
import { animauxProches, construireIndexSpatial } from '../faune/systemeFaune';
import { construireEspeces } from '../faune/especes';
import { genererPrenom, nomComplet } from '../culture/noms';
import { tickIndividuOuvrier } from '../batiments/chantier';

export type IndexAnimaux = Map<number, number[]>;

export function indexAnimauxPourTick(etat: EtatPartage): IndexAnimaux {
  return construireIndexSpatial(etat);
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function tickIndividu(etat: EtatPartage, config: ConfigComplete, ind: Individu, jours: number, indexAnimaux: IndexAnimaux): void {
  if (!ind.vivant) return;
  if (ind.chantierId !== null) {
    tickIndividuOuvrier(etat, config, ind, jours);
    return;
  }
  const cfg = config.individus;
  const monde = etat.monde;
  const rng = etat.rng;
  const facteurMois = jours / config.temps.joursParMois;
  const facteurAn = jours / (config.temps.joursParMois * config.temps.moisParAn);

  ind.ageAnnees += facteurAn;

  const mere = ind.mere !== null ? etat.individus.get(ind.mere) : undefined;
  const allaitementActif =
    ind.ageAnnees < cfg.allaitementAnnees &&
    mere !== undefined &&
    mere.vivant &&
    Math.hypot(mere.positionX - ind.positionX, mere.positionY - ind.positionY) <= 3;
  if (allaitementActif) {
    ind.besoins.faim = Math.min(ind.besoins.faim, 15);
  } else {
    const rythme = ind.ageAnnees < cfg.allaitementAnnees ? 2 : 1;
    ind.besoins.faim = clamp100(ind.besoins.faim + cfg.faimParMois * facteurMois * rythme);
  }
  ind.besoins.soif = clamp100(ind.besoins.soif + cfg.soifParMois * facteurMois);
  ind.besoins.sommeil = clamp100(ind.besoins.sommeil + cfg.sommeilParMois * facteurMois);
  ind.besoins.stress = clamp100(ind.besoins.stress + cfg.stressParMois * facteurMois);
  ind.besoins.social = clamp100(ind.besoins.social + 1.5 * facteurMois);
  if (ind.ageAnnees >= cfg.ageMaturiteMoyenAnnees && ind.ageAnnees < 50) {
    ind.besoins.reproduction = clamp100(ind.besoins.reproduction + 2 * facteurMois);
  }

  const x = Math.round(ind.positionX);
  const y = Math.round(ind.positionY);
  if (!monde.dansLimites(x, y)) return;
  const i = monde.index(x, y);
  const temp = monde.temperature[i];

  const especes = construireEspeces(config.fauneFlore);
  const predateurs = animauxProches(etat, indexAnimaux, ind.positionX, ind.positionY, cfg.porteeFuitePredateurTuiles, (a) => {
    const e = especes.get(a.especeId);
    return e !== undefined && e.regime === 'predateur';
  });
  ind.besoins.securite = predateurs.length > 0 ? 100 : clamp100(ind.besoins.securite - 10 * facteurMois);

  if (temp < cfg.temperatureConfortCelsius) ind.sante.valeur -= cfg.perteSanteFroidParMois * facteurMois;
  if (ind.besoins.faim >= 80) ind.sante.valeur -= cfg.perteSanteFamineParMois * facteurMois;
  if (ind.besoins.soif >= 80) ind.sante.valeur -= cfg.perteSanteDeshydratationParMois * facteurMois;
  if (ind.besoins.sommeil >= 90) ind.sante.valeur -= cfg.perteSanteFatigueParMois * facteurMois;
  if (ind.besoins.stress >= 90) ind.sante.valeur -= cfg.perteSanteStressMaxParMois * facteurMois;
  if (ind.ageAnnees > cfg.debutSenescenceAnnees) {
    ind.force = clamp100(ind.force - cfg.perteForceParAnSenescence * facteurAn);
    ind.endurance = clamp100(ind.endurance - cfg.perteEnduranceParAnSenescence * facteurAn);
    ind.sante.valeur -= cfg.perteSanteSenescenceParMois * facteurMois;
  }

  const poids = cfg.poidsBesoins;
  const scores: Record<string, number> = {
    faim: ind.besoins.faim * poids.faim,
    soif: ind.besoins.soif * poids.soif,
    sommeil: ind.besoins.sommeil * poids.sommeil,
    securite: ind.besoins.securite * poids.securite,
    social: ind.besoins.social * poids.social * 0.4,
    reproduction: ind.besoins.reproduction * poids.reproduction * (ind.ageAnnees >= cfg.ageMaturiteMoyenAnnees ? 1 : 0),
  };
  let besoinMax = 'social';
  let scoreMax = -1;
  for (const [k, v] of Object.entries(scores)) {
    if (v > scoreMax) {
      scoreMax = v;
      besoinMax = k;
    }
  }

  const groupe = ind.groupeId !== null ? etat.groupes.get(ind.groupeId) : undefined;

  switch (besoinMax) {
    case 'faim': {
      if (groupe && (groupe.stocksCommuns.nourriture ?? 0) > 0) {
        const pris = Math.min(groupe.stocksCommuns.nourriture, cfg.consommationNourritureParRepas);
        groupe.stocksCommuns.nourriture -= pris;
        ind.besoins.faim = clamp100(ind.besoins.faim - 60);
      } else if (ind.besoins.faim >= cfg.seuilCannibalismeFaim && monde.carcasseNourriture[i] > 0) {
        const pris = Math.min(monde.carcasseNourriture[i], cfg.consommationNourritureParRepas * 2);
        monde.carcasseNourriture[i] -= pris;
        ind.besoins.faim = clamp100(ind.besoins.faim - 35);
        ind.besoins.stress = clamp100(ind.besoins.stress + cfg.stressCannibalisme);
        ind.dernierActeCannibalisme = { an: etat.calendrier.an, mois: etat.calendrier.mois };
        etat.journal.ajouter({
          date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
          type: TypeEvenement.Drame,
          sujet: 'Cannibalisme',
          description: `${ind.nom} a mangé un mort de faim extrême près de (${x}, ${y}).`,
          individusImpliques: [ind.id],
          tuileX: x,
          tuileY: y,
        });
      } else if (monde.biomasseVegetation[i] > 3) {
        const comp = ind.competences[Competence.Agriculture] ?? 0;
        const pris = Math.min(monde.biomasseVegetation[i], config.fauneFlore.rendementCueilletteParMois * (1 + comp / 100) * facteurMois * config.temps.joursParMois * 0.1);
        monde.biomasseVegetation[i] -= pris;
        if (groupe) {
          const capacite = groupe.aUnBatiment('grenier', etat.batiments) ? config.batiments.capaciteGrenierBase : config.societe.capaciteStockSansGrenier;
          groupe.ajouterStock('nourriture', pris, capacite);
          groupe.ajouterStock('bois', pris * 0.5, 100000);
        }
        ind.besoins.faim = clamp100(ind.besoins.faim - 40);
        ind.competences[Competence.Agriculture] = Math.min(100, comp + cfg.tauxApprentissageParMois * 10 * facteurMois);
      } else {
        const proie = animauxProches(etat, indexAnimaux, ind.positionX, ind.positionY, cfg.porteeChasseHumaineTuiles, (a) => {
          const e = especes.get(a.especeId);
          return e !== undefined && e.regime !== 'predateur';
        });
        if (proie.length > 0) {
          const comp = ind.competences[Competence.Chasse] ?? 0;
          if (rng.chance(cfg.chanceChasseParMois * (0.3 + comp / 100) * facteurMois * 2)) {
            const victime = rng.choix(proie);
            const ve = especes.get(victime.especeId);
            victime.vivant = false;
            victime.causeMort = 'chasse';
            const butin = ve ? ve.tailleCarcasse : 5;
            if (groupe) {
              const capacite = groupe.aUnBatiment('grenier', etat.batiments) ? config.batiments.capaciteGrenierBase : config.societe.capaciteStockSansGrenier;
              groupe.ajouterStock('nourriture', butin, capacite);
            }
            monde.carcasseNourriture[monde.index(Math.round(victime.positionX), Math.round(victime.positionY))] += butin * 0.2;
            ind.besoins.faim = clamp100(ind.besoins.faim - 50);
            ind.competences[Competence.Chasse] = Math.min(100, comp + cfg.tauxApprentissageParMois * 12 * facteurMois);
          }
        } else {
          deplacerVers(etat, config, ind, meilleureBiomasse(etat, ind, cfg.porteePerceptionTuiles), jours);
        }
      }
      break;
    }
    case 'soif': {
      let eauProche = false;
      for (const [nx, ny] of monde.voisins8(x, y)) {
        if (monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)) === Matiere.EauDouce) {
          eauProche = true;
          break;
        }
      }
      if (monde.matiereNiveau(x, y, monde.elevationTuile(x, y)) === Matiere.EauDouce) eauProche = true;
      if (eauProche) {
        ind.besoins.soif = clamp100(ind.besoins.soif - 80);
      } else {
        deplacerVers(etat, config, ind, plusProcheEau(etat, ind, cfg.porteePerceptionTuiles), jours);
      }
      break;
    }
    case 'sommeil': {
      ind.besoins.sommeil = clamp100(ind.besoins.sommeil - 70);
      ind.besoins.stress = clamp100(ind.besoins.stress - 5);
      break;
    }
    case 'securite': {
      if (predateurs.length > 0) {
        const p = predateurs[0];
        deplacerVers(etat, config, ind, { x: Math.round(ind.positionX + Math.sign(ind.positionX - p.positionX) * 5), y: Math.round(ind.positionY + Math.sign(ind.positionY - p.positionY) * 5) }, jours);
        ind.besoins.securite = clamp100(ind.besoins.securite - 40);
      }
      break;
    }
    case 'reproduction': {
      if (ind.sexe === Sexe.Femme && !ind.grossesse && ind.ageAnnees >= cfg.ageMaturiteMoyenAnnees && ind.ageAnnees < 50) {
        const partenaire = trouverPartenaire(etat, ind, cfg);
        if (partenaire && rng.chance(cfg.chanceReproductionParMois * facteurMois * config.temps.joursParMois * 0.2)) {
          ind.grossesse = { pereRegistreId: partenaire.id, pereBiologiqueId: partenaire.id, moisRestants: cfg.dureeGestationMois };
          ind.partenaires.push(partenaire.id);
          partenaire.partenaires.push(ind.id);
          ind.ajouterRelation(partenaire.id, TypeRelation.Romantique, 60);
          partenaire.ajouterRelation(ind.id, TypeRelation.Romantique, 60);
          ind.besoins.reproduction = 0;
        }
      }
      break;
    }
    default: {
      if (groupe) {
        const autre = groupe.membres
          .map((id) => etat.individus.get(id))
          .find((a) => a && a.vivant && a.id !== ind.id && Math.hypot(a.positionX - ind.positionX, a.positionY - ind.positionY) <= 3);
        if (autre) {
          ind.besoins.social = clamp100(ind.besoins.social - 30);
          ind.ajouterRelation(autre.id, TypeRelation.Amical, 5);
          ind.bonheur = clamp100(ind.bonheur + 3 * facteurMois);
        }
      }
    }
  }

  if (ind.besoins.faim < 50 && ind.besoins.soif < 50 && ind.besoins.sommeil < 50) ind.bonheur = clamp100(ind.bonheur + 1 * facteurMois);
  if (ind.besoins.stress > 80) ind.bonheur = clamp100(ind.bonheur - 2 * facteurMois);

  if (ind.grossesse) {
    ind.grossesse.moisRestants -= facteurMois;
    if (ind.grossesse.moisRestants <= 0) {
      accoucher(etat, config, ind);
    }
  }

  if (ind.sante.valeur <= 0) {
    let cause = 'sénescence';
    if (ind.besoins.faim >= 90) cause = 'famine';
    else if (ind.besoins.soif >= 90) cause = 'déshydratation';
    else if (temp < cfg.temperatureConfortCelsius) cause = 'froid';
    else if (ind.ageAnnees > cfg.debutSenescenceAnnees + 20) cause = 'vieillesse';
    mourir(etat, config, ind, cause);
  }
}

function accoucher(etat: EtatPartage, config: ConfigComplete, mere: Individu): void {
  const rng = etat.rng;
  const pereRegistre = etat.individus.get(mere.grossesse!.pereRegistreId);
  const pereBio = etat.individus.get(mere.grossesse!.pereBiologiqueId);
  if (!pereRegistre || !pereBio || !pereRegistre.vivant) {
    mere.grossesse = null;
    return;
  }
  const sexe = rng.chance(0.5) ? Sexe.Homme : Sexe.Femme;
  const prenom = genererPrenom(rng, sexe);
  const bebe = creerEnfant(etat.prochainIdIndividu++, nomComplet(prenom, pereBio.nomFamille || mere.nomFamille), pereRegistre, mere, pereBio, rng, config.individus, { an: etat.calendrier.an, mois: etat.calendrier.mois }, mere.langueId);
  bebe.nomFamille = pereBio.nomFamille || mere.nomFamille;
  bebe.positionX = mere.positionX + rng.reel(-0.5, 0.5);
  bebe.positionY = mere.positionY + rng.reel(-0.5, 0.5);
  bebe.groupeId = mere.groupeId;
  if (mere.groupeId !== null) {
    const g = etat.groupes.get(mere.groupeId);
    if (g) g.membres.push(bebe.id);
  }
  bebe.ajouterRelation(mere.id, TypeRelation.Famille, 90);
  bebe.ajouterRelation(pereBio.id, TypeRelation.Famille, 90);
  mere.ajouterRelation(bebe.id, TypeRelation.Famille, 90);
  etat.individus.set(bebe.id, bebe);
  mere.grossesse = null;
  mere.besoins.reproduction = 0;
  etat.journal.ajouter({
    date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
    type: TypeEvenement.Naissance,
    sujet: 'Naissance',
    description: `${bebe.nom} est né(e) de ${mere.nom} et ${pereRegistre.nom}.`,
    individusImpliques: [bebe.id, mere.id, pereRegistre.id],
    tuileX: Math.round(mere.positionX),
    tuileY: Math.round(mere.positionY),
  });
}

export function mourir(etat: EtatPartage, config: ConfigComplete, ind: Individu, cause: string): void {
  if (!ind.vivant) return;
  ind.vivant = false;
  ind.causeMort = cause;
  ind.mortLe = { an: etat.calendrier.an, mois: etat.calendrier.mois };
  const x = Math.round(ind.positionX);
  const y = Math.round(ind.positionY);
  if (etat.monde.dansLimites(x, y)) {
    etat.monde.carcasseNourriture[etat.monde.index(x, y)] += config.individus.tailleCarcasseHumain;
  }
  etat.journal.ajouter({
    date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
    type: TypeEvenement.Mort,
    sujet: 'Mort',
    description: `${ind.nom} est mort(e) de ${cause} à ${Math.round(ind.ageAnnees)} ans, près de (${x}, ${y}).`,
    individusImpliques: [ind.id],
    tuileX: x,
    tuileY: y,
  });
  for (const rel of ind.relations) {
    if (rel.intensite > 40 || rel.type === TypeRelation.Famille) {
      const proche = etat.individus.get(rel.vers);
      if (proche && proche.vivant) {
        proche.besoins.stress = clamp100(proche.besoins.stress + config.individus.stressDeuilProche);
        proche.ajouterMemoire(etat.journal.dernierId, `Deuil de ${ind.nom}`, 80, { an: etat.calendrier.an, mois: etat.calendrier.mois }, config.individus.capaciteMemoireEvenements);
      }
    }
  }
}

function trouverPartenaire(etat: EtatPartage, ind: Individu, cfg: ConfigComplete['individus']): Individu | undefined {
  const groupe = ind.groupeId !== null ? etat.groupes.get(ind.groupeId) : undefined;
  if (!groupe) return undefined;
  for (const id of groupe.membres) {
    const a = etat.individus.get(id);
    if (!a || !a.vivant || a.id === ind.id) continue;
    if (a.sexe === ind.sexe) continue;
    if (a.ageAnnees < cfg.ageMaturiteMoyenAnnees) continue;
    if (Math.hypot(a.positionX - ind.positionX, a.positionY - ind.positionY) <= cfg.distanceMaxPartenaireTuiles) return a;
  }
  return undefined;
}

function meilleureBiomasse(etat: EtatPartage, ind: Individu, portee: number): { x: number; y: number } | null {
  const monde = etat.monde;
  const x = Math.round(ind.positionX);
  const y = Math.round(ind.positionY);
  let best = monde.biomasseVegetation[monde.index(x, y)];
  let bestPos: { x: number; y: number } | null = null;
  const r = Math.min(portee, 12);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!monde.dansLimites(nx, ny)) continue;
      const b = monde.biomasseVegetation[monde.index(nx, ny)];
      if (b > best + 5) {
        best = b;
        bestPos = { x: nx, y: ny };
      }
    }
  }
  return bestPos;
}

function plusProcheEau(etat: EtatPartage, ind: Individu, portee: number): { x: number; y: number } | null {
  const monde = etat.monde;
  const x = Math.round(ind.positionX);
  const y = Math.round(ind.positionY);
  let bestDist = Infinity;
  let bestPos: { x: number; y: number } | null = null;
  const r = Math.min(portee, 15);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!monde.dansLimites(nx, ny)) continue;
      if (monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)) === Matiere.EauDouce) {
        const d = Math.hypot(nx - x, ny - y);
        if (d < bestDist) {
          bestDist = d;
          bestPos = { x: nx, y: ny };
        }
      }
    }
  }
  return bestPos;
}

function deplacerVers(etat: EtatPartage, config: ConfigComplete, ind: Individu, cible: { x: number; y: number } | null, jours: number): void {
  if (!cible) return;
  const monde = etat.monde;
  const facteurMois = jours / config.temps.joursParMois;
  const vitesse = config.individus.vitesseDeplacementBaseTuilesParMois * (0.5 + ind.vitesse / 200) * (0.4 + ind.endurance / 250);
  const distance = vitesse * facteurMois;
  if (distance <= 0) return;
  const dx = cible.x - ind.positionX;
  const dy = cible.y - ind.positionY;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return;
  const pas = Math.min(distance, dist);
  const nx = ind.positionX + (dx / dist) * pas;
  const ny = ind.positionY + (dy / dist) * pas;
  const rx = Math.round(ind.positionX);
  const ry = Math.round(ind.positionY);
  const tx = Math.round(nx);
  const ty = Math.round(ny);
  if (monde.dansLimites(tx, ty) && monde.estTraversable(rx, ry, tx, ty, false)) {
    ind.positionX = nx;
    ind.positionY = ny;
  } else if (monde.dansLimites(tx, ry) && monde.estTraversable(rx, ry, tx, ry, false)) {
    ind.positionX = nx;
  } else if (monde.dansLimites(rx, ty) && monde.estTraversable(rx, ry, rx, ty, false)) {
    ind.positionY = ny;
  }
}

