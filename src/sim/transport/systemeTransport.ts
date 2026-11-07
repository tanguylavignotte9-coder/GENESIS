import { Competence } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import { EntiteBatiment } from '../batiments/batiment';
import { EntiteVehicule } from './vehicule';
import { TypeEvenement } from '../journal/journal';
import { connaissancesGroupe } from '../savoir/systemeSavoir';
import { SAVOIR_PAR_BATIMENT } from '../savoir/arbreTechnologique';
import { mourir } from '../entites/boucleIndividu';
import type { Individu } from '../entites/individu';

export function aUnBateau(etat: EtatPartage, groupeId: number): boolean {
  for (const v of etat.vehicules.values()) {
    if (v.groupeId === groupeId && v.type === 'bateau' && !v.coule && !v.enConstruction) return true;
  }
  return false;
}

export function decisionTransportMensuelle(etat: EtatPartage, config: ConfigComplete): void {
  const cfgB = config.batiments;
  for (const groupe of etat.groupes.values()) {
    if (groupe.chantierEnCours !== null) continue;
    const vivants = groupe.membres.map((id) => etat.individus.get(id)).filter((i): i is Individu => !!i && i.vivant);
    if (vivants.length === 0) continue;
    const campX = Math.round(vivants.reduce((s, i) => s + i.positionX, 0) / vivants.length);
    const campY = Math.round(vivants.reduce((s, i) => s + i.positionY, 0) / vivants.length);
    const monde = etat.monde;
    const connus = connaissancesGroupe(etat, groupe.id);

    const coteProche = aCoteEauSalee(monde, campX, campY, 15);
    const idNavale = etat.savoir.tous().find((c) => c.nom === 'construction-navale')?.id;

    if (coteProche && idNavale !== undefined && connus.has(idNavale)) {
      if (!groupe.aUnBatiment('ponton', etat.batiments)) {
        const caseEau = trouverBordEau(monde, campX, campY, 15);
        if (caseEau) lancerChantier(etat, config, groupe, vivants[0], 'ponton', caseEau.x, caseEau.y);
        continue;
      }
      const idPort = etat.savoir.tous().find((c) => c.nom === 'port')?.id;
      if (idPort !== undefined && connus.has(idPort) && !groupe.aUnBatiment('port', etat.batiments)) {
        const caseEau = trouverBordEau(monde, campX, campY, 15);
        if (caseEau) {
          lancerChantier(etat, config, groupe, vivants[0], 'port', caseEau.x, caseEau.y);
          continue;
        }
      }
      if (groupe.aUnBatiment('port', etat.batiments) && !aUnBateau(etat, groupe.id)) {
        lancerChantierVehicule(etat, config, groupe, vivants[0], 'bateau', campX, campY);
        continue;
      }
    }

    const idCharrette = etat.savoir.tous().find((c) => c.nom === 'charrette')?.id;
    if (idCharrette !== undefined && connus.has(idCharrette) && !aUnCharrette(etat, groupe.id)) {
      lancerChantierVehicule(etat, config, groupe, vivants[0], 'charrette', campX, campY);
    }
  }
}

function aUnCharrette(etat: EtatPartage, groupeId: number): boolean {
  for (const v of etat.vehicules.values()) {
    if (v.groupeId === groupeId && v.type === 'charrette' && !v.coule && !v.enConstruction) return true;
  }
  return false;
}

function lancerChantier(etat: EtatPartage, config: ConfigComplete, groupe: { id: number; nom: string; chantierEnCours: number | null }, ouvrier: Individu, type: string, x: number, y: number): void {
  const def = config.batiments.types[type];
  if (!def) return;
  const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
  const b = new EntiteBatiment(etat.prochainIdBatiment++, type, x, y, def.materiaux, date, groupe.id, def.dureeJours);
  etat.batiments.set(b.id, b);
  ouvrier.chantierId = b.id;
  groupe.chantierEnCours = b.id;
  etat.journal.ajouter({
    date,
    type: TypeEvenement.Fondation,
    sujet: 'Chantier lancé',
    description: `${groupe.nom} lance un(e) ${type} près de (${x}, ${y}).`,
    individusImpliques: [ouvrier.id],
    tuileX: x,
    tuileY: y,
  });
}

