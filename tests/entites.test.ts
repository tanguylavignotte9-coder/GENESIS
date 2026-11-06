import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig } from '../src/sim/config/parse';
import { Individu } from '../src/sim/entites/individu';
import { creerEnfant, estProcheParent } from '../src/sim/entites/genetique';
import { Rng } from '../src/sim/rng';
import { Sexe, Competence } from '../src/sim/types';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function config() {
  return parserConfig(lireDossierConfig(path.join(racine, 'config'))).config.individus;
}

describe('modèle individu et génétique', () => {
  it('l\'enfant hérite d\'un mix des traits physiques des parents, jamais des compétences', () => {
    const c = config();
    const rng = new Rng(42);
    const pere = new Individu(1, 'Père');
    const mere = new Individu(2, 'Mère');
    pere.force = 90;
    mere.force = 50;
    pereBiologiqueTest(pere, mere);
    pere.competences[Competence.Chasse] = 95;
    mere.competences[Competence.Chasse] = 90;
    const enfant = creerEnfant(3, 'Enfant', pere, mere, pere, rng, c, { an: 1, mois: 3 }, 0);
    expect(enfant.force).toBeGreaterThan(50);
    expect(enfant.force).toBeLessThan(100);
    expect(enfant.competences[Competence.Chasse]).toBe(0);
    expect(enfant.pereRegistre).toBe(pere.id);
    expect(enfant.pereBiologique).toBe(pere.id);
    expect(pere.enfants).toContain(3);
    expect(mere.enfants).toContain(3);
    expect(enfant.sante.blessures).toEqual([]);
    expect(enfant.sante.maladies).toEqual([]);
  });

  it('détecte la consanguinité via les ancêtres communs', () => {
    const grandPere = new Individu(1, 'Grand-père');
    const grandMere = new Individu(2, 'Grand-mère');
    const pere = new Individu(3, 'Père');
    pere.pereBiologique = grandPere.id;
    pere.mere = grandMere.id;
    const tante = new Individu(4, 'Tante');
    tante.pereBiologique = grandPere.id;
    tante.mere = grandMere.id;
    const individus = new Map([
      [grandPere.id, grandPere],
      [grandMere.id, grandMere],
      [pere.id, pere],
      [tante.id, tante],
    ]);
    expect(estProcheParent(pere, tante, individus)).toBe(true);
    const inconnu = new Individu(9, 'Inconnu');
    const individus2 = new Map([...individus, [inconnu.id, inconnu]]);
    expect(estProcheParent(pere, inconnu, individus2)).toBe(false);
  });

  it('le sexe n\'introduit aucune différence d\'attributs (tirage symétrique)', () => {
    const c = config();
    const stats = { homme: 0, femme: 0 };
    for (let i = 0; i < 200; i++) {
      const rng = new Rng(i);
      const pere = new Individu(1, 'P');
      const mere = new Individu(2, 'M');
      pereBiologiqueTest(pere, mere);
      const e = creerEnfant(3, 'E', pere, mere, pere, rng, c, { an: 1, mois: 1 }, 0);
      if (e.sexe === Sexe.Homme) stats.homme++;
      else stats.femme++;
    }
    expect(Math.abs(stats.homme - stats.femme)).toBeLessThan(40);
  });
});

function pereBiologiqueTest(pere: Individu, mere: Individu): void {
  pere.sexe = Sexe.Homme;
  mere.sexe = Sexe.Femme;
}
