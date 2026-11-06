export enum Matiere {
  Vide = 255,
  Pierre = 0,
  Terre = 1,
  EauDouce = 2,
  EauSalee = 3,
  Sable = 4,
  Charbon = 5,
  Gaz = 6,
  Uranium = 7,
  Petrole = 8,
  Fer = 9,
  Cuivre = 10,
  Etain = 11,
  Or = 12,
  Argent = 13,
  Sel = 14,
}

export const GISEMENTS: ReadonlySet<Matiere> = new Set([
  Matiere.Charbon,
  Matiere.Gaz,
  Matiere.Uranium,
  Matiere.Petrole,
  Matiere.Fer,
  Matiere.Cuivre,
  Matiere.Etain,
  Matiere.Or,
  Matiere.Argent,
  Matiere.Sel,
]);

export function estEau(matiere: Matiere): boolean {
  return matiere === Matiere.EauDouce || matiere === Matiere.EauSalee;
}

export function estGisement(matiere: Matiere): boolean {
  return GISEMENTS.has(matiere);
}

export enum Vegetation {
  Aucun = 0,
  Toundra = 1,
  Taiga = 2,
  Foret = 3,
  Prairie = 4,
  Savane = 5,
  Jungle = 6,
  Desert = 7,
  Neige = 8,
}

export enum Meteo {
  Soleil = 0,
  Nuage = 1,
  Pluie = 2,
  Neige = 3,
}

export enum Saison {
  Printemps = 0,
  Ete = 1,
  Automne = 2,
  Hiver = 3,
  Seche = 4,
  Humide = 5,
}

export enum Sexe {
  Homme = 0,
  Femme = 1,
}

export enum NiveauGroupe {
  Bande = 0,
  Tribu = 1,
  Village = 2,
  Ville = 3,
  Nation = 4,
}

export enum Competence {
  Chasse = 'chasse',
  Agriculture = 'agriculture',
  Elevage = 'elevage',
  Construction = 'construction',
  Artisanat = 'artisanat',
  Social = 'social',
}

export enum Action {
  Deplacer = 'deplacer',
  Manger = 'manger',
  Boire = 'boire',
  Dormir = 'dormir',
  Chasser = 'chasser',
  Cueillir = 'cueillir',
  Pecher = 'pecher',
  Construire = 'construire',
  Fabriquer = 'fabriquer',
  Transmettre = 'transmettre',
  Socialiser = 'socialiser',
  Seduire = 'seduire',
  Prier = 'prier',
  Fuir = 'fuir',
  Migrer = 'migrer',
}

export enum ActionReserveeV2 {
  Combattre = 'combattre',
  Soigner = 'soigner',
}

export type ActionDisponible = Action | ActionReserveeV2;

export interface ActionIndividu {
  type: ActionDisponible;
  cibleX?: number;
  cibleY?: number;
  cibleId?: number;
  donnees?: Record<string, unknown>;
}

export interface DateJeu {
  an: number;
  mois: number;
}
