import type { Connaissance, GrapheSavoir } from './connaissance';

export interface AtomeTech {
  nom: string;
  prerequis: string[];
  ere: number;
}

export const ERES: string[] = [
  'Âge de pierre',
  'Âge du bronze',
  'Âge du fer',
  'Antiquité',
  'Moyen Âge',
  'Ère industrielle',
  'Ère moderne',
  'Ère numérique',
];

export const ARBRE: AtomeTech[] = [
  { nom: 'agriculture', prerequis: [], ere: 0 },
  { nom: 'construction-hutte', prerequis: [], ere: 0 },
  { nom: 'feu', prerequis: [], ere: 0 },
  { nom: 'vetements-basiques', prerequis: [], ere: 0 },
  { nom: 'elevage', prerequis: [], ere: 0 },
  { nom: 'taille-pierre', prerequis: ['construction-hutte'], ere: 0 },
  { nom: 'poterie', prerequis: ['feu'], ere: 0 },
  { nom: 'tissage', prerequis: ['vetements-basiques'], ere: 0 },
  { nom: 'fermentation', prerequis: ['poterie', 'agriculture'], ere: 0 },
  { nom: 'charrette', prerequis: ['elevage', 'taille-pierre'], ere: 2 },
  { nom: 'construction-navale', prerequis: ['taille-pierre', 'feu'], ere: 3 },
  { nom: 'port', prerequis: ['construction-navale'], ere: 3 },
  { nom: 'mine-cuivre', prerequis: ['taille-pierre'], ere: 1 },
  { nom: 'mine-etain', prerequis: ['taille-pierre'], ere: 1 },
  { nom: 'fonderie', prerequis: ['feu', 'mine-cuivre'], ere: 1 },
  { nom: 'bronze', prerequis: ['fonderie', 'mine-etain'], ere: 1 },
  { nom: 'mine-fer', prerequis: ['taille-pierre'], ere: 2 },
  { nom: 'forge', prerequis: ['fonderie', 'mine-fer'], ere: 2 },
  { nom: 'mine-charbon', prerequis: ['feu'], ere: 2 },
  { nom: 'mine-or', prerequis: ['taille-pierre'], ere: 3 },
  { nom: 'mine-argent', prerequis: ['taille-pierre'], ere: 3 },
  { nom: 'mine-sel', prerequis: ['agriculture'], ere: 3 },
  { nom: 'ecriture', prerequis: ['poterie', 'agriculture'], ere: 3 },
  { nom: 'moulin', prerequis: ['agriculture'], ere: 3 },
  { nom: 'marche', prerequis: ['agriculture', 'taille-pierre'], ere: 3 },
  { nom: 'monnaie-metallique', prerequis: ['forge', 'mine-or'], ere: 4 },
  { nom: 'banque', prerequis: ['monnaie-metallique'], ere: 4 },
  { nom: 'ecole', prerequis: ['ecriture'], ere: 4 },
  { nom: 'imprimerie', prerequis: ['ecriture', 'moulin'], ere: 4 },
  { nom: 'machine-vapeur', prerequis: ['forge', 'mine-charbon'], ere: 5 },
  { nom: 'electricite', prerequis: ['machine-vapeur', 'mine-cuivre'], ere: 6 },
  { nom: 'puits-gaz', prerequis: ['machine-vapeur'], ere: 6 },
  { nom: 'puits-petrole', prerequis: ['machine-vapeur'], ere: 6 },
  { nom: 'mine-uranium', prerequis: ['electricite'], ere: 6 },
  { nom: 'raffinerie', prerequis: ['puits-petrole'], ere: 6 },
  { nom: 'centrale-charbon', prerequis: ['electricite', 'mine-charbon'], ere: 6 },
  { nom: 'informatique', prerequis: ['electricite'], ere: 7 },
];

export function initialiserArbre(savoir: GrapheSavoir): Map<string, number> {
  const ids = new Map<string, number>();
  const atomesParNom = new Map(ARBRE.map((a) => [a.nom, a]));
  const crees = new Map<string, Connaissance>();
  const enAttente = [...ARBRE];
  let progression = true;
  while (progression && enAttente.length > 0) {
    progression = false;
    for (let i = enAttente.length - 1; i >= 0; i--) {
      const a = enAttente[i];
      if (a.prerequis.every((p) => crees.has(p))) {
        const prereqIds = a.prerequis.map((p) => crees.get(p)!.id);
        const c = savoir.ajouter(a.nom, prereqIds);
        crees.set(a.nom, c);
        ids.set(a.nom, c.id);
        enAttente.splice(i, 1);
        progression = true;
      }
    }
  }
  void atomesParNom;
  return ids;
}

export function atomesInventables(savoir: GrapheSavoir, connus: Set<number>): Connaissance[] {
  return savoir.tous().filter((c) => !connus.has(c.id) && c.prerequis.every((p) => connus.has(p)));
}

export function ereDe(connaissances: Set<number>, savoir: GrapheSavoir): number {
  let max = 0;
  const ereParId = new Map<number, number>();
  for (const a of ARBRE) {
    const c = savoir.tous().find((x) => x.nom === a.nom);
    if (c) ereParId.set(c.id, a.ere);
  }
  for (const id of connaissances) {
    const e = ereParId.get(id) ?? 0;
    if (e > max) max = e;
  }
  return max;
}

export function nomEre(ere: number): string {
  return ERES[Math.min(ere, ERES.length - 1)];
}

export const SAVOIR_PAR_BATIMENT: Record<string, string> = {
  atelier: 'tissage',
  marche: 'marche',
  ponton: 'construction-navale',
  port: 'port',
  bateau: 'construction-navale',
  charrette: 'charrette',
  enclos: 'elevage',
  ecole: 'ecole',
  forge: 'forge',
  banque: 'banque',
  moulin: 'moulin',
  'mine-fer': 'mine-fer',
  'mine-cuivre': 'mine-cuivre',
  'mine-etain': 'mine-etain',
  'mine-or': 'mine-or',
  'mine-argent': 'mine-argent',
  'mine-sel': 'mine-sel',
  'mine-charbon': 'mine-charbon',
  'puits-gaz': 'puits-gaz',
  'puits-petrole': 'puits-petrole',
  'mine-uranium': 'mine-uranium',
  'raffinerie': 'raffinerie',
  'centrale-charbon': 'centrale-charbon',
};

export const RESSOURCE_PAR_MATIERE: Record<string, string> = {
  fer: 'fer',
  cuivre: 'cuivre',
  etain: 'etain',
  or: 'or',
  argent: 'argent',
  sel: 'sel',
  charbon: 'charbon',
  gaz: 'gaz',
  petrole: 'petrole',
  uranium: 'uranium',
};
