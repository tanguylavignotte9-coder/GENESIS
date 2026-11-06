import type { Rng } from '../rng';
import { Sexe } from '../types';

const DEBUTS = ['Al', 'Ber', 'Cor', 'Dan', 'El', 'Far', 'Gar', 'Hel', 'Ir', 'Jor', 'Kar', 'Lor', 'Mor', 'Nor', 'Os', 'Per', 'Quor', 'Ran', 'Sel', 'Tor', 'Ul', 'Val', 'Wil', 'Yor', 'Zan'];
const MILIEUS = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'an', 'en', 'or', 'eth', 'ia'];
const FINS = ['n', 'r', 'k', 'm', 'th', 'sh', 'l', 'd', 'g', 'ric', 'mond', 'bek', 'mir', 'dor', 'wyn', 'gar', 'stad'];
const NOMS_FAMILLE = ['Cœur-de-pierre', 'Rivière-fendue', 'Hautes-herbes', 'Pas-du-vent', 'Feu-ancien', 'Racine-noire', 'Ciel-clair', 'Corne-blanche', 'Terre-fertile', 'Nuit-étoilée'];

export function genererPrenom(rng: Rng, sexe: Sexe): string {
  const n = rng.entier(2, 3);
  let nom = rng.choix(DEBUTS);
  for (let i = 1; i < n; i++) {
    nom += rng.choix(MILIEUS) + rng.choix(FINS);
  }
  if (sexe === Sexe.Femme && rng.chance(0.3)) nom += 'a';
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

export function genererNomFamille(rng: Rng): string {
  return rng.choix(NOMS_FAMILLE);
}

export function nomComplet(prenom: string, nomFamille: string): string {
  return `${prenom} ${nomFamille}`;
}
