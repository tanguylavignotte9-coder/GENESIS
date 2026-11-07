import fs from 'node:fs';
import path from 'node:path';
import { NOMS_FICHIERS_CONFIG } from './schema';
import { NOM_FICHIER_RENDU } from './rendu';

export function lireDossierConfig(dossier: string): Record<string, string> {
  const textes: Record<string, string> = {};
  for (const nom of NOMS_FICHIERS_CONFIG) {
    const fichier = path.join(dossier, `${nom}.jsonc`);
    textes[nom] = fs.readFileSync(fichier, 'utf8');
  }
  // rendu.jsonc est purement cosmétique : lu à part, JAMAIS empreinté
  // (hors empreinte de sauvegarde, voir parserConfig / serialiseur).
  const fichierRendu = path.join(dossier, `${NOM_FICHIER_RENDU}.jsonc`);
  if (fs.existsSync(fichierRendu)) {
    textes[NOM_FICHIER_RENDU] = fs.readFileSync(fichierRendu, 'utf8');
  }
  return textes;
}
