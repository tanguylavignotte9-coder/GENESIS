import { Sexe, type DateJeu } from '../types';
import type { Rng } from '../rng';
import type { ConfigIndividus } from '../config/schema';
import { Individu } from './individu';
import { Competence } from '../types';

function mixTrait(a: number, b: number, rng: Rng, config: ConfigIndividus): number {
  let v = (a + b) / 2 + rng.reel(-5, 5);
  if (rng.chance(config.tauxMutationParTrait)) {
    v += rng.reel(-config.amplitudeMutation, config.amplitudeMutation);
  }
  return Math.max(0, Math.min(100, v));
}

export function creerEnfant(
  id: number,
  nom: string,
  pere: Individu,
  mere: Individu,
  pereBiologique: Individu,
  rng: Rng,
  config: ConfigIndividus,
  date: DateJeu,
  langueId: number,
): Individu {
  const enfant = new Individu(id, nom);
  enfant.sexe = rng.chance(0.5) ? Sexe.Homme : Sexe.Femme;
  enfant.ageAnnees = 0;
  enfant.pereRegistre = pere.id;
  enfant.mere = mere.id;
  enfant.pereBiologique = pereBiologique.id;
  enfant.langueId = langueId;
  enfant.neLe = { ...date };

  const consanguin = estProcheParent(pereBiologique, mere, new Map([[pere.id, pere], [mere.id, mere], [pereBiologique.id, pereBiologique]]));
  const risqueNegatif = consanguin ? config.tauxMutationParTrait + config.risqueMutationNegativeConsanguinite : config.tauxMutationParTrait;

  const herite = (a: number, b: number): number => {
    let v = (a + b) / 2 + rng.reel(-4, 4);
    if (rng.chance(risqueNegatif)) v -= rng.reel(0, config.amplitudeMutation);
    return Math.max(0, Math.min(100, v));
  };

  enfant.force = herite(pereBiologique.force, mere.force);
  enfant.endurance = herite(pereBiologique.endurance, mere.endurance);
  enfant.vitesse = herite(pereBiologique.vitesse, mere.vitesse);
  enfant.intelligence = mixTrait(pereBiologique.intelligence, mere.intelligence, rng, config) * 0.7 + rng.reel(20, 60) * 0.3;
  enfant.charisme = herite(pereBiologique.charisme, mere.charisme);
  enfant.sante.valeur = Math.max(20, Math.min(100, (pereBiologique.sante.valeur + mere.sante.valeur) / 2 + rng.reel(-10, 10)));
  enfant.bonheur = rng.entier(40, 70);
  enfant.apparence = {
    teintePeau: Math.round(mixTrait(pereBiologique.apparence.teintePeau, mere.apparence.teintePeau, rng, config)),
    couleurCheveux: Math.round(mixTrait(pereBiologique.apparence.couleurCheveux, mere.apparence.couleurCheveux, rng, config)),
    tailleCm: Math.round(mixTrait(pereBiologique.apparence.tailleCm, mere.apparence.tailleCm, rng, config)),
  };
  for (const t of Object.keys(enfant.traits) as Array<keyof typeof enfant.traits>) {
    enfant.traits[t] = herite(pereBiologique.traits[t], mere.traits[t]);
  }
  for (const c of Object.values(Competence) as Competence[]) {
    enfant.competences[c] = 0;
  }
  pere.enfants.push(id);
  mere.enfants.push(id);
  return enfant;
}

export function estProcheParent(a: Individu, b: Individu, individus: Map<number, Individu>): boolean {
  const ancetresA = collecterAncetres(a, individus, 3);
  ancetresA.add(a.id);
  const ancetresB = collecterAncetres(b, individus, 3);
  for (const id of ancetresA) {
    if (id === b.id || ancetresB.has(id)) return true;
  }
  return false;
}

function collecterAncetres(i: Individu, individus: Map<number, Individu>, profondeur: number): Set<number> {
  const res = new Set<number>();
  const file: Array<{ id: number; p: number }> = [];
  const p1 = i.pereBiologique ?? i.pereRegistre;
  if (p1 !== null) file.push({ id: p1, p: 1 });
  if (i.mere !== null) file.push({ id: i.mere, p: 1 });
  while (file.length > 0) {
    const { id, p } = file.shift()!;
    if (res.has(id) || p > profondeur) continue;
    res.add(id);
    const parent = individus.get(id);
    if (!parent) continue;
    const pp = parent.pereBiologique ?? parent.pereRegistre;
    if (pp !== null) file.push({ id: pp, p: p + 1 });
    if (parent.mere !== null) file.push({ id: parent.mere, p: p + 1 });
  }
  return res;
}
