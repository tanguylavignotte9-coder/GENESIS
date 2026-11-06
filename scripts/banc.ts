import path from 'node:path';
import fs from 'node:fs';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { runBanc, formaterBanc, type ResultatBanc } from '../src/sim/banc';

const racine = process.cwd();

function arg(nom: string, defaut: string): string {
  const i = process.argv.indexOf(`--${nom}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return defaut;
}

const seed = Number(arg('seed', '42'));
const mois = Number(arg('mois', '24'));
const nbIndividus = Number(arg('individus', '1000'));
const nbBandes = Number(arg('bandes', '3'));
const tailleBande = Number(arg('taille', '25'));
const dossierConfig = path.resolve(racine, arg('config', 'config'));

const textes = lireDossierConfig(dossierConfig);
const { config, empreintes } = parserConfig(textes);

const resultat: ResultatBanc = runBanc({ seed, mois, config, empreintes, nbIndividusTest: nbIndividus, nbBandes, tailleBande });

console.log(formaterBanc(resultat));

const dossierBanc = path.join(racine, 'banc');
fs.mkdirSync(dossierBanc, { recursive: true });
fs.writeFileSync(path.join(dossierBanc, 'dernier-banc.json'), JSON.stringify(resultat, null, 2), 'utf8');
console.log(`\nRésultats écrits dans banc/dernier-banc.json`);
