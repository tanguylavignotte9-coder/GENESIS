import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireDossierConfig } from '../src/sim/config/lireDisque';
import { parserConfig, ErreurConfig } from '../src/sim/config/parse';
import { parserConfigRendu, NOM_FICHIER_RENDU } from '../src/sim/config/rendu';
import { genererAtlas, hashTuile, peindreHumain, couleurPeau, Canevas, TYPES_BATIMENTS_ATTENDUS, saisonVersIndexPalette } from '../src/renderer/pixelart/atlas';
import { planTuile, estMatiereEau, estMatiereGisement } from '../src/renderer/pixelart/planTuile';
import { digestRenduV2, decoderMot, MASQUE_MATIERE, MASQUE_ELEVATION, MASQUE_VEGETATION, BIT_SENTIER, MASQUE_NIVEAU_SENTIER, MASQUE_POLLUTION, BIT_GELE } from '../src/sim/worker/digestRendu';
import { Simulation } from '../src/sim/simulation';
import { serialiserSimulation, deserialiserSimulation } from '../src/sim/sauvegarde/serialiseur';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function chargerTout() {
  const textes = lireDossierConfig(path.join(racine, 'config'));
  const { config, empreintes } = parserConfig(textes);
  const rendu = parserConfigRendu(textes[NOM_FICHIER_RENDU]);
  return { textes, config, empreintes, rendu };
}

function motTest(opts: { matiere?: number; elevation?: number; vegetation?: number; meteo?: number; gele?: boolean; pollutionQ?: number; sentier?: boolean; niveauSentier?: number; biomasseQ?: number }): number {
  return (
    (opts.matiere ?? 1) |
    ((opts.elevation ?? 1) << 4) |
    ((opts.vegetation ?? 0) << 8) |
    ((opts.meteo ?? 0) << 12) |
    (opts.gele ? BIT_GELE : 0) |
    ((opts.pollutionQ ?? 0) << 15) |
    (opts.sentier ? BIT_SENTIER : 0) |
    ((opts.niveauSentier ?? 0) << 18) |
    ((opts.biomasseQ ?? 0) << 20)
  );
}

describe('config rendu.jsonc (V1.2)', () => {
  it('charge et valide rendu.jsonc comme les autres fichiers', () => {
    const { rendu } = chargerTout();
    expect(rendu.tailleTuilePx).toBe(8);
    expect(rendu.paliersZoomPxParTuile).toEqual([4, 8, 16, 32, 64]);
    expect(rendu.variantesParTuile).toBe(4);
    expect(rendu.seuils.spritesCompletsPxParTuile).toBe(8);
    expect(rendu.seuils.cheveuxPxParTuile).toBe(32);
    expect(rendu.seuils.frontieresPxParTuile).toBe(5);
    expect(rendu.palettes.eau.base).toBe('#2e5d9e');
    expect(rendu.palettes.eau.ecume).toBe('#d9e8f2');
    expect(Object.keys(rendu.palettes.gisement)).toHaveLength(10);
    expect(Object.keys(rendu.palettes.especes)).toHaveLength(7);
    expect(Object.keys(rendu.saisons)).toEqual(['printemps', 'ete', 'automne', 'hiver']);
  });

  it('reste HORS empreinte de sauvegarde (empreintes = 8 domaines, sans "rendu")', () => {
    const { empreintes, textes } = chargerTout();
    expect(Object.keys(empreintes)).toHaveLength(8);
    expect('rendu' in empreintes).toBe(false);
    expect(textes[NOM_FICHIER_RENDU]).toBeDefined();
    const { config } = chargerTout();
    const sim = new Simulation(config, 5);
    sim.initialiser();
    const json = JSON.parse(serialiserSimulation(sim, empreintes, new Date().toISOString()));
    expect('rendu' in json.empreinteConfig).toBe(false);
    const { avertissements } = deserialiserSimulation(JSON.stringify(json), config, empreintes);
    expect(avertissements).toEqual([]);
  });

  it('refuse un rendu invalide avec un message clair', () => {
    const { textes } = chargerTout();
    const casse = textes[NOM_FICHIER_RENDU].replace('"tailleTuilePx": 8', '"tailleTuilePx": 2');
    let erreur: ErreurConfig | null = null;
    try {
      parserConfigRendu(casse);
    } catch (e) {
      erreur = e as ErreurConfig;
    }
    expect(erreur).toBeInstanceOf(ErreurConfig);
    expect(erreur!.erreurs.some((m) => m.includes('rendu.tailleTuilePx'))).toBe(true);

    const paliersCasses = textes[NOM_FICHIER_RENDU].replace('[4, 8, 16, 32, 64]', '[16, 8]');
    expect(() => parserConfigRendu(paliersCasses)).toThrow(/paliersZoomPxParTuile/);
    expect(() => parserConfigRendu(undefined)).toThrow(/rendu\.jsonc: fichier manquant/);
  });
});

