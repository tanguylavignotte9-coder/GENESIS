import { Competence, Sexe, type DateJeu } from '../types';

export interface Besoins {
  faim: number;
  soif: number;
  sommeil: number;
  stress: number;
  securite: number;
  social: number;
  reproduction: number;
}

export interface TraitsPersonnalite {
  honnetete: number;
  courage: number;
  colere: number;
  ambition: number;
  altruisme: number;
  curiosite: number;
}

export interface Apparence {
  teintePeau: number;
  couleurCheveux: number;
  tailleCm: number;
}

export interface Blessure {
  partie: string;
  gravite: number;
  date: DateJeu;
}

export interface Maladie {
  nom: string;
  gravite: number;
  date: DateJeu;
}

export interface Sante {
  valeur: number;
  blessures: Blessure[];
  maladies: Maladie[];
}

export enum TypeRelation {
  Famille = 'famille',
  Amical = 'amical',
  Romantique = 'romantique',
  Rival = 'rival',
  Rancune = 'rancune',
  Gratitude = 'gratitude',
  Crainte = 'crainte',
}

export interface Relation {
  vers: number;
  type: TypeRelation;
  intensite: number;
}

export interface MemoireEvenement {
  evenementId: number;
  souvenir: string;
  intensite: number;
  date: DateJeu;
  estRumeur?: boolean;
  distorsion?: number;
}

export type Grossesse = {
  pereRegistreId: number;
  pereBiologiqueId: number;
  moisRestants: number;
} | null;

export class Individu {
  id: number;
  nom: string;
  sexe: Sexe;
  ageAnnees: number;
  bonheur: number;
  intelligence: number;
  charisme: number;
  force: number;
  endurance: number;
  vitesse: number;
  competences: Partial<Record<Competence, number>>;
  sante: Sante;
  bonus: string[];
  malus: string[];
  apparence: Apparence;
  traits: TraitsPersonnalite;
  besoins: Besoins;
  pereRegistre: number | null;
  mere: number | null;
  pereBiologique: number | null;
  enfants: number[];
  partenaires: number[];
  langueId: number;
  religionId: number | null;
  groupeId: number | null;
  positionX: number;
  positionY: number;
  connaissances: Set<number>;
  relations: Relation[];
  memoire: MemoireEvenement[];
  vivant: boolean;
  causeMort: string | null;
  neLe: DateJeu;
  mortLe: DateJeu | null;
  grossesse: Grossesse;
  dernierActeCannibalisme: DateJeu | null;
  nomFamille: string;
  chantierId: number | null;
  objetIds: number[];
  languesConnues: number[];
  emotions: { peur: number; colere: number; joie: number };
  moisStressMax: number;

  constructor(id: number, nom: string) {
    this.id = id;
    this.nom = nom;
    this.sexe = Sexe.Homme;
    this.ageAnnees = 0;
    this.bonheur = 50;
    this.intelligence = 50;
    this.charisme = 50;
    this.force = 50;
    this.endurance = 50;
    this.vitesse = 50;
    this.competences = {};
    this.sante = { valeur: 100, blessures: [], maladies: [] };
    this.bonus = [];
    this.malus = [];
    this.apparence = { teintePeau: 0, couleurCheveux: 0, tailleCm: 170 };
    this.traits = { honnetete: 50, courage: 50, colere: 50, ambition: 50, altruisme: 50, curiosite: 50 };
    this.besoins = { faim: 0, soif: 0, sommeil: 0, stress: 0, securite: 0, social: 0, reproduction: 0 };
    this.pereRegistre = null;
    this.mere = null;
    this.pereBiologique = null;
    this.enfants = [];
    this.partenaires = [];
    this.langueId = 0;
    this.religionId = null;
    this.groupeId = null;
    this.positionX = 0;
    this.positionY = 0;
    this.connaissances = new Set();
    this.relations = [];
    this.memoire = [];
    this.vivant = true;
    this.causeMort = null;
    this.neLe = { an: 1, mois: 1 };
    this.mortLe = null;
    this.grossesse = null;
    this.dernierActeCannibalisme = null;
    this.nomFamille = '';
    this.chantierId = null;
    this.objetIds = [];
    this.languesConnues = [];
    this.emotions = { peur: 0, colere: 0, joie: 50 };
    this.moisStressMax = 0;
  }

  get estMature(): boolean {
    return this.ageAnnees >= 15;
  }

  relationVers(autreId: number): Relation | undefined {
    return this.relations.find((r) => r.vers === autreId);
  }

  ajouterRelation(vers: number, type: TypeRelation, intensite: number): void {
    const existante = this.relationVers(vers);
    if (existante) {
      existante.intensite = Math.max(-100, Math.min(100, existante.intensite + intensite));
      if (type !== existante.type && Math.abs(intensite) > 30) existante.type = type;
    } else {
      this.relations.push({ vers, type, intensite: Math.max(-100, Math.min(100, intensite)) });
    }
  }

  ajouterMemoire(evenementId: number, souvenir: string, intensite: number, date: DateJeu, capaciteMax: number): void {
    this.memoire.push({ evenementId, souvenir, intensite, date: { ...date } });
    if (this.memoire.length > capaciteMax) {
      this.memoire.sort((a, b) => a.intensite - b.intensite);
      this.memoire.splice(0, this.memoire.length - capaciteMax);
    }
  }

  serialiser(): Record<string, unknown> {
    return {
      ...this,
      connaissances: Array.from(this.connaissances),
      languesConnues: [...this.languesConnues],
      objetIds: [...this.objetIds],
      emotions: { ...this.emotions },
      sante: { valeur: this.sante.valeur, blessures: this.sante.blessures, maladies: this.sante.maladies },
    } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): Individu {
    const i = new Individu(d.id as number, d.nom as string);
    Object.assign(i, d);
    i.connaissances = new Set(d.connaissances as number[]);
    i.sante = d.sante as Sante;
    return i;
  }
}
