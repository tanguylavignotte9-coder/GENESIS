import fs from 'node:fs';
import path from 'node:path';
import { NOMS_FICHIERS_CONFIG } from './schema';

export function lireDossierConfig(dossier: string): Record<string, string> {
  const textes: Record<string, string> = {};
  for (const nom of NOMS_FICHIERS_CONFIG) {
    const fichier = path.join(dossier, `${nom}.jsonc`);
    textes[nom] = fs.readFileSync(fichier, 'utf8');
  }
  return textes;
}