describe('atlas procédural (V1.2)', () => {
  it('est déterministe (même graine => mêmes pixels) et raisonnable en mémoire', () => {
    const { rendu } = chargerTout();
    const t0 = performance.now();
    const a = genererAtlas(rendu);
    const ms = performance.now() - t0;
    const b = genererAtlas(rendu);
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
    expect(ms).toBeLessThan(500);
    expect(a.pixels.length / 1024 / 1024).toBeLessThan(50);
  });

  it('couvre les 9 végétations × 4 variantes, distinctes visuellement', () => {
    const { rendu } = chargerTout();
    const atlas = genererAtlas(rendu);
    const vegs = ['toundra', 'taiga', 'foret', 'prairie', 'savane', 'jungle', 'desert', 'neige'];
    for (const v of vegs) {
      for (let variante = 0; variante < 4; variante++) {
        const cle = v === 'foret' || v === 'prairie' || v === 'savane' ? `tuile:${v}:s1:v${variante}` : `tuile:${v}:v${variante}`;
        expect(atlas.sprites[cle], cle).toBeDefined();
      }
    }
    for (const s of [0, 1, 2, 3]) {
      for (let variante = 0; variante < 4; variante++) {
        expect(atlas.sprites[`tuile:prairie:s${s}:v${variante}`]).toBeDefined();
        expect(atlas.sprites[`tuile:foret:s${s}:v${variante}`]).toBeDefined();
      }
    }
    expect(atlas.sprites['tuile:eau:v0']).toBeDefined();
    expect(atlas.sprites['tuile:eau:v0'].frames).toBe(2);
    expect(atlas.sprites['tuile:eauProfonde:v0']).toBeDefined();
    expect(atlas.sprites['tuile:eauGelee:v0']).toBeDefined();
    expect(atlas.sprites['tuile:plage:v0']).toBeDefined();
    expect(atlas.sprites['tuile:terre:v0']).toBeDefined();
    expect(atlas.sprites['tuile:colline:v0']).toBeDefined();
    expect(atlas.sprites['tuile:montagne:v0']).toBeDefined();
    const empreinte = (cle: string) => {
      const s = atlas.sprites[cle];
      let h = 0;
      for (let i = 0; i < s.w * s.h * 4; i++) h = (h * 31 + atlas.pixels[(s.y * atlas.largeur + s.x) * 4 + i]) >>> 0;
      return h;
    };
    const empreintes = vegs.map((v) => empreinte(v === 'foret' || v === 'prairie' || v === 'savane' ? `tuile:${v}:s1:v0` : `tuile:${v}:v0`));
    expect(new Set(empreintes).size).toBe(vegs.length);
  });

  it('couvre les 33 types de bâtiments (+ chantier, ruine, murée pour les mines)', () => {
    const { rendu, config } = chargerTout();
    const atlas = genererAtlas(rendu);
    const typesConfig = Object.keys(config.batiments.types);
    expect(typesConfig).toHaveLength(33);
    expect([...typesConfig].sort()).toEqual([...TYPES_BATIMENTS_ATTENDUS].sort());
    for (const t of typesConfig) {
      expect(atlas.sprites[`bat:${t}`], `bat:${t}`).toBeDefined();
      expect(atlas.sprites[`bat:${t}:chantier`], `bat:${t}:chantier`).toBeDefined();
      expect(atlas.sprites[`bat:${t}:ruine`], `bat:${t}:ruine`).toBeDefined();
      expect(atlas.sprites[`marqueur:bat:${t}`], `marqueur:bat:${t}`).toBeDefined();
      if (t.startsWith('mine-')) expect(atlas.sprites[`bat:${t}:muree`]).toBeDefined();
    }
    expect(atlas.sprites['bat:champ:mature']).toBeDefined();
    expect(atlas.sprites['bat:feuDeCamp'].frames).toBe(2);
    expect(atlas.sprites['bat:moulin'].frames).toBe(2);
    expect(atlas.sprites['bat:forge'].frames).toBe(2);
    expect(atlas.sprites['bat:bateau'].frames).toBe(2);
    expect(atlas.sprites['bat:charrette'].frames).toBe(2);
  });

  it('couvre les 7 espèces × 2 frames + ombre du vautour + marqueurs', () => {
    const { rendu, config } = chargerTout();
    const atlas = genererAtlas(rendu);
    const especes = Object.keys(config.fauneFlore.especes);
    expect(especes).toHaveLength(7);
    for (const e of especes) {
      expect(atlas.sprites[`espece:${e}`], e).toBeDefined();
      expect(atlas.sprites[`espece:${e}`].frames).toBe(2);
      expect(atlas.sprites[`marqueur:espece:${e}`]).toBeDefined();
    }
    expect(atlas.sprites['espece:vautour:ombre']).toBeDefined();
    expect(atlas.sprites['marqueur:humain']).toBeDefined();
    expect(atlas.sprites['marqueur:favori']).toBeDefined();
    expect(atlas.sprites['marqueur:dirigeant']).toBeDefined();
  });

  it('hash de variante stable et humain 3×5 conforme à la maquette', () => {
    expect(hashTuile(10, 20) % 4).toBe(hashTuile(10, 20) % 4);
    expect(hashTuile(10, 20)).not.toBe(hashTuile(10, 21));
    const { rendu } = chargerTout();
    const c = new Canevas(3, 5);
    peindreHumain(c, { peau: couleurPeau(50, rendu.palettes.peau), tunique: [150, 60, 50], frame: 0 });
    expect(c.get(1, 0)[3]).toBe(255);
    expect(c.get(0, 1)[3]).toBe(255);
    expect(c.get(2, 3)[3]).toBe(255);
    expect(c.get(0, 4)[3]).toBe(255);
    expect(c.get(2, 4)[3]).toBe(255);
    const c2 = new Canevas(3, 5);
    peindreHumain(c2, { peau: couleurPeau(50, rendu.palettes.peau), tunique: [150, 60, 50], frame: 1 });
    expect(c2.get(2, 4)[3]).toBe(0);
    expect(c2.get(2, 3)[3]).toBe(255);
    expect(saisonVersIndexPalette(0)).toBe(0);
    expect(saisonVersIndexPalette(1)).toBe(1);
    expect(saisonVersIndexPalette(3)).toBe(3);
  });
});

