import { Simulation } from '../simulation';
import { TypeEvenement, type Evenement } from '../journal/journal';
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
      taille: sim.etat.monde.taille,
      an: cal.an,
      mois: cal.mois,
      vitesse: sim.vitesseActuelle,
      stats: {
        tuiles: sim.etat.monde.taille * sim.etat.monde.taille,
        individus: Array.from(sim.etat.individus.values()).filter((i) => i.vivant).length,
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
    if (!sim) return;
    sim.tick(pas);
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
        sim.initialiser();
        dernierJournalId = 0;
        envoyerJournal();
        envoyerDigest(true);
        ctx.postMessage({ type: 'pret', seed: msg.seed });
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
        sim.initialiser();
        dernierDigestMois = -1;
        dernierJournalId = 0;
        envoyerJournal();
        envoyerDigest(true);
        break;
      }
      case 'sauvegarder': {
        if (!sim) break;
        const contenu = serialiserSimulation(sim, empreintes, new Date().toISOString());
        ctx.postMessage({ type: 'sauvegarde', contenu });
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
