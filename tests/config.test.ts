import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig, ErreurConfig, empreinteTexte, depouillerCommentaires } from '../src/sim/config/parse';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function chargerConfigValide() {
  const textes = lireDossierConfig(path.join(racine, 'config'));
  return parserConfig(textes);
}

describe('configuration externalisée', () => {
  it('charge les 8 fichiers de domaine valides', () => {
    const { config, empreintes } = chargerConfigValide();
    expect(config.monde.tailleGrille).toBe(1000);
    expect(config.temps.secondesParMoisAX1).toBe(300);
    expect(config.temps.vitessesDisponibles).toEqual([1, 5, 10, 25, 50]);
    expect(Object.keys(empreintes)).toHaveLength(8);
  });

  it('calcule une empreinte stable par fichier', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    expect(empreinteTexte(textes.monde)).toBe(empreinteTexte(textes.monde));
    expect(empreinteTexte(textes.monde + ' ')).not.toBe(empreinteTexte(textes.monde));
  });

  it('accepte les commentaires dans les fichiers jsonc', () => {
    expect(depouillerCommentaires('{"a": 1, // commentaire\n "b": "http://x/y"}')).toBe('{"a": 1, \n "b": "http://x/y"}');
    expect(JSON.parse(depouillerCommentaires('{/* bloc */ "a": 2}'))).toEqual({ a: 2 });
  });

  it('refuse de démarrer avec une valeur invalide et un message clair', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    const casses = { ...textes, monde: textes.monde.replace('"tailleGrille": 1000', '"tailleGrille": -5') };
    let erreur: ErreurConfig | null = null;
    try {
      parserConfig(casses);
    } catch (e) {
      erreur = e as ErreurConfig;
    }
    expect(erreur).toBeInstanceOf(ErreurConfig);
    expect(erreur!.erreurs.some((m) => m.includes('monde.tailleGrille'))).toBe(true);
  });

  it('signale un fichier manquant', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    delete textes.recit;
    expect(() => parserConfig(textes)).toThrow(/recit\.jsonc: fichier manquant/);
  });

  it('signale un JSON invalide', () => {
    const textes = lireDossierConfig(path.join(racine, 'config'));
    textes.temps = '{ "secondesParMoisAX1": 300, }';
    expect(() => parserConfig(textes)).toThrow(/temps\.jsonc: JSON invalide/);
  });
});