describe('plan de tuile (relief, écume, sentier, pollution, gisement)', () => {
  it('applique la formule exacte d\'ombrage du relief (Annexe A)', () => {
    const { rendu } = chargerTout();
    const base = { x: 5, y: 5, terreHaut: false, terreBas: false, terreGauche: false, terreDroite: false, profond: false, saisonIdx: 1, rendu };
    const planMonte = planTuile(motTest({ matiere: 1, elevation: 3, vegetation: 0 }), { ...base, eGauche: 1, eHaut: 1 });
    const ombre = planMonte.rects.find((r) => r.c === '#000000');
    expect(ombre).toBeDefined();
    expect(ombre!.a).toBeCloseTo(Math.min(0.28, ((3 - 1) + (3 - 1)) * 2.2), 5);
    const planDescend = planTuile(motTest({ matiere: 1, elevation: 1, vegetation: 0 }), { ...base, eGauche: 3, eHaut: 3 });
    const lum = planDescend.rects.find((r) => r.c === '#ffffff');
    expect(lum).toBeDefined();
    expect(lum!.a).toBeCloseTo(Math.min(0.14, -((1 - 3) + (1 - 3)) * 1.4), 5);
  });

  it('dessine l\'écume sur les côtés d\'eau adjacents à la terre, le gel, le sentier, la pollution, les gisements', () => {
    const { rendu } = chargerTout();
    const base = { x: 5, y: 5, eGauche: 1, eHaut: 1, profond: false, saisonIdx: 1, rendu, terreHaut: false, terreBas: false, terreGauche: false, terreDroite: false };
    const eau = planTuile(motTest({ matiere: 3, elevation: 1 }), { ...base, terreHaut: true, terreGauche: true });
    expect(eau.sprite).toBe('tuile:eau:v' + (hashTuile(5, 5) % 4));
    expect(eau.rects.filter((r) => r.c === rendu.palettes.eau.ecume)).toHaveLength(2);
    const profond = planTuile(motTest({ matiere: 3, elevation: 1 }), { ...base, profond: true });
    expect(profond.sprite).toContain('eauProfonde');
    const gele = planTuile(motTest({ matiere: 2, elevation: 2, gele: true }), base);
    expect(gele.sprite).toContain('eauGelee');
    const sentier = planTuile(motTest({ matiere: 1, elevation: 1, vegetation: 4, sentier: true, niveauSentier: 3 }), base);
    expect(sentier.sprite).toContain('prairie');
    expect(sentier.rects.some((r) => r.c === rendu.palettes.sentier.base && r.w === 8)).toBe(true);
    const pollu = planTuile(motTest({ matiere: 1, elevation: 1, pollutionQ: 3 }), base);
    expect(pollu.rects.some((r) => r.c === rendu.palettes.pollution.couleur && r.a > 0.5)).toBe(true);
    const fer = planTuile(motTest({ matiere: 9, elevation: 2 }), base);
    expect(fer.rects.filter((r) => r.c === rendu.palettes.gisement.fer)).toHaveLength(3);
    expect(estMatiereEau(3)).toBe(true);
    expect(estMatiereGisement(9)).toBe(true);
    expect(estMatiereGisement(1)).toBe(false);
  });
});

