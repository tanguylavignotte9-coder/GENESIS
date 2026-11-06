import { Matiere, Meteo, Saison } from '../types';
import type { Rng } from '../rng';
import type { ConfigMonde } from '../config/schema';
import type { Monde } from './monde';
import type { Calendrier } from '../temps/calendrier';
import { decalageSaisonnierCelsius } from '../temps/calendrier';
import { temperatureBaseCelsius } from './climat';

export function miseAJourMeteoMensuelle(monde: Monde, calendrier: Calendrier, config: ConfigMonde, rng: Rng): void {
  const t = monde.taille;
  for (let y = 0; y < t; y++) {
    const distEq = monde.distanceEquateur(y);
    const hemisphereNord = y < t / 2;
    const saison = calendrier.saisonPourDistanceEquateur(distEq, hemisphereNord);
    const facteurSaison =
      saison === Saison.Humide || saison === Saison.Printemps ? 1.3 :
      saison === Saison.Seche ? 0.4 :
      saison === Saison.Hiver && distEq > config.limiteZonePolaire ? 0.6 : 1.0;
    for (let x = 0; x < t; x++) {
      const i = monde.index(x, y);
      const elev = monde.elevation[i];
      const temp =
        temperatureBaseCelsius(config, distEq) +
        decalageSaisonnierCelsius(config, distEq, saison, calendrier.mois, 12) -
        Math.max(0, elev - 1) * config.refroidissementParNiveauCelsius;
      monde.temperature[i] = temp;
      const probaPluie = (monde.humidite[i] / 100) * config.probabilitePluieHumiditeMax * facteurSaison;
      if (rng.chance(probaPluie)) {
        monde.meteo[i] = temp <= config.seuilNeigeCelsius ? Meteo.Neige : Meteo.Pluie;
        monde.humidite[i] = Math.min(100, monde.humidite[i] + config.gainHumiditePluie);
      } else {
        monde.meteo[i] = rng.chance(0.3) ? Meteo.Nuage : Meteo.Soleil;
        monde.humidite[i] = Math.max(0, monde.humidite[i] - config.perteHumiditeSecheresse);
      }
      const estEauDouce = monde.matiereNiveau(x, y, elev) === Matiere.EauDouce;
      monde.gele[i] = estEauDouce && temp <= config.seuilGelEauCelsius ? 1 : 0;
    }
  }
}
