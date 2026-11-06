import { Competence } from '../types';
import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import type { Individu } from '../entites/individu';
import { terminerChantier } from './systemeBatiments';

export function tickIndividuOuvrier(etat: EtatPartage, config: ConfigComplete, ind: Individu, jours: number): void {
  const id = ind.chantierId;
  if (id === null) return;
  const b = etat.batiments.get(id);
  if (!b || !b.enConstruction) {
    ind.chantierId = null;
    return;
  }
  const comp = ind.competences[Competence.Construction] ?? 10;
  b.chantierRestantJours -= (comp / 100) * jours * 2;
  ind.competences[Competence.Construction] = Math.min(100, comp + config.individus.tauxApprentissageParMois * 8 * (jours / config.temps.joursParMois));
  if (b.chantierRestantJours <= 0) {
    terminerChantier(etat, config, b);
    ind.chantierId = null;
  }
}
