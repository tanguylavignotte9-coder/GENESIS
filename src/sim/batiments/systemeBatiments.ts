import { Competence, NiveauGroupe, Matiere, estGisement } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { EntiteBatiment } from './batiment';
import { TypeEvenement } from '../journal/journal';
import type { Individu } from '../entites/individu';
import { SAVOIR_PAR_BATIMENT, RESSOURCE_PAR_MATIERE } from '../savoir/arbreTechnologique';

import { connaissancesGroupe } from '../savoir/systemeSavoir';
import { matiereGisement } from '../monde/generateur';

export function decisionConstructionMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfgB = config.batiments;
  const cfgS = config.societe;
  for (const groupe of etat.groupes.values()) {
    if (groupe.chantierEnCours !== null) continue;
    const vivants = groupe.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    if (vivants.length === 0) continue;
    const campX = Math.round(vivants.reduce((s, i) => s + i!.positionX, 0) / vivants.length);
    const campY = Math.round(vivants.reduce((s, i) => s + i!.positionY, 0) / vivants.length);
    const monde = etat.monde;
    if (!monde.dansLimites(campX, campY)) continue;

    let type: string | null = null;
    let tx = campX;
    let ty = campY;
    if (!groupe.aUnBatiment('feuDeCamp', etat.batiments)) {
      type = 'feuDeCamp';
    } else if (groupe.nbBatiments('hutte', etat.batiments) < cfgS.nbHuttesPourSedentarisation) {
      type = 'hutte';
    } else if (!aEauDouceProche(monde, campX, campY, 3) && !groupe.aUnBatiment('puits', etat.batiments)) {
      type = 'puits';
    } else if ((groupe.stocksCommuns.nourriture ?? 0) > cfgS.seuilStockNourriturePourGrenier && !groupe.aUnBatiment('grenier', etat.batiments)) {
      type = 'grenier';
    } else if (groupe.niveau >= NiveauGroupe.Village && !groupe.aUnBatiment('champ', etat.batiments)) {
      const champ = trouverChamp(monde, campX, campY, 8);
      if (champ) {
        type = 'champ';
        tx = champ.x;
        ty = champ.y;
      }
    }
    if (!type) {
      const connus = connaissancesGroupe(etat, groupe.id);
      for (const [typeBat, savoirNom] of Object.entries(SAVOIR_PAR_BATIMENT)) {
        if (groupe.aUnBatiment(typeBat, etat.batiments)) continue;
        const idSavoir = etat.savoir.tous().find((c) => c.nom === savoirNom)?.id;
        if (idSavoir === undefined || !connus.has(idSavoir)) continue;
        const def = cfgB.types[typeBat];
        if (!def) continue;
        if (def.ressource) {
          const gisement = trouverGisement(monde, campX, campY, def.ressource, config.societe.rayonRechercheGisementTuiles);
          if (!gisement) continue;
          tx = gisement.x;
          ty = gisement.y;
        } else {
          const voisin = trouverCaseLibre(monde, campX, campY);
          if (!voisin) continue;
          tx = voisin.x;
          ty = voisin.y;
        }
        type = typeBat;
        break;
      }
    }
    if (!type) continue;
    const def = cfgB.types[type];
    if (!def) continue;
    if (!monde.dansLimites(tx, ty) || monde.estEau(tx, ty)) continue;

    const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
    const batiment = new EntiteBatiment(etat.prochainIdBatiment++, type, tx, ty, def.materiaux, date, groupe.id, def.dureeJours);
    etat.batiments.set(batiment.id, batiment);

    let meilleur = vivants[0]!;
    let meilleureComp = -1;
    for (const ind of vivants) {
      const c = ind.competences[Competence.Construction] ?? 0;
      if (c > meilleureComp && ind.chantierId === null) {
        meilleureComp = c;
        meilleur = ind;
      }
    }
    meilleur.chantierId = batiment.id;
    groupe.chantierEnCours = batiment.id;
    etat.journal.ajouter({
      date,
      type: TypeEvenement.Fondation,
      sujet: 'Chantier lancé',
      description: `${groupe.nom} lance la construction d'un(e) ${type} près de (${tx}, ${ty}), ${meilleur.nom} en est le bâtisseur.`,
      individusImpliques: [meilleur.id],
      tuileX: tx,
      tuileY: ty,
    });
  }
}

