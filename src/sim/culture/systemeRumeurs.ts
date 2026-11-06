import type { ConfigComplete } from '../config/schema';
import type { EtatPartage } from '../etat';
import type { Individu } from '../entites/individu';
import { transmettreRumeur } from '../entites/boucleIndividu';

export function rumeursMensuelles(etat: EtatPartage, config: ConfigComplete): void {
  const t = etat.monde.taille;
  const index = new Map<number, number[]>();
  const vivants: Individu[] = [];
  for (const ind of etat.individus.values()) {
    if (!ind.vivant) continue;
    vivants.push(ind);
    const cle = Math.round(ind.positionY) * t + Math.round(ind.positionX);
    const arr = index.get(cle);
    if (arr) arr.push(ind.id);
    else index.set(cle, [ind.id]);
  }
  const vus = new Set<string>();
  for (const a of vivants) {
    const x = Math.round(a.positionX);
    const y = Math.round(a.positionY);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const arr = index.get((y + dy) * t + (x + dx));
        if (!arr) continue;
        for (const id of arr) {
          if (id === a.id) continue;
          const cle = a.id < id ? `${a.id}-${id}` : `${id}-${a.id}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
          const b = etat.individus.get(id)!;
          if (etat.rng.chance(config.recit.chanceTransmissionRumeurParMois)) transmettreRumeur(etat, config, a, b);
          if (etat.rng.chance(config.recit.chanceTransmissionRumeurParMois)) transmettreRumeur(etat, config, b, a);
        }
      }
    }
  }
}
