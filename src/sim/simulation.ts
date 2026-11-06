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
import { peuplerMonde, miseAJourMensuelleFaune, empreinteAnimaux } from './faune/systemeFaune';
import { construireEspeces } from './faune/especes';
import { poserBandesInitiales } from './entites/bandes';
import { tickIndividu, indexAnimauxPourTick } from './entites/boucleIndividu';
import { decisionConstructionMensuelle, usureMensuelleBatiments, extractionMensuelle, pollutionMensuelle } from './batiments/systemeBatiments';
import { perceesMensuelles, transmissionMensuelle } from './savoir/systemeSavoir';
import { fabricationMensuelle, trocMensuel } from './economie/systemeEconomie';
import { gouvernanceMensuelle, recalculerTerritoires } from './groupes/gouvernance';
import { miseAJourLanguesMensuelle } from './culture/systemeLangues';
import { miseAJourReligionsMensuelle } from './culture/systemeReligion';
import { santeMentaleMensuelle } from './entites/boucleIndividu';
import { empreinteOctets } from './hash';
import type { ConfigComplete } from './config/schema';
import type { EtatPartage, ParametresDepart } from './etat';
import { Matiere, Meteo, Vegetation } from './types';

export class Simulation {
  etat: EtatPartage;
  config: ConfigComplete;
  boucleTemps: BoucleTemps;
  private moisDernierTick: number;
  private tickCount: number = 0;

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
      animaux: new Map(),
      champs: new Set(),
      parametresDepart: { seed, nbBandes: config.societe.bandesInitialesMin, tailleBande: config.societe.tailleBandeInitialeMin },
      prochainIdIndividu: 1,
      prochainIdAnimal: 1,
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

  initialiser(options?: { nbBandes?: number; tailleBande?: number }): void {
    const s = this.config.societe;
    const nbBandes = Math.max(s.bandesInitialesMin, Math.min(s.bandesInitialesMax, Math.round(options?.nbBandes ?? s.bandesInitialesMin)));
    const tailleBande = Math.max(s.tailleBandeInitialeMin, Math.min(s.tailleBandeInitialeMax, Math.round(options?.tailleBande ?? s.tailleBandeInitialeMin)));
    this.etat.parametresDepart = { seed: this.etat.seed, nbBandes, tailleBande };
    const langueMere = new Langue(this.etat.prochainIdLangue++, 'langue-mère', null);
    this.etat.langues.set(langueMere.id, langueMere);
    genererMonde(this.etat.monde, this.config.monde, this.etat.rng);
    peuplerMonde(this.etat, this.config.fauneFlore);
    poserBandesInitiales(this.etat, this.config);
    const vivants = Array.from(this.etat.animaux.values()).filter((a) => a.vivant).length;
    this.etat.journal.ajouter({
      date: { an: this.etat.calendrier.an, mois: this.etat.calendrier.mois },
      type: TypeEvenement.Monde,
      sujet: 'Génération du monde',
      description: `Monde généré depuis la graine ${this.etat.seed} : ${this.etat.monde.taille}x${this.etat.monde.taille} tuiles, ${vivants} animaux, langue-mère parlée par toutes les bandes.`,
      individusImpliques: [],
      tuileX: null,
      tuileY: null,
    });
    this.etat.journal.ajouter({
      date: { an: this.etat.calendrier.an, mois: this.etat.calendrier.mois },
      type: TypeEvenement.Monde,
      sujet: 'Départ des bandes',
      description: `${nbBandes} bande(s) de ${tailleBande} individus chacune apparaîtront sur le monde (an 1, mois 1 = origine du temps).`,
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
    miseAJourVegetationMensuelle(this.etat.monde, this.etat.calendrier, this.config.monde, this.config.fauneFlore, this.etat.rng, this.etat.champs);
    miseAJourMensuelleFaune(this.etat, this.config.fauneFlore);
    gouvernanceMensuelle(this.etat, this.config);
    perceesMensuelles(this.etat, this.config);
    transmissionMensuelle(this.etat, this.config);
    decisionConstructionMensuelle(this.etat, this.config);
    usureMensuelleBatiments(this.etat, this.config);
    extractionMensuelle(this.etat, this.config);
    pollutionMensuelle(this.etat, this.config);
    fabricationMensuelle(this.etat, this.config);
    trocMensuel(this.etat, this.config);
    miseAJourLanguesMensuelle(this.etat, this.config);
    miseAJourReligionsMensuelle(this.etat, this.config);
    santeMentaleMensuelle(this.etat, this.config);
    recalculerTerritoires(this.etat, this.config);
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
    this.tickCount++;
    const zone = this.etat.zoneActive;
    const lod = this.config.temps.lodTicksHorsZone;
    const indexAnimaux = indexAnimauxPourTick(this.etat);
    for (const ind of this.etat.individus.values()) {
      if (!ind.vivant) continue;
      if (zone) {
        const dedans =
          ind.positionX >= zone.x0 && ind.positionX <= zone.x1 && ind.positionY >= zone.y0 && ind.positionY <= zone.y1;
        if (!dedans && this.tickCount % lod !== 0) continue;
      }
      tickIndividu(this.etat, this.config, ind, joursAvances, indexAnimaux);
    }
  }

  empreinteMonde(): string {
    return this.etat.monde.empreinte;
  }

  empreinteAnimaux(): string {
    return empreinteAnimaux(this.etat);
  }

  empreinteIndividus(): string {
    const arr = new Uint32Array(this.etat.individus.size * 6);
    let i = 0;
    for (const ind of this.etat.individus.values()) {
      arr[i++] = ind.id;
      arr[i++] = Math.round(ind.positionX * 16) * 65536 + Math.round(ind.positionY * 16);
      arr[i++] = Math.round(ind.ageAnnees * 100) + (ind.vivant ? 100000 : 0);
      arr[i++] = Math.round(ind.sante.valeur * 100);
      arr[i++] = Math.round(ind.besoins.faim * 100) + Math.round(ind.besoins.soif);
      arr[i++] = ind.groupeId ?? 0;
    }
    return empreinteOctets(arr);
  }

  digestTerritoires(): Array<{ id: number; couleur: number; tuiles: number[] }> {
    const out: Array<{ id: number; couleur: number; tuiles: number[] }> = [];
    const t = this.etat.monde.taille;
    for (const g of this.etat.groupes.values()) {
      const tuiles: number[] = [];
      for (const p of g.territoire) {
        if (tuiles.length >= 800) break;
        tuiles.push(p.x, p.y);
      }
      out.push({ id: g.id, couleur: g.couleur, tuiles });
      void t;
    }
    return out;
  }

  digestIndividus(): number[] {
    const out: number[] = [];
    for (const ind of this.etat.individus.values()) {
      if (!ind.vivant) continue;
      out.push(ind.id, Math.round(ind.positionX * 10), Math.round(ind.positionY * 10));
    }
    return out;
  }

  digestAnimaux(): number[] {
    const especes = construireEspeces(this.config.fauneFlore);
    const out: number[] = [];
    const max = 20000;
    for (const a of this.etat.animaux.values()) {
      if (!a.vivant) continue;
      if (out.length >= max * 3) break;
      const e = especes.get(a.especeId);
      out.push(Math.round(a.positionX * 10), Math.round(a.positionY * 10), e?.couleur ?? 0xffffff);
    }
    return out;
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
