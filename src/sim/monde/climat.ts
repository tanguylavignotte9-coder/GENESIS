import type { ConfigMonde } from '../config/schema';

function lisser(x: number): number {
  return x * x * (3 - 2 * x);
}

export function temperatureBaseCelsius(config: ConfigMonde, distanceEquateur: number): number {
  const f = lisser(Math.min(1, Math.max(0, distanceEquateur)));
  return config.temperatureEquateurCelsius + (config.temperaturePoleCelsius - config.temperatureEquateurCelsius) * f;
}

// Humidité de base, continue de l'équateur aux pôles (aucun palier de latitude) :
// courbe lisse équateur -> pôle, moins une ceinture sèche subtropicale gaussienne,
// plus un bruit multi-octaves et un bonus graduel près de l'eau (proximiteEau dans [0, 1]).
export function humiditeBasePourcent(config: ConfigMonde, distanceEquateur: number, bruit: number, proximiteEau: number): number {
  const d = Math.min(1, Math.max(0, distanceEquateur));
  const lat = lisser(d);
  let h = config.humiditeEquateurPourcent + (config.humiditePolePourcent - config.humiditeEquateurPourcent) * lat;
  const x = (d - config.centreSecheresseSubtropicaleFraction) / config.largeurSecheresseSubtropicaleFraction;
  h -= config.amplitudeSecheresseSubtropicalePourcent * Math.exp(-x * x);
  h += (bruit - 0.5) * 2 * config.amplitudeBruitHumiditePourcent;
  h += proximiteEau * config.bonusHumiditeProcheEauPourcent;
  return Math.min(100, Math.max(0, h));
}
