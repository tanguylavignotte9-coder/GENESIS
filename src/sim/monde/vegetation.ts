import { Vegetation, Saison } from '../types';
import type { Rng } from '../rng';
import type { ConfigFauneFlore, ConfigMonde } from '../config/schema';
import type { Monde } from './monde';
import { temperatureBaseCelsius } from './climat';
import { decalageSaisonnierCelsius } from '../temps/calendrier';
import type { Calendrier } from '../temps/calendrier';

export function vegetationPourClimat(temperatureCelsius: number, humiditePourcent: number): Vegetation {
  if (temperatureCelsius < -10) return Vegetation.Neige;
  if (temperatureCelsius < 0) return Vegetation.Toundra;
  if (temperatureCelsius < 8) return humiditePourcent > 50 ? Vegetation.Taiga : Vegetation.Toundra;
  if (temperatureCelsius < 15) return humiditePourcent > 55 ? Vegetation.Foret : Vegetation.Prairie;
  if (temperatureCelsius < 22) {
    if (humiditePourcent > 65) return Vegetation.Foret;
    if (humiditePourcent > 40) return Vegetation.Prairie;
    return Vegetation.Savane;
  }
  if (temperatureCelsius < 28) {
    if (humiditePourcent > 70) return Vegetation.Jungle;
    if (humiditePourcent > 35) return Vegetation.Savane;
    return Vegetation.Desert;
  }
  return humiditePourcent > 50 ? Vegetation.Savane : Vegetation.Desert;
}

// Classification avec écotones : les entrées (température, humidité) sont bruitées à petite
// maille, de sorte qu'aux frontières entre deux biomes le bruit tranche tuile par tuile
// (mosaïque de transition) au lieu d'une limite nette.
export function vegetationPourClimatAvecEcotone(
  config: ConfigMonde,
  temperatureCelsius: number,
  humiditePourcent: number,
  bruitTemperature: number,
  bruitHumidite: number,
): Vegetation {
  const t = temperatureCelsius + (bruitTemperature - 0.5) * 2 * config.margeTemperatureEcotoneCelsius;
  const h = humiditePourcent + (bruitHumidite - 0.5) * 2 * config.margeHumiditeEcotonePourcent;
  return vegetationPourClimat(t, h);
}

export function miseAJourVegetationMensuelle(monde: Monde, calendrier: Calendrier, configMonde: ConfigMonde, configFauneFlore: ConfigFauneFlore, rng: Rng, champs?: Set<number>): void {
  const t = monde.taille;
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const i = monde.index(x, y);
      if (monde.estEau(x, y)) continue;
      const distEq = monde.distanceEquateur(y);
      const saison = calendrier.saisonPourDistanceEquateur(distEq, y < t / 2);
      const elev = monde.elevation[i];
      const temp = temperatureBaseCelsius(configMonde, distEq) + decalageSaisonnierCelsius(configMonde, distEq, saison, calendrier.mois, 12) - Math.max(0, elev - 1) * configMonde.refroidissementParNiveauCelsius;
      const estChamp = champs !== undefined && champs.has(i);
      const pousse = configFauneFlore.probabilitePousseVegetationParMois * (estChamp ? 3 : 1);
      if (rng.chance(pousse)) {
        monde.biomasseVegetation[i] = Math.min(configFauneFlore.biomasseVegetationMax, monde.biomasseVegetation[i] + (estChamp ? 15 : 10));
      }
      if (rng.chance(configFauneFlore.probabiliteDegradationVegetationParMois)) {
        monde.biomasseVegetation[i] = Math.max(0, monde.biomasseVegetation[i] - 8);
      }
      const nouvelle = vegetationPourClimat(temp, monde.humidite[i]);
      if (nouvelle !== monde.vegetation[i] && (saison === Saison.Hiver || monde.biomasseVegetation[i] > 30 || nouvelle === Vegetation.Aucun || nouvelle === Vegetation.Desert)) {
        monde.vegetation[i] = nouvelle;
      }
      if (monde.passage[i] > 0) {
        monde.passage[i] = Math.max(0, monde.passage[i] - configMonde.decroissancePassageParMois);
      }
      if (monde.passage[i] >= configMonde.seuilPassageSentier && !monde.estEau(x, y)) {
        if (monde.vegetation[i] !== Vegetation.Aucun) monde.vegetation[i] = Vegetation.Aucun;
        monde.biomasseVegetation[i] = Math.min(monde.biomasseVegetation[i], 10);
      }
    }
  }
}
