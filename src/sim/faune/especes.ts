import { Vegetation } from '../types';
import type { ConfigFauneFlore, EspeceFaune } from '../config/schema';

export interface Espece extends EspeceFaune {
  id: string;
  couleur: number;
  poidsParVegetation: Map<Vegetation, number>;
}

const COULEURS: Record<string, number> = {
  cerf: 0x8a5a2b,
  bison: 0x5d4226,
  sanglier: 0x4a3b2a,
  lapin: 0xb0a08a,
  loup: 0x6b7280,
  ours: 0x3a2e22,
  vautour: 0x2b2b30,
};

export function construireEspeces(config: ConfigFauneFlore): Map<string, Espece> {
  const map = new Map<string, Espece>();
  for (const [id, e] of Object.entries(config.especes)) {
    const poids = new Map<Vegetation, number>();
    for (const [biome, p] of Object.entries(e.poidsBiomes)) {
      const veg = (Vegetation as unknown as Record<string, Vegetation>)[biome];
      if (veg !== undefined) poids.set(veg, p);
    }
    map.set(id, { id, ...e, couleur: COULEURS[id] ?? 0x888888, poidsParVegetation: poids });
  }
  return map;
}

export function poidsTotalPourVegetation(especes: Map<string, Espece>, vegetation: Vegetation): number {
  let total = 0;
  for (const e of especes.values()) {
    total += e.poidsParVegetation.get(vegetation) ?? 0;
  }
  return total;
}
