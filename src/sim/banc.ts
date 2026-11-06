import { Simulation } from './simulation';
import { Individu } from './entites/individu';
import { serialiserSimulation, deserialiserSimulation } from './sauvegarde/serialiseur';
import type { ConfigComplete } from './config/schema';

export interface OptionsBanc {
  seed: number;
  mois: number;
  config: ConfigComplete;
  empreintes: Record<string, string>;
  nbIndividusTest?: number;
}

export interface ResultatBanc {
  seed: number;
  tailleGrille: number;
  nbTuiles: number;
  msGenerationMonde: number;
  msParMoisMoyen: number;
  tuilesMiseAJourParSeconde: number;
  msParMoisParMillionTuiles: number;
  individusCrees: number;
  msCreationIndividus: number;
  individusParSeconde: number;
  tailleSauvegardeOctets: number;
  msSerialisation: number;
  msDeserialisation: number;
  empreinteMondeApres: string;
  memoireMB: number;
}

export function runBanc(opts: OptionsBanc): ResultatBanc {
  const t0 = performance.now();
  const sim = new Simulation(opts.config, opts.seed);
  sim.initialiser();
  const t1 = performance.now();
  const msGeneration = t1 - t0;

  const vitesseMax = Math.max(...opts.config.temps.vitessesDisponibles);
  sim.definirVitesse(vitesseMax);
  const pas = opts.config.temps.pasDeTempsSecondesReel;
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

  return {
    seed: opts.seed,
    tailleGrille: sim.etat.monde.taille,
    nbTuiles,
    msGenerationMonde: msGeneration,
    msParMoisMoyen: msParMois,
    tuilesMiseAJourParSeconde: Math.round(tuilesParSeconde),
    msParMoisParMillionTuiles: nbTuiles > 0 ? (msParMois * 1e6) / nbTuiles : 0,
    individusCrees: nbInd,
    msCreationIndividus: msCreation,
    individusParSeconde: msCreation > 0 ? Math.round((nbInd / msCreation) * 1000) : 0,
    tailleSauvegardeOctets: tailleOctets,
    msSerialisation,
    msDeserialisation,
    empreinteMondeApres: sim2.empreinteMonde(),
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
    `Individus (modèle) : ${r.individusCrees.toLocaleString('fr-FR')} créés en ${r.msCreationIndividus.toFixed(1)} ms (${r.individusParSeconde.toLocaleString('fr-FR')}/s)`,
    `Sauvegarde : ${(r.tailleSauvegardeOctets / 1024).toFixed(1)} Ko, sérialisation ${r.msSerialisation.toFixed(1)} ms, reprise ${r.msDeserialisation.toFixed(1)} ms`,
    `Empreinte du monde après banc : ${r.empreinteMondeApres}`,
    `Mémoire heap : ${r.memoireMB.toFixed(1)} Mo`,
  ];
  return lignes.join('\n');
}
