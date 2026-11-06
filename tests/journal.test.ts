import { describe, expect, it } from 'vitest';

import { Journal, TypeEvenement } from '../src/sim/journal/journal';

describe('journal (lecture seule pour la simulation)', () => {
  it('enregistre et relit dans l\'ordre, avec filtres', () => {
    const j = new Journal();
    j.ajouter({ date: { an: 1, mois: 1 }, type: TypeEvenement.Monde, sujet: 'Monde', description: 'généré', individusImpliques: [], tuileX: null, tuileY: null });
    j.ajouter({ date: { an: 1, mois: 2 }, type: TypeEvenement.Naissance, sujet: 'Naissance', description: 'X est né', individusImpliques: [1], tuileX: 10, tuileY: 20 });
    j.ajouter({ date: { an: 1, mois: 3 }, type: TypeEvenement.Mort, sujet: 'Mort', description: 'Y est mort', individusImpliques: [2], tuileX: null, tuileY: null });
    expect(j.taille).toBe(3);
    expect(j.lire().map((e) => e.id)).toEqual([1, 2, 3]);
    expect(j.lire({ types: [TypeEvenement.Mort] })).toHaveLength(1);
    expect(j.lire({ depuisId: 1 })).toHaveLength(2);
    expect(j.lire({ individuId: 1 })).toHaveLength(1);
  });

  it('notifie les abonnés à chaque ajout', () => {
    const j = new Journal();
    const vus: number[] = [];
    const desabonner = j.abonner((e) => vus.push(e.id));
    j.ajouter({ date: { an: 1, mois: 1 }, type: TypeEvenement.Autre, sujet: 'a', description: 'a', individusImpliques: [], tuileX: null, tuileY: null });
    desabonner();
    j.ajouter({ date: { an: 1, mois: 2 }, type: TypeEvenement.Autre, sujet: 'b', description: 'b', individusImpliques: [], tuileX: null, tuileY: null });
    expect(vus).toEqual([1]);
  });

  it('la lecture retourne une copie (pas de mutation externe possible)', () => {
    const j = new Journal();
    j.ajouter({ date: { an: 1, mois: 1 }, type: TypeEvenement.Autre, sujet: 'a', description: 'a', individusImpliques: [5], tuileX: null, tuileY: null });
    const lu = j.lire();
    lu[0].individusImpliques.push(999);
    lu.pop();
    expect(j.lire()).toHaveLength(1);
    expect(j.lire()[0].individusImpliques).toEqual([5]);
  });

  it('sérialise et restaure à l\'identique', () => {
    const j = new Journal();
    j.ajouter({ date: { an: 2, mois: 5 }, type: TypeEvenement.Schisme, sujet: 'Schisme', description: 'd', individusImpliques: [1, 2], tuileX: 3, tuileY: 4 });
    const j2 = new Journal();
    j2.restaurer(j.serialiser());
    expect(j2.lire()).toEqual(j.lire());
  });
});
