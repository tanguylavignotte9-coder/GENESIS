import { Rng } from '../rng';
import { Monde } from '../monde/monde';
import { Calendrier } from '../temps/calendrier';
import { Journal } from '../journal/journal';
import { Individu } from '../entites/individu';
import { Groupe } from '../groupes/groupe';
import { Objet } from '../economie/objet';
import { EntiteBatiment } from '../batiments/batiment';
import { Langue } from '../culture/langue';
import type { Religion } from '../culture/religion';
import { GrapheSavoir } from '../savoir/connaissance';
import type { ConfigComplete } from '../config/schema';
import { Simulation } from '../simulation';
import { MIGRATIONS, VERSION_SAUVEGARDE, type SauvegardeBrute } from './format';

export function serialiserSimulation(sim: Simulation, empreinteConfig: Record<string, string>, creeLe: string): string {
  const etat = sim.etat;
  const sauvegarde: SauvegardeBrute = {
    version: VERSION_SAUVEGARDE,
    seed: etat.seed,
    empreinteConfig: { ...empreinteConfig },
    creeLe,
    etat: {
      monde: etat.monde.serialiser(),
      calendrier: etat.calendrier.serialiser(),
      rngEtat: etat.rng.etat,
      journal: etat.journal.serialiser(),
      individus: Array.from(etat.individus.values()).map((i) => i.serialiser()),
      groupes: Array.from(etat.groupes.values()).map((g) => g.serialiser()),
      objets: Array.from(etat.objets.values()).map((o) => o.serialiser()),
      batiments: Array.from(etat.batiments.values()).map((b) => b.serialiser()),
      langues: Array.from(etat.langues.values()).map((l) => l.serialiser()),
      religions: Array.from(etat.religions.values()),
      savoir: etat.savoir.serialiser(),
      prochainIdIndividu: etat.prochainIdIndividu,
      prochainIdGroupe: etat.prochainIdGroupe,
      prochainIdObjet: etat.prochainIdObjet,
      prochainIdBatiment: etat.prochainIdBatiment,
      prochainIdLangue: etat.prochainIdLangue,
      prochainIdReligion: etat.prochainIdReligion,
      zoneActive: etat.zoneActive,
      extinctionTotale: etat.extinctionTotale,
      boucleTempsVitesse: sim.vitesseActuelle,
    },
  };
  return JSON.stringify(sauvegarde);
}

export interface ResultatReprise {
  simulation: Simulation;
  avertissements: string[];
}

export function deserialiserSimulation(
  json: string,
  config: ConfigComplete,
  empreintesAttendues: Record<string, string>,
): ResultatReprise {
  const brut = JSON.parse(json) as SauvegardeBrute;
  if (typeof brut.version !== 'number' || brut.version > VERSION_SAUVEGARDE) {
    throw new Error(`Version de sauvegarde non supportée : ${brut.version} (attendue <= ${VERSION_SAUVEGARDE})`);
  }
  void MIGRATIONS;
  const avertissements: string[] = [];
  for (const [nom, empreinte] of Object.entries(empreintesAttendues)) {
    if (brut.empreinteConfig?.[nom] !== empreinte) {
      avertissements.push(
        `La configuration "${nom}.jsonc" a changé depuis la sauvegarde : la reprise exacte n'est pas garantie pour ce domaine.`,
      );
    }
  }
  const e = brut.etat as Record<string, unknown>;
  const monde = new Monde(config.monde);
  monde.restaurer(e.monde as Record<string, unknown>, config.monde);
  const calendrier = new Calendrier(config.temps);
  calendrier.restaurer(e.calendrier as { an: number; mois: number; jourDansMois: number });
  const rng = new Rng(brut.seed);
  rng.restaurer(e.rngEtat as number);
  const journal = new Journal();
  journal.restaurer(e.journal as { evenements: never[]; prochainId: number });
  const individus = new Map<number, Individu>();
  for (const d of e.individus as Record<string, unknown>[]) individus.set(d.id as number, Individu.restaurer(d));
  const groupes = new Map<number, Groupe>();
  for (const d of e.groupes as Record<string, unknown>[]) groupes.set(d.id as number, Groupe.restaurer(d));
  const objets = new Map<number, Objet>();
  for (const d of e.objets as Record<string, unknown>[]) objets.set(d.id as number, Objet.restaurer(d));
  const batiments = new Map<number, EntiteBatiment>();
  for (const d of e.batiments as Record<string, unknown>[]) batiments.set(d.id as number, EntiteBatiment.restaurer(d));
  const langues = new Map<number, Langue>();
  for (const d of e.langues as Record<string, unknown>[]) langues.set(d.id as number, Langue.restaurer(d));
  const religions = new Map<number, Religion>();
  for (const d of e.religions as Religion[]) religions.set(d.id, { ...d, fondeeLe: { ...d.fondeeLe }, dieux: [...d.dieux], tabous: [...d.tabous], joursSacres: [...d.joursSacres] });
  const savoir = new GrapheSavoir();
  savoir.restaurer(e.savoir as never[]);
  const sim = new Simulation(config, brut.seed);
  sim.etat.monde = monde;
  sim.etat.calendrier = calendrier;
  sim.etat.rng = rng;
  sim.etat.journal = journal;
  sim.etat.individus = individus;
  sim.etat.groupes = groupes;
  sim.etat.objets = objets;
  sim.etat.batiments = batiments;
  sim.etat.langues = langues;
  sim.etat.religions = religions;
  sim.etat.savoir = savoir;
  sim.etat.prochainIdIndividu = e.prochainIdIndividu as number;
  sim.etat.prochainIdGroupe = e.prochainIdGroupe as number;
  sim.etat.prochainIdObjet = e.prochainIdObjet as number;
  sim.etat.prochainIdBatiment = e.prochainIdBatiment as number;
  sim.etat.prochainIdLangue = e.prochainIdLangue as number;
  sim.etat.prochainIdReligion = e.prochainIdReligion as number;
  sim.etat.zoneActive = (e.zoneActive as EtatPartageZone) ?? null;
  sim.etat.extinctionTotale = e.extinctionTotale as boolean;
  sim.definirVitesse(e.boucleTempsVitesse as number);
  return { simulation: sim, avertissements };
}

type EtatPartageZone = { x0: number; y0: number; x1: number; y1: number } | null;
