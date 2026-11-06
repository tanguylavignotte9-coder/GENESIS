import { Rng } from './rng';
import { Monde } from './monde/monde';
import { genererMonde } from './monde/generateur';
import { miseAJourMeteoMensuelle } from './monde/meteo';
import { miseAJourVegetationMensuelle } from './monde/vegetation';
import { Calendrier } from './temps/calendrier';
import { BoucleTemps } from './temps/boucleTemps';
import { Journal, TypeEvenement } from './journal/journal';
import { Individu } from './entites/individu';
import { Groupe } from './groupes/groupe';
import { Objet } from './economie/objet';
import { EntiteBatiment } from './batiments/batiment';
import { Langue } from './culture/langue';
import { GrapheSavoir } from './savoir/connaissance';
import type { ConfigComplete } from './config/schema';
import type { EtatPartage } from './etat';
import { Matiere, Meteo, Vegetation } from './types';

export class Simulation {
  etat: EtatPartage;
  config: ConfigComplete;
  boucleTemps: BoucleTemps;
  private moisDernierTick: number;

  constructor(config: ConfigComplete, seed: number) {
    this.config = config;
    this.etat = {
      monde: new Monde(config.monde),
      calendrier: new Calendrier(config.temps),
      rng: new Rng(seed),
      journal: new Journal(),
      individus: new Map(),
      groupes: new Map(),
      objets: new Map(),
      batiments: new Map(),
      langues: new Map(),
      religions: new Map(),
      savoir: new GrapheSavoir(),
      prochainIdIndividu: 1,
      prochainIdGroupe: 1,
      prochainIdObjet: 1,
      prochainIdBatiment: 1,
      prochainIdLangue: 1,
      prochainIdReligion: 1,
      seed,
      zoneActive: null,
      extinctionTotale: false,
    };
    this.boucleTemps = new BoucleTemps(config.temps);
    this.moisDernierTick = 1;
  }

  initialiser(): void {
    genererMonde(this.etat.monde, this.config.monde, this.etat.rng);
    const langueMere = new Langue(this.etat.prochainIdLangue++, 'langue-mère', null);
    this.etat.langues.set(langueMere.id, langueMere);
    this.etat.journal.ajouter({
      date: { an: this.etat.calendrier.an, mois: this.etat.calendrier.mois },
      type: TypeEvenement.Monde,
      sujet: 'Génération du monde',
      description: `Monde généré depuis la graine ${this.etat.seed} : ${this.etat.monde.taille}x${this.etat.monde.taille} tuiles, ${this.etat.langues.size} langue-mère.`,
      individusImpliques: [],
      tuileX: null,
      tuileY: null,
    });
    this.moisDernierTick = this.etat.calendrier.mois;
  }

  get vitesseActuelle(): number {
    return this.boucleTemps.vitesse;
  }

  definirVitesse(v: number): void {
    this.boucleTemps.definirVitesse(v);
  }

  pause(): void {
    this.boucleTemps.pause();
  }

  tick(secondesReelles: number): void {
    if (this.etat.extinctionTotale) return;
    const { jours, nouveauMois } = this.boucleTemps.avancerSecondesReelles(secondesReelles, this.etat.calendrier);
    if (nouveauMois) {
      this.tickMensuel();
    }
    this.tickIndividus(jours);
  }

  private tickMensuel(): void {
    miseAJourMeteoMensuelle(this.etat.monde, this.etat.calendrier, this.config.monde, this.etat.rng);
    miseAJourVegetationMensuelle(this.etat.monde, this.etat.calendrier, this.config.monde, this.config.fauneFlore, this.etat.rng);
    this.moisDernierTick = this.etat.calendrier.mois;
    const vivants = Array.from(this.etat.individus.values()).filter((i) => i.vivant).length;
    if (vivants === 0 && this.etat.individus.size > 0) {
      this.etat.extinctionTotale = true;
      this.etat.journal.ajouter({
        date: { an: this.etat.calendrier.an, mois: this.etat.calendrier.mois },
        type: TypeEvenement.Mort,
        sujet: 'Extinction totale',
        description: "Tous les humains sont morts. La partie s'achève ; la chronique complète de l'espèce est disponible dans le journal.",
        individusImpliques: [],
        tuileX: null,
        tuileY: null,
      });
    }
  }

