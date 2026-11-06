import { Simulation } from '../simulation';
import { TypeEvenement, type Evenement } from '../journal/journal';
import { sagaDuMoment, biographie, chroniqueGroupe, chroniqueEspece } from '../recit/chroniques';
import { ereGroupe } from '../savoir/systemeSavoir';
import type { ConfigComplete } from '../config/schema';
import { serialiserSimulation, deserialiserSimulation } from '../sauvegarde/serialiseur';

interface CtxWorker {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  setInterval: (cb: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

const ctx = globalThis as unknown as CtxWorker;

let sim: Simulation | null = null;
let config: ConfigComplete | null = null;
let empreintes: Record<string, string> = {};
let dernierDigestMois = -1;
let ticksDepuisDigest = 0;
let dernierJournalId = 0;
let dernierMoisSaga = -1;
let extinctionPostee = false;
let dernierAutosave = 0;

function envoyerDigest(forcer: boolean): void {
  if (!sim) return;
  const cal = sim.etat.calendrier;
  const cleMois = cal.an * 12 + cal.mois;
  ticksDepuisDigest++;
  if (!forcer && cleMois === dernierDigestMois && ticksDepuisDigest < 20) return;
  dernierDigestMois = cleMois;
  ticksDepuisDigest = 0;
  const couleurs = sim.digestCouleurs();
  ctx.postMessage(
    {
      type: 'digest',
      couleurs: couleurs.buffer,
      animaux: sim.digestAnimaux(),
      individus: sim.digestIndividus(),
      territoires: sim.digestTerritoires(),
      taille: sim.etat.monde.taille,
      an: cal.an,
      mois: cal.mois,
      vitesse: sim.vitesseActuelle,
      stats: {
        tuiles: sim.etat.monde.taille * sim.etat.monde.taille,
        individus: Array.from(sim.etat.individus.values()).filter((i) => i.vivant).length,
        animaux: Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length,
        evenements: sim.etat.journal.taille,
        empreinte: sim.empreinteMonde(),
      },
    },
    [couleurs.buffer],
  );
}

function envoyerJournal(): void {
  if (!sim) return;
  const nouveaux = sim.etat.journal.lire({ depuisId: dernierJournalId, limite: 50 });
  if (nouveaux.length > 0) {
    dernierJournalId = nouveaux[nouveaux.length - 1].id;
    ctx.postMessage({ type: 'journal', evenements: nouveaux as Evenement[] });
  }
}

function demarrerBoucle(): void {
  if (!sim || !config) return;
  const pas = config.temps.pasDeTempsSecondesReel;
  ctx.setInterval(() => {
    if (!sim || !config) return;
    sim.tick(pas);
    const maintenant = Date.now();
    if (maintenant - dernierAutosave >= config.temps.autosaveIntervalleSecondesReel * 1000) {
      dernierAutosave = maintenant;
      if (!sim.etat.extinctionTotale) {
        ctx.postMessage({ type: 'sauvegarde', slot: 'auto', contenu: serialiserSimulation(sim, empreintes, new Date().toISOString()) });
      }
    }
    if (sim.etat.extinctionTotale && !extinctionPostee) {
      extinctionPostee = true;
      ctx.postMessage({ type: 'extinction', chronique: chroniqueEspece(sim.etat) });
    }
    const cleMois = sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois;
    if (cleMois !== dernierMoisSaga) {
      dernierMoisSaga = cleMois;
      const saga = sagaDuMoment(sim.etat);
      if (saga) {
        ctx.postMessage({ type: 'saga', saga: { id: saga.id, type: saga.type, sujet: saga.sujet, description: saga.description, date: saga.date, individus: saga.individusImpliques } });
      }
    }
    envoyerDigest(false);
    envoyerJournal();
  }, pas * 1000);
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;
  try {
    switch (msg.type) {
      case 'init': {
        config = msg.config as ConfigComplete;
        empreintes = msg.empreintes as Record<string, string>;
        sim = new Simulation(config, msg.seed as number);
        const opts = (msg.options ?? {}) as { nbBandes?: number; tailleBande?: number };
        sim.initialiser({ nbBandes: opts.nbBandes, tailleBande: opts.tailleBande });
        dernierJournalId = 0;
        envoyerJournal();
        envoyerDigest(true);
        ctx.postMessage({ type: 'pret', seed: msg.seed, parametres: sim.etat.parametresDepart });
        demarrerBoucle();
        break;
      }
      case 'commande': {
        if (!sim) break;
        if (msg.commande === 'pause') sim.pause();
        else if (msg.commande === 'vitesse') sim.definirVitesse(msg.valeur as number);
        envoyerDigest(true);
        break;
      }
      case 'nouveauMonde': {
        if (!config) break;
        sim = new Simulation(config, msg.seed as number);
        const opts = (msg.options ?? {}) as { nbBandes?: number; tailleBande?: number };
        sim.initialiser({ nbBandes: opts.nbBandes, tailleBande: opts.tailleBande });
        dernierDigestMois = -1;
        dernierJournalId = 0;
        envoyerJournal();
        envoyerDigest(true);
        ctx.postMessage({ type: 'pret', seed: msg.seed, parametres: sim.etat.parametresDepart });
        break;
      }
      case 'sauvegarder': {
        if (!sim) break;
        const slot = (msg.slot as string) ?? 'auto';
        const contenu = serialiserSimulation(sim, empreintes, new Date().toISOString());
        ctx.postMessage({ type: 'sauvegarde', slot, contenu });
        break;
      }
      case 'zoneActive': {
        if (!sim) break;
        const z = msg.zone as { x0: number; y0: number; x1: number; y1: number } | null;
        sim.etat.zoneActive = z;
        break;
      }
      case 'charger': {
        if (!config) break;
        const res = deserialiserSimulation(msg.contenu as string, config, empreintes);
        sim = res.simulation;
        dernierDigestMois = -1;
        dernierJournalId = 0;
        envoyerJournal();
        envoyerDigest(true);
        ctx.postMessage({ type: 'charge', avertissements: res.avertissements });
        break;
      }
      case 'inspecterIndividu': {
        if (!sim) break;
        const ind = sim.etat.individus.get(msg.id as number);
        if (!ind) {
          ctx.postMessage({ type: 'fiche', id: msg.id, trouve: false });
          break;
        }
        const groupe = ind.groupeId !== null ? sim.etat.groupes.get(ind.groupeId) : undefined;
        ctx.postMessage({
          type: 'fiche',
          id: ind.id,
          trouve: true,
          fiche: {
            ...ind.serialiser(),
            connaissances: Array.from(ind.connaissances),
            groupeNom: groupe?.nom ?? null,
            groupeNiveau: groupe?.niveau ?? null,
            dirigeant: groupe?.dirigeantId === ind.id,
            relationsNoms: ind.relations.map((r) => ({ vers: r.vers, type: r.type, intensite: r.intensite, nom: sim!.etat.individus.get(r.vers)?.nom ?? `#${r.vers}` })),
            pereRegistreNom: ind.pereRegistre !== null ? sim.etat.individus.get(ind.pereRegistre)?.nom ?? null : null,
            pereBiologiqueNom: ind.pereBiologique !== null ? sim.etat.individus.get(ind.pereBiologique)?.nom ?? null : null,
            mereNom: ind.mere !== null ? sim.etat.individus.get(ind.mere)?.nom ?? null : null,
          },
        });
        break;
      }
      case 'inspecterGroupe': {
        if (!sim) break;
        const g = sim.etat.groupes.get(msg.id as number);
        if (!g) {
          ctx.postMessage({ type: 'ficheGroupe', id: msg.id, trouve: false });
          break;
        }
        const vivants = g.membres.map((id) => sim!.etat.individus.get(id)).filter((i) => i && i.vivant);
        const dirigeant = g.dirigeantId !== null ? sim!.etat.individus.get(g.dirigeantId) : undefined;
        ctx.postMessage({
          type: 'ficheGroupe',
          id: g.id,
          trouve: true,
          fiche: {
            nom: g.nom,
            niveau: g.niveau,
            ere: ereGroupe(sim.etat, g.id).nom,
            fondeLe: g.fondeLe,
            parentId: g.parentId,
            couleur: g.couleur,
            dirigeantNom: dirigeant?.nom ?? null,
            membresVivants: vivants.length,
            membresTotal: g.membres.length,
            bonheurMoyen: Math.round(g.bonheurMoyen(sim!.etat.individus)),
            stocksCommuns: { ...g.stocksCommuns },
            territoireTaille: g.territoire.length,
            batiments: Array.from(sim!.etat.batiments.values())
              .filter((b) => b.groupeId === g.id)
              .map((b) => ({ type: b.type, x: b.x, y: b.y, durabilite: Math.round(b.durabilite * 100), enConstruction: b.enConstruction })),
            politiques: { ...g.politiques },
          },
        });
        break;
      }
      case 'ecranEconomie': {
        if (!sim) break;
        const objetsParType: Record<string, number> = {};
        let monnaieTotale = 0;
        for (const o of sim.etat.objets.values()) objetsParType[o.type] = (objetsParType[o.type] ?? 0) + 1;
        const stocks = Array.from(sim.etat.groupes.values()).map((g) => {
          monnaieTotale += g.stocksCommuns.monnaie ?? 0;
          return { nom: g.nom, stocks: { ...g.stocksCommuns } };
        });
        ctx.postMessage({ type: 'ecranEconomie', donnees: { objetsParType, nbObjets: sim.etat.objets.size, monnaieTotale, stocks } });
        break;
      }
      case 'ecranReligions': {
        if (!sim) break;
        const religions = Array.from(sim.etat.religions.values()).map((r) => {
          const parent = r.parentId !== null ? sim!.etat.religions.get(r.parentId) : undefined;
          const prophete = sim!.etat.individus.get(r.propheteId);
          const croyants = Array.from(sim!.etat.individus.values()).filter((i) => i.religionId === r.id && i.vivant).length;
          return {
            id: r.id, nom: r.nom, propheteNom: prophete?.nom ?? '?', dieux: r.dieux, tabous: r.tabous,
            joursSacres: r.joursSacres, parentNom: parent?.nom ?? null, croyants, fondeeLe: r.fondeeLe,
          };
        });
        ctx.postMessage({ type: 'ecranReligions', donnees: religions });
        break;
      }
      case 'ecranLangues': {
        if (!sim) break;
        const langues = Array.from(sim.etat.langues.values()).map((l) => {
          const parent = l.parentId !== null ? sim!.etat.langues.get(l.parentId) : undefined;
          const groupes = Array.from(sim!.etat.groupes.values()).filter((g) => g.langueId === l.id).length;
          const individus = Array.from(sim!.etat.individus.values()).filter((i) => i.langueId === l.id && i.vivant).length;
          return { id: l.id, nom: l.nom, parentNom: parent?.nom ?? null, divergence: Math.round(l.divergence * 100) / 100, groupes, individus };
        });
        ctx.postMessage({ type: 'ecranLangues', donnees: langues });
        break;
      }
      case 'genealogie': {
        if (!sim) break;
        const arbre = (id: number, profondeur: number): unknown => {
          if (profondeur > 5) return null;
          const ind = sim!.etat.individus.get(id);
          if (!ind) return null;
          return {
            id: ind.id,
            nom: ind.nom,
            age: Math.round(ind.ageAnnees),
            sexe: ind.sexe === 0 ? 'H' : 'F',
            vivant: ind.vivant,
            causeMort: ind.causeMort,
            pere: ind.pereRegistre !== null ? arbre(ind.pereRegistre, profondeur + 1) : null,
            mere: ind.mere !== null ? arbre(ind.mere, profondeur + 1) : null,
            enfants: ind.enfants.map((e) => arbre(e, profondeur + 1)).filter((x) => x !== null),
          };
        };
        ctx.postMessage({ type: 'genealogie', id: msg.id, arbre: arbre(msg.id as number, 0) });
        break;
      }
      case 'chronique': {
        if (!sim) break;
        const id = msg.id as number;
        ctx.postMessage({ type: 'chronique', id, evenements: biographie(sim.etat, id) });
        break;
      }
      case 'chroniqueGroupe': {
        if (!sim) break;
        ctx.postMessage({ type: 'chroniqueGroupe', id: msg.id, evenements: chroniqueGroupe(sim.etat, msg.id as number) });
        break;
      }
      case 'filtrerJournal': {
        if (!sim) break;
        const filtre = msg.filtre as { types?: TypeEvenement[]; limite?: number };
        ctx.postMessage({ type: 'journal', evenements: sim.etat.journal.lire(filtre) });
        break;
      }
    }
  } catch (err) {
    ctx.postMessage({ type: 'erreur', message: (err as Error).message });
  }
};