function terminerChantier(etat: EtatPartage, config: ConfigComplete, b: EntiteBatiment): void {
  b.enConstruction = false;
  b.chantierRestantJours = 0;
  const groupe = b.groupeId !== null ? etat.groupes.get(b.groupeId) : undefined;
  if (groupe && groupe.chantierEnCours === b.id) groupe.chantierEnCours = null;
  for (const ind of etat.individus.values()) {
    if (ind.chantierId === b.id) ind.chantierId = null;
  }
  const monde = etat.monde;
  const boisDemande = b.materiaux.bois ?? 0;
  if (boisDemande > 0) {
    let bois = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = b.x + dx;
        const ny = b.y + dy;
        if (!monde.dansLimites(nx, ny)) continue;
        const pris = Math.min(monde.biomasseVegetation[monde.index(nx, ny)], boisDemande - bois);
        monde.biomasseVegetation[monde.index(nx, ny)] -= pris;
        bois += pris;
      }
    }
    if (groupe) groupe.stocksCommuns.bois = (groupe.stocksCommuns.bois ?? 0) + bois;
  }
  const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
  if (b.type === 'hutte' && groupe && groupe.niveau === NiveauGroupe.Bande && groupe.nbBatiments('hutte', etat.batiments) + 1 >= config.societe.nbHuttesPourSedentarisation) {
    groupe.niveau = NiveauGroupe.Village;
    etat.journal.ajouter({
      date,
      type: TypeEvenement.Fondation,
      sujet: 'Sédentarisation',
      description: `${groupe.nom} pose ses premières huttes permanentes près de (${b.x}, ${b.y}) et devient un village.`,
      individusImpliques: [...groupe.membres],
      tuileX: b.x,
      tuileY: b.y,
    });
  }
  if (b.type === 'champ') {
    etat.champs.add(monde.index(b.x, b.y));
  }
  etat.journal.ajouter({
    date,
    type: TypeEvenement.Fondation,
    sujet: 'Bâtiment achevé',
    description: `Un(e) ${b.type} est achevé(e) près de (${b.x}, ${b.y}) pour ${groupe?.nom ?? 'un groupe'}.`,
    individusImpliques: [],
    tuileX: b.x,
    tuileY: b.y,
  });
}

export function usureMensuelleBatiments(etat: EtatPartage, config: ConfigComplete): void {
  const aSupprimer: number[] = [];
  for (const b of etat.batiments.values()) {
    if (b.enConstruction) continue;
    b.durabilite -= config.batiments.usureParMois;
    if (b.durabilite <= 0) {
      aSupprimer.push(b.id);
    }
  }
  for (const id of aSupprimer) {
    const b = etat.batiments.get(id)!;
    etat.batiments.delete(id);
    if (b.type === 'champ') etat.champs.delete(etat.monde.index(b.x, b.y));
    for (const ind of etat.individus.values()) {
      if (ind.chantierId === id) ind.chantierId = null;
    }
    const groupe = b.groupeId !== null ? etat.groupes.get(b.groupeId) : undefined;
    if (groupe && groupe.chantierEnCours === id) groupe.chantierEnCours = null;
    etat.journal.ajouter({
      date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
      type: TypeEvenement.Drame,
      sujet: 'Effondrement',
      description: `Un(e) ${b.type} de ${groupe?.nom ?? 'un groupe'} s'est effondré(e) à l'usure près de (${b.x}, ${b.y}).`,
      individusImpliques: [],
      tuileX: b.x,
      tuileY: b.y,
    });
  }
}

function trouverGisement(monde: EtatPartage['monde'], x: number, y: number, ressource: string, rayon: number): { x: number; y: number } | null {
  const matiereCible = matiereGisement(ressource);
  for (let r = 2; r <= rayon; r += 2) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!monde.dansLimites(nx, ny)) continue;
        const elev = monde.elevationTuile(nx, ny);
        if (monde.matiereNiveau(nx, ny, elev) === matiereCible && monde.quantiteGisement[monde.indexNiveau(nx, ny, elev)] > 0) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

function trouverCaseLibre(monde: EtatPartage['monde'], x: number, y: number): { x: number; y: number } | null {
  for (const [nx, ny] of monde.voisins8(x, y)) {
    if (!monde.estEau(nx, ny) && !estGisement(monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)))) return { x: nx, y: ny };
  }
  if (!monde.estEau(x, y)) return { x, y };
  return null;
}

