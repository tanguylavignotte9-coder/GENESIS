import type { ConfigMonde } from '../config/schema';

function lisser(x: number): number {
  return x * x * (3 - 2 * x);
}

export function temperatureBaseCelsius(config: ConfigMonde, distanceEquateur: number): number {
  const f = lisser(Math.min(1, Math.max(0, distanceEquateur)));
  return config.temperatureEquateurCelsius + (config.temperaturePoleCelsius - config.temperatureEquateurCelsius) * f;
}

export function humiditeBasePourcent(config: ConfigMonde, distanceEquateur: number, bruit: number, presEau: boolean): number {
  let base: number;
  if (distanceEquateur < config.limiteZoneTropicale) {
    base = 75;
  } else if (distanceEquateur < config.limiteZonePolaire) {
    base = 55 - Math.abs(distanceEquateur - 0.45) * 60;
  } else {
    base = 30;
  }
  let h = base + (bruit - 0.5) * 30;
  if (presEau) h += 15;
  return Math.min(100, Math.max(0, h));
}