function lancerChantierVehicule(etat: EtatPartage, config: ConfigComplete, groupe: { id: number; nom: string; chantierEnCours: number | null }, ouvrier: Individu, type: string, x: number, y: number): void {
  const def = config.batiments.types[type];
  if (!def) return;
  const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
  const v = new EntiteVehicule(etat.prochainIdVehicule++, type, x, y, def.capacite ?? 10, date, groupe.id, def.dureeJours);
  etat.vehicules.set(v.id, v);
  ouvrier.chantierId = -v.id;
  groupe.chantierEnCours = -v.id;
  etat.journal.ajouter({
    date,
    type: TypeEvenement.Fondation,
    sujet: 'Chantier naval' ,
    description: `${groupe.nom} fait construire un(e) ${type} près de (${x}, ${y}).`,
    individusImpliques: [ouvrier.id],
    tuileX: x,
    tuileY: y,
  });
}

export function travailVehicule(etat: EtatPartage, config: ConfigComplete, ind: Individu, jours: number): void {
  const id = ind.chantierId;
  if (id === null || id >= 0) return;
  const v = etat.vehicules.get(-id);
  if (!v || !v.enConstruction) {
    ind.chantierId = null;
    return;
  }
  const comp = ind.competences[Competence.Construction] ?? 10;
  v.chantierRestantJours -= (comp / 100) * jours * 2;
  if (v.chantierRestantJours <= 0) {
    v.enConstruction = false;
    v.chantierRestantJours = 0;
    ind.chantierId = null;
    const groupe = v.groupeId !== null ? etat.groupes.get(v.groupeId) : undefined;
    if (groupe && groupe.chantierEnCours === -v.id) groupe.chantierEnCours = null;
    etat.journal.ajouter({
      date: { an: etat.calendrier.an, mois: etat.calendrier.mois },
      type: TypeEvenement.Fondation,
      sujet: 'Véhicule achevé',
      description: `Un(e) ${v.type} est prêt(e) pour ${groupe?.nom ?? 'un groupe'} près de (${v.x}, ${v.y}).`,
      individusImpliques: [ind.id],
      tuileX: v.x,
      tuileY: v.y,
    });
  }
}

export function naufrageMensuel(etat: EtatPartage, config: ConfigComplete): void {
  const monde = etat.monde;
  for (const v of etat.vehicules.values()) {
    if (v.type !== 'bateau' || v.coule || v.enConstruction) continue;
    if (!monde.dansLimites(Math.round(v.x), Math.round(v.y))) continue;
    const estEnMer = monde.estEauSalee(Math.round(v.x), Math.round(v.y));
    if (!estEnMer) continue;
    if (!etat.rng.chance(config.societe.chanceNaufrageParMois)) continue;
    v.coule = true;
    const date = { an: etat.calendrier.an, mois: etat.calendrier.mois };
    const nbPassagers = v.passagers.length;
    const idsPassagers = [...v.passagers];
    for (const pid of v.passagers) {
      const p = etat.individus.get(pid);
      if (p && p.vivant) {
        p.positionX = v.x;
        p.positionY = v.y;
        mourir(etat, config, p, 'naufrage');
      }
    }
    v.passagers = [];
    etat.journal.ajouter({
      date,
      type: TypeEvenement.Drame,
      sujet: 'Naufrage',
      description: `Le bateau près de (${Math.round(v.x)}, ${Math.round(v.y)}) a coulé. ${nbPassagers} passager(s) à bord.`,
      individusImpliques: idsPassagers,
      tuileX: Math.round(v.x),
      tuileY: Math.round(v.y),
    });
  }
}

function aCoteEauSalee(monde: EtatPartage['monde'], x: number, y: number, rayon: number): boolean {
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (monde.dansLimites(nx, ny) && monde.estEauSalee(nx, ny)) return true;
    }
  }
  return false;
}

function trouverBordEau(monde: EtatPartage['monde'], x: number, y: number, rayon: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dy = -rayon; dy <= rayon; dy++) {
    for (let dx = -rayon; dx <= rayon; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!monde.dansLimites(nx, ny) || monde.estEau(nx, ny)) continue;
      let eau = false;
      for (const [ex, ey] of monde.voisins8(nx, ny)) {
        if (monde.estEau(ex, ey)) {
          eau = true;
          break;
        }
      }
      if (!eau) continue;
      const d = Math.hypot(nx - x, ny - y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}
