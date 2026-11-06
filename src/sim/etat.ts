import type { Rng } from './rng';
import type { Monde } from './monde/monde';
import type { Calendrier } from './temps/calendrier';
import type { Journal } from './journal/journal';
import type { Individu } from './entites/individu';
import type { Groupe } from './groupes/groupe';
import type { Objet } from './economie/objet';
import type { EntiteBatiment } from './batiments/batiment';
import type { Langue } from './culture/langue';
import type { Religion } from './culture/religion';
import type { GrapheSavoir } from './savoir/connaissance';
import type { Animal } from './faune/animal';

export interface ParametresDepart {
  seed: number;
  nbBandes: number;
  tailleBande: number;
}

export interface EtatPartage {
  monde: Monde;
  calendrier: Calendrier;
  rng: Rng;
  journal: Journal;
  individus: Map<number, Individu>;
  groupes: Map<number, Groupe>;
  objets: Map<number, Objet>;
  batiments: Map<number, EntiteBatiment>;
  langues: Map<number, Langue>;
  religions: Map<number, Religion>;
  savoir: GrapheSavoir;
  animaux: Map<number, Animal>;
  parametresDepart: ParametresDepart;
  prochainIdIndividu: number;
  prochainIdAnimal: number;
  prochainIdGroupe: number;
  prochainIdObjet: number;
  prochainIdBatiment: number;
  prochainIdLangue: number;
  prochainIdReligion: number;
  seed: number;
  zoneActive: { x0: number; y0: number; x1: number; y1: number } | null;
  extinctionTotale: boolean;
}
