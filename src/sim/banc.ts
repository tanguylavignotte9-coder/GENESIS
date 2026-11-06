import { Simulation } from './simulation';
import { Individu } from './entites/individu';
import { serialiserSimulation, deserialiserSimulation } from './sauvegarde/serialiseur';
import { miseAJourMensuelleFaune } from './faune/systemeFaune';
import type { ConfigComplete } from './config/schema';

export interface OptionsBanc {
  seed: number;
  mois: number;
  config: ConfigComplete;
  empreintes: Record<string, string>;
  nbIndividusTest?: number;
  nbBandes?: number;
  tailleBande?: number;
}

export interface ResultatBanc {
  seed: number;
  tailleGrille: number;
  nbTuiles: number;
  animauxInitiaux: number;
  animauxVivantsApres: number;
  individusInitiaux: number;
  individusVivantsApres: number;
  naissances: number;
  morts: number;
  moisSimules: number;
  msGenerationMonde: number;
  msParMoisMoyen: number;
  msParMoisFaune: number;
  tuilesMiseAJourParSeconde: number;
  msParMoisParMillionTuiles: number;
  individusCrees: number;
  msCreationIndividus: number;
  individusParSeconde: number;
  tailleSauvegardeOctets: number;
  msSerialisation: number;
  msDeserialisation: number;
  empreinteMondeApres: string;
  empreinteAnimauxApres: string;
  memoireMB: number;
}

export function runBanc(opts: OptionsBanc): ResultatBanc {
  const t0 = performance.now();
  const sim = new Simulation(opts.config, opts.seed);
  sim.initialiser({ nbBandes: opts.nbBandes, tailleBande: opts.tailleBande });
  const t1 = performance.now();
  const msGeneration = t1 - t0;

  const vitesseMax = Math.max(...opts.config.temps.vitessesDisponibles);
  sim.definirVitesse(vitesseMax);
  const pas = opts.config.temps.pasDeTempsSecondesReel;
  const animauxInitiaux = Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length;
  const individusInitiaux = sim.etat.individus.size;
  const t2 = performance.now();
  const moisDepart = { an: sim.etat.calendrier.an, mois: sim.etat.calendrier.mois };
  let ticks = 0;
  while (sim.etat.calendrier.an * 12 + sim.etat.calendrier.mois - (moisDepart.an * 12 + moisDepart.mois) < opts.mois) {
    sim.tick(pas);
    ticks++;
    if (ticks > opts.mois * 1000 + 10000) break;
  }
  const t3 = performance.now();
  const msSimulation = t3 - t2;
  const animauxApres = Array.from(sim.etat.animaux.values()).filter((a) => a.vivant).length;
  const individusApres = Array.from(sim.etat.individus.values());
  const vivantsApres = individusApres.filter((i) => i.vivant).length;
  const naissances = sim.etat.journal.lire({}).filter((e) => e.type === 'naissance').length;
  const morts = sim.etat.journal.lire({}).filter((e) => e.type === 'mort').length;
  const msParMois = opts.mois > 0 ? msSimulation / opts.mois : 0;
  const nbTuiles = sim.etat.monde.taille * sim.etat.monde.taille;
  const tuilesParSeconde = opts.mois > 0 ? (nbTuiles * opts.mois) / (msSimulation / 1000) : 0;

  const nbInd = opts.nbIndividusTest ?? 1000;
  const t4 = performance.now();
  for (let i = 0; i < nbInd; i++) {
    const ind = new Individu(sim.etat.prochainIdIndividu++, `Individu-test-${i}`);
    ind.positionX = sim.etat.rng.reel(0, sim.etat.monde.taille);
    ind.positionY = sim.etat.rng.reel(0, sim.etat.monde.taille);
    sim.etat.individus.set(ind.id, ind);
  }
  const t5 = performance.now();
  const msCreation = t5 - t4;

  const t6 = performance.now();
  const json = serialiserSimulation(sim, opts.empreintes, new Date().toISOString());
  const t7 = performance.now();
  const msSerialisation = t7 - t6;
  const tailleOctets = new TextEncoder().encode(json).length;
  const { simulation: sim2 } = deserialiserSimulation(json, opts.config, opts.empreintes);
  const t8 = performance.now();
  const msDeserialisation = t8 - t7;

  const memoireMB = (typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0) / 1024 / 1024;

  const tFaune = performance.now();
  miseAJourMensuelleFaune(sim.etat, opts.config.fauneFlore);
  const msFaune = performance.now() - tFaune;

  return {
    seed: opts.seed,
    tailleGrille: sim.etat.monde.taille,
    nbTuiles,
    animauxInitiaux,
    animauxVivantsApres: animauxApres,
    individusInitiaux,
    individusVivantsApres: vivantsApres,
    naissances,
    morts,
    moisSimules: opts.mois,
    msGenerationMonde: msGeneration,
    msParMoisMoyen: msParMois,
    msParMoisFaune: msFaune,
    tuilesMiseAJourParSeconde: Math.round(tuilesParSeconde),
    msParMoisParMillionTuiles: nbTuiles > 0 ? (msParMois * 1e6) / nbTuiles : 0,
    individusCrees: nbInd,
    msCreationIndividus: msCreation,
    individusParSeconde: msCreation > 0 ? Math.round((nbInd / msCreation) * 1000) : 0,
    tailleSauvegardeOctets: tailleOctets,
    msSerialisation,
    msDeserialisation,
    empreinteMondeApres: sim2.empreinteMonde(),
    empreinteAnimauxApres: sim2.empreinteAnimaux(),
    memoireMB: Math.round(memoireMB * 10) / 10,
  };
}

export function formaterBanc(r: ResultatBanc): string {
  const lignes = [
    `Banc de performance Genesis — graine ${r.seed}`,
    `Monde : ${r.tailleGrille}x${r.tailleGrille} tuiles (${r.nbTuiles.toLocaleString('fr-FR')} tuiles)`,
    `Génération du monde : ${r.msGenerationMonde.toFixed(1)} ms`,
    `Simulation : ${r.msParMoisMoyen.toFixed(2)} ms/mois en moyenne (${r.msParMoisParMillionTuiles.toFixed(3)} ms/mois/M tuiles)`,
    `Débit tuiles : ${r.tuilesMiseAJourParSeconde.toLocaleString('fr-FR')} tuiles/s (météo + végétation mensuelles)`,
    `Faune : ${r.animauxInitiaux.toLocaleString('fr-FR')} animaux initiaux → ${r.animauxVivantsApres.toLocaleString('fr-FR')} vivants après ${r.moisSimules} mois (tick faune : ${r.msParMoisFaune.toFixed(2)} ms/mois)`,
    `Humains : ${r.individusInitiaux} individus initiaux → ${r.individusVivantsApres} vivants, ${r.naissances} naissances, ${r.morts} morts en ${r.moisSimules} mois (inclus dans les ${r.msParMoisMoyen.toFixed(1)} ms/mois)`,
    `Individus (modèle) : ${r.individusCrees.toLocaleString('fr-FR')} créés en ${r.msCreationIndividus.toFixed(1)} ms (${r.individusParSeconde.toLocaleString('fr-FR')}/s)`,
    `Sauvegarde : ${(r.tailleSauvegardeOctets / 1024).toFixed(1)} Ko, sérialisation ${r.msSerialisation.toFixed(1)} ms, reprise ${r.msDeserialisation.toFixed(1)} ms`,
    `Empreinte du monde après banc : ${r.empreinteMondeApres}`,
    `Mémoire heap : ${r.memoireMB.toFixed(1)} Mo`,
  ];
  return lignes.join('\n');
}
