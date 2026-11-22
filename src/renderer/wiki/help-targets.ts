/** The page of the Wiki each « ? » button opens (a test checks that every one exists). */
export const HELP_PAGES = {
  person: 'ecran:fiche',
  animal: 'ecran:fiche-animal',
  building: 'ecran:batiment',
  brain: 'ecran:cerveau',
  governance: 'ecran:gouvernance',
  groups: 'ecran:groupes',
  ideas: 'ecran:idees',
  journal: 'ecran:journal',
  workshop: 'ecran:atelier',
  stats: 'ecran:statistiques',
  genealogy: 'ecran:genealogie',
  relations: 'ecran:relations',
  political: 'ecran:politique',
  knowledgeTree: 'ecran:arbre-savoirs',
  favorites: 'ecran:suivis',
  saves: 'ecran:sauvegardes',
} as const;

export type HelpScreen = keyof typeof HELP_PAGES;