export function extractionMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfgB = config.batiments;
  const cfgS = config.societe;
  for (const b of etat.batiments.values()) {
    if (b.enConstruction) continue;
    const def = cfgB.types[b.type];
    if (!def || !def.ressource) continue;
    const monde = etat.monde;
    const i = monde.index(b.x, b.y);
    const elev = monde.elevationTuile(b.x, b.y);
    const idxNiveau = monde.indexNiveau(b.x, b.y, elev);
    const m = monde.matiereNiveau(b.x, b.y, elev);
    if (!estGisement(m) || RESSOURCE_PAR_MATIERE_ENUM[m] !== def.ressource) continue;
    const dispo = monde.quantiteGisement[idxNiveau];
    const pris = Math.min(dispo, cfgS.extractionParMoisParMine);
    monde.quantiteGisement[idxNiveau] = dispo - pris;
    const groupe = b.groupeId !== null ? etat.groupes.get(b.groupeId) : undefined;
    if (groupe) groupe.stocksCommuns[def.ressource] = (groupe.stocksCommuns[def.ressource] ?? 0) + pris;
    if (monde.quantiteGisement[idxNiveau] <= 0) {
      monde.matiere[idxNiveau] = Matiere.Terre;
      etat.journal.ajouter({
        date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
        type: TypeEvenement.Monde,
        sujet: 'Gisement épuisé',
        description: `Le gisement de ${def.ressource} près de (${b.x}, ${b.y}) est épuisé.`,
        individusImpliques: [],
        tuileX: b.x,
        tuileY: b.y,
      });
    }
    void i;
  }
}

const RESSOURCE_PAR_MATIERE_ENUM: Partial<Record<Matiere, string>> = {
  [Matiere.Charbon]: 'charbon',
  [Matiere.Gaz]: 'gaz',
  [Matiere.Uranium]: 'uranium',
  [Matiere.Petrole]: 'petrole',
  [Matiere.Fer]: 'fer',
  [Matiere.Cuivre]: 'cuivre',
  [Matiere.Etain]: 'etain',
  [Matiere.Or]: 'or',
  [Matiere.Argent]: 'argent',
  [Matiere.Sel]: 'sel',
};

void RESSOURCE_PAR_MATIERE;

export function pollutionMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfgB = config.batiments;
  const cfgS = config.societe;
  const monde = etat.monde;
  for (const b of etat.batiments.values()) {
    if (b.enConstruction) continue;
    const def = cfgB.types[b.type];
    if (!def || !def.polluant) continue;
    if (b.type === 'centrale-charbon') {
      const groupe = b.groupeId !== null ? etat.groupes.get(b.groupeId) : undefined;
      const stock = groupe?.stocksCommuns.charbon ?? 0;
      if (stock < cfgS.consommationCharbonCentraleParMois) continue;
      if (groupe) groupe.stocksCommuns.charbon = stock - cfgS.consommationCharbonCentraleParMois;
    }
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = b.x + dx;
        const ny = b.y + dy;
        if (!monde.dansLimites(nx, ny)) continue;
        const d = Math.hypot(dx, dy);
        if (d > 3) continue;
        const i = monde.index(nx, ny);
        monde.pollution[i] = Math.min(1, monde.pollution[i] + cfgS.pollutionParMoisParBatimentPolluant * (1 - d / 4));
        if (monde.pollution[i] > cfgS.seuilPollutionSante) {
          monde.biomasseVegetation[i] = Math.max(0, monde.biomasseVegetation[i] - cfgS.perteBiomassePollutionParMois);
        }
      }
    }
  }
  const t = monde.taille;
  for (let i = 0; i < t * t; i++) {
    if (monde.pollution[i] > 0) monde.pollution[i] = Math.max(0, monde.pollution[i] - 0.01);
  }
}

function aEauDouceProche(monde: EtatPartage['monde'], x: number, y: number, rayon: number): boolean {
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (monde.dansLimites(nx, ny) && monde.matiereNiveau(nx, ny, monde.elevationTuile(nx, ny)) === 2) return true;
    }
  }
  return false;
}

function trouverChamp(monde: EtatPartage['monde'], x: number, y: number, rayon: number): { x: number; y: number } | null {
  let best = 0;
  let bestPos: { x: number; y: number } | null = null;
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!monde.dansLimites(nx, ny) || monde.estEau(nx, ny)) continue;
      const b = monde.biomasseVegetation[monde.index(nx, ny)];
      if (b > best) {
        best = b;
        bestPos = { x: nx, y: ny };
      }
    }
  }
  return bestPos;
}

export { terminerChantier };