describe('digest V2 worker -> renderer', () => {
  function simPetite(graine: number) {
    const { config, empreintes } = chargerTout();
    config.monde.tailleGrille = 100;
    const sim = new Simulation(config, graine);
    sim.initialiser({ nbBandes: 2, tailleBande: 5 });
    return { sim, config, empreintes };
  }

  it('produit un mot par tuile décodable + versions de chunks, sans toucher au RNG de la sim', () => {
    const { sim, config } = simPetite(42);
    const empreinteAvant = sim.empreinteMonde();
    const d = digestRenduV2(sim.etat, config);
    expect(d.tuiles.length).toBe(100 * 100);
    expect(d.chunkSize).toBe(64);
    expect(d.chunkVersions.length).toBe(2 * 2);
    expect(d.individus.length % 6).toBe(0);
    expect(d.individus.length).toBeGreaterThan(0);
    expect(d.animaux.length % 5).toBe(0);
    expect(d.especes.length).toBe(7);
    expect(d.typesBatiments.length).toBe(33);
    let nbEau = 0;
    for (let i = 0; i < d.tuiles.length; i++) {
      const m = decoderMot(d.tuiles[i]);
      expect(m.matiere).toBeLessThanOrEqual(14);
      if (m.matiere === 2 || m.matiere === 3) nbEau++;
    }
    expect(nbEau).toBeGreaterThan(0);
    expect(sim.empreinteMonde()).toBe(empreinteAvant);
    const { sim: simB, config: configB } = simPetite(42);
    const dB = digestRenduV2(simB.etat, configB);
    expect(Buffer.from(d.tuiles).equals(Buffer.from(dB.tuiles))).toBe(true);
    expect(Buffer.from(d.chunkVersions).equals(Buffer.from(dB.chunkVersions))).toBe(true);
  });

  it('le digest ne consomme pas le RNG : deux sims avancent pareil après digest', () => {
    const { sim, config } = simPetite(7);
    const { sim: simB, config: configB } = simPetite(7);
    void digestRenduV2(sim.etat, config);
    const c = config.temps;
    sim.definirVitesse(Math.max(...c.vitessesDisponibles));
    simB.definirVitesse(Math.max(...c.vitessesDisponibles));
    for (let i = 0; i < 2000; i++) {
      sim.tick(c.pasDeTempsSecondesReel);
      simB.tick(c.pasDeTempsSecondesReel);
    }
    void configB;
    expect(sim.empreinteMonde()).toBe(simB.empreinteMonde());
  });
});