  private tickIndividus(joursAvances: number): void {
    if (joursAvances <= 0) return;
    const zone = this.etat.zoneActive;
    const joursParAn = this.config.temps.joursParMois * this.config.temps.moisParAn;
    for (const ind of this.etat.individus.values()) {
      if (!ind.vivant) continue;
      if (zone) {
        const dedans =
          ind.positionX >= zone.x0 && ind.positionX <= zone.x1 && ind.positionY >= zone.y0 && ind.positionY <= zone.y1;
        if (!dedans) continue;
      }
      ind.ageAnnees += joursAvances / joursParAn;
    }
  }

  empreinteMonde(): string {
    return this.etat.monde.empreinte;
  }

  digestCouleurs(): Uint32Array {
    const monde = this.etat.monde;
    const t = monde.taille;
    const out = new Uint32Array(t * t);
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        const i = monde.index(x, y);
        const elev = monde.elevation[i];
        const m = monde.matiereNiveau(x, y, elev);
        let r: number, g: number, b: number;
        switch (m) {
          case Matiere.EauSalee:
            r = 24; g = 48; b = 92;
            break;
          case Matiere.EauDouce:
            r = monde.gele[i] === 1 ? 190 : 48;
            g = monde.gele[i] === 1 ? 210 : 96;
            b = monde.gele[i] === 1 ? 235 : 180;
            break;
          case Matiere.Sable:
            r = 194; g = 178; b = 128;
            break;
          case Matiere.Pierre:
            r = 110; g = 108; b = 104;
            break;
          case Matiere.Charbon:
            r = 35; g = 33; b = 38;
            break;
          case Matiere.Gaz:
            r = 120; g = 110; b = 160;
            break;
          case Matiere.Uranium:
            r = 90; g = 200; b = 90;
            break;
          case Matiere.Petrole:
            r = 40; g = 30; b = 45;
            break;
          case Matiere.Fer:
            r = 150; g = 90; b = 70;
            break;
          case Matiere.Cuivre:
            r = 190; g = 110; b = 60;
            break;
          case Matiere.Etain:
            r = 170; g = 175; b = 185;
            break;
          case Matiere.Or:
            r = 230; g = 200; b = 60;
            break;
          case Matiere.Argent:
            r = 210; g = 215; b = 225;
            break;
          case Matiere.Sel:
            r = 240; g = 240; b = 235;
            break;
          default:
            r = 96; g = 76; b = 56;
        }
        const veg = monde.vegetation[i];
        if (m !== Matiere.EauSalee && m !== Matiere.EauDouce) {
          if (veg === Vegetation.Foret || veg === Vegetation.Taiga || veg === Vegetation.Jungle) {
            r = Math.round(r * 0.35); g = Math.round(90 + elev * 8); b = Math.round(r * 0.3);
          } else if (veg === Vegetation.Prairie || veg === Vegetation.Savane) {
            r = Math.round(r * 0.7 + 40); g = Math.round(g * 0.8 + 50); b = Math.round(b * 0.5 + 20);
          } else if (veg === Vegetation.Desert) {
            r = 205; g = 185; b = 130;
          } else if (veg === Vegetation.Neige || veg === Vegetation.Toundra) {
            r = 225; g = 230; b = 238;
          }
        }
        const ombre = 1 - elev * 0.07;
        r = Math.round(r * ombre);
        g = Math.round(g * ombre);
        b = Math.round(b * ombre);
        const meteo = monde.meteo[i];
        if (meteo === Meteo.Pluie) {
          r = Math.round(r * 0.75); g = Math.round(g * 0.8); b = Math.round(b * 0.95);
        } else if (meteo === Meteo.Neige || (meteo === Meteo.Nuage && veg === Vegetation.Neige)) {
          r = 235; g = 240; b = 248;
        } else if (meteo === Meteo.Nuage) {
          r = Math.round(r * 0.85); g = Math.round(g * 0.87); b = Math.round(b * 0.9);
        }
        const pollution = monde.pollution[i];
        if (pollution > 0.3) {
          const f = Math.min(1, pollution);
          r = Math.round(r * (1 - f * 0.5) + 60 * f * 0.5);
          g = Math.round(g * (1 - f * 0.6) + 50 * f * 0.4);
          b = Math.round(b * (1 - f * 0.7) + 45 * f * 0.3);
        }
        out[i] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
    return out;
  }
}
