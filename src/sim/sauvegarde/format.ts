export const VERSION_SAUVEGARDE = 1;

export interface SauvegardeBrute {
  version: number;
  seed: number;
  empreinteConfig: Record<string, string>;
  creeLe: string;
  etat: unknown;
}

export const MIGRATIONS: Record<number, (donnees: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrerVersVersionActuelle(donnees: SauvegardeBrute): SauvegardeBrute {
  let version = donnees.version;
  let courant = donnees as unknown as Record<string, unknown>;
  while (version < VERSION_SAUVEGARDE) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Aucune migration disponible depuis la version ${version} (version actuelle : ${VERSION_SAUVEGARDE})`);
    }
    courant = migration(courant);
    version++;
  }
  return { ...(courant as unknown as SauvegardeBrute), version };
}
