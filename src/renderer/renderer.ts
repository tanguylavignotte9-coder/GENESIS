import { Carte } from './carte';
import type { ConfigComplete } from '../sim/config/schema';
import { vitessesDisponibles } from '../sim/temps/boucleTemps';
import type { Evenement } from '../sim/journal/journal';

interface BridgeGenesis {
  obtenirConfig: () => Promise<{ ok: boolean; config?: ConfigComplete; empreintes?: Record<string, string>; erreurs?: string[] }>;
  ecrireSauvegarde: (slot: string, contenu: string) => Promise<unknown>;
  lireSauvegarde: (slot: string) => Promise<string | null>;
  listerSauvegardes: () => Promise<Array<{ slot: string; modifieLe: string; taille: number }>>;
}

declare global {
  interface Window {
    genesis: BridgeGenesis;
  }
}

const $ = (id: string) => document.getElementById(id)!;

async function demarrer(): Promise<void> {
  const reponse = await window.genesis.obtenirConfig();
  if (!reponse.ok || !reponse.config || !reponse.empreintes) {
    const ecran = $('ecranErreur');
    ecran.style.display = 'block';
    $('erreursConfig').textContent = (reponse.erreurs ?? ['Erreur inconnue']).join('\n');
    return;
  }
  const config = reponse.config;
  const empreintes = reponse.empreintes;

  const inputSeed = $('inputSeed') as HTMLInputElement;
  const inputBandes = $('inputBandes') as HTMLInputElement;
  const inputTaille = $('inputTailleBande') as HTMLInputElement;
  inputBandes.min = String(config.societe.bandesInitialesMin);
  inputBandes.max = String(config.societe.bandesInitialesMax);
  inputBandes.value = String(config.societe.bandesInitialesMin);
  inputTaille.min = String(config.societe.tailleBandeInitialeMin);
  inputTaille.max = String(config.societe.tailleBandeInitialeMax);
  inputTaille.value = String(Math.round((config.societe.tailleBandeInitialeMin + config.societe.tailleBandeInitialeMax) / 2));

  let carte: Carte | null = null;
  let worker: Worker | null = null;
  let derniersIndividus: number[] = [];
  let derniersTerritoires: Array<{ id: number; couleur: number; tuiles: number[] }> = [];
  let seed = Number(inputSeed.value) || 42;

  const vitesses = vitessesDisponibles(config.temps);

  function connecter(): Worker {
    const w = new Worker('simWorker.js');
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg.type === 'pret') {
        $('ecranDemarrage').style.display = 'none';
        $('barre').style.display = 'flex';
        $('journal').style.display = 'flex';
      } else if (msg.type === 'digest') {
        if (carte) {
          carte.appliquerDigest(new Uint32Array(msg.couleurs as ArrayBuffer));
          carte.appliquerAnimaux((msg.animaux as number[]) ?? []);
          derniersIndividus = (msg.individus as number[]) ?? [];
          carte.appliquerIndividus(derniersIndividus);
          derniersTerritoires = (msg.territoires as Array<{ id: number; couleur: number; tuiles: number[] }>) ?? [];
          carte.appliquerTerritoires(derniersTerritoires);
        }
        const stats = msg.stats as { individus: number; animaux: number; evenements: number } | undefined;
        $('date').textContent = `An ${msg.an}, mois ${msg.mois} — ×${msg.vitesse} — ${stats ? `${stats.individus} humains · ${stats.animaux} animaux · ${stats.evenements} événements` : ''}`;
      } else if (msg.type === 'journal') {
        ajouterEvenements(msg.evenements as Evenement[]);
      } else if (msg.type === 'sauvegarde') {
        void window.genesis.ecrireSauvegarde('auto', msg.contenu as string).then(() => {
          $('date').textContent += ' — 💾 sauvegardé';
        });
      } else if (msg.type === 'charge') {
        const av = msg.avertissements as string[];
        if (av.length > 0) alert(av.join('\n'));
      } else if (msg.type === 'fiche') {
        afficherFiche(msg);
      } else if (msg.type === 'ficheGroupe') {
        afficherFicheGroupe(msg);
      } else if (msg.type === 'erreur') {
        console.error(msg.message);
      }
    };
    return w;
  }

  function ajouterEvenements(evenements: Evenement[]): void {
    const liste = $('listeJournal');
    for (const ev of evenements) {
      const div = document.createElement('div');
      div.className = 'evenement';
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = `An ${ev.date.an}, M${ev.date.mois}`;
      const type = document.createElement('span');
      type.className = 'type';
      type.textContent = ev.type;
      const texte = document.createElement('span');
      texte.textContent = `${ev.sujet} — ${ev.description}`;
      div.appendChild(date);
      div.appendChild(type);
      div.appendChild(texte);
      liste.appendChild(div);
    }
    while (liste.children.length > 200) liste.removeChild(liste.firstChild!);
    liste.scrollTop = liste.scrollHeight;
  }

  function optionsDepart() {
    return {
      nbBandes: Number(inputBandes.value) || config.societe.bandesInitialesMin,
      tailleBande: Number(inputTaille.value) || config.societe.tailleBandeInitialeMin,
    };
  }

  function ligne(cle: string, valeur: unknown): string {
    return `<div class="ligne"><span class="cle">${cle}</span><span>${valeur}</span></div>`;
  }

  function afficherFiche(msg: Record<string, unknown>): void {
    const fiche = msg.fiche as Record<string, unknown> | undefined;
    const panneau = $('fiche');
    if (!fiche || msg.trouve === false) {
      panneau.style.display = 'none';
      return;
    }
    panneau.style.display = 'flex';
    $('ficheTitre').textContent = String(fiche.nom);
    const besoins = fiche.besoins as Record<string, number>;
    const comp = fiche.competences as Record<string, number>;
    const sante = fiche.sante as { valeur: number; blessures: unknown[]; maladies: unknown[] };
    const relations = (fiche.relationsNoms as Array<{ nom: string; type: string; intensite: number }>) ?? [];
    const html = [
      ligne('Sexe', fiche.sexe === 0 ? 'Homme' : 'Femme'),
      ligne('Âge', `${Number(fiche.ageAnnees).toFixed(1)} ans`),
      ligne('Groupe', fiche.groupeNom ? `${fiche.groupeNom}${fiche.dirigeant ? ' (dirigeant)' : ''}` : '—'),
      ligne('État', fiche.vivant ? 'Vivant' : `Mort (${fiche.causeMort})`),
      ligne('Santé', `${sante.valeur.toFixed(0)}/100`),
      ligne('Faim / Soif / Sommeil', `${besoins.faim.toFixed(0)} / ${besoins.soif.toFixed(0)} / ${besoins.sommeil.toFixed(0)}`),
      ligne('Stress / Sécurité / Social', `${besoins.stress.toFixed(0)} / ${besoins.securite.toFixed(0)} / ${besoins.social.toFixed(0)}`),
      ligne('Bonheur', `${Number(fiche.bonheur).toFixed(0)}/100`),
      ligne('Force / Endurance / Vitesse', `${Number(fiche.force).toFixed(0)} / ${Number(fiche.endurance).toFixed(0)} / ${Number(fiche.vitesse).toFixed(0)}`),
      ligne('Intelligence / Charisme', `${Number(fiche.intelligence).toFixed(0)} / ${Number(fiche.charisme).toFixed(0)}`),
      ligne('Compétences', Object.entries(comp).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ') || '—'),
      ligne('Père (registre)', fiche.pereRegistreNom ?? '—'),
      ligne('Père (biologique)', fiche.pereBiologiqueNom ?? '—'),
      ligne('Mère', fiche.mereNom ?? '—'),
      ligne('Enfants', Array.isArray(fiche.enfants) ? fiche.enfants.length : 0),
      ligne('Relations', relations.map((r) => `${r.nom} (${r.type} ${r.intensite})`).join(', ') || '—'),
      ligne('Connaissances', Array.isArray(fiche.connaissances) ? fiche.connaissances.length : 0),
    ].join('');
    $('ficheContenu').innerHTML = html;
  }

  function afficherFicheGroupe(msg: Record<string, unknown>): void {
    const fiche = msg.fiche as Record<string, unknown> | undefined;
    const panneau = $('fiche');
    if (!fiche || msg.trouve === false) {
      panneau.style.display = 'none';
      return;
    }
    panneau.style.display = 'flex';
    const niveaux = ['Bande', 'Tribu', 'Village', 'Ville', 'Nation'];
    $('ficheTitre').textContent = String(fiche.nom);
    const bats = (fiche.batiments as Array<{ type: string; x: number; y: number; durabilite: number; enConstruction: boolean }>) ?? [];
    const html = [
      ligne('Niveau', niveaux[Number(fiche.niveau)] ?? fiche.niveau),
      ligne('Dirigeant', fiche.dirigeantNom ?? '—'),
      ligne('Membres vivants', `${fiche.membresVivants} / ${fiche.membresTotal}`),
      ligne('Bonheur moyen', `${fiche.bonheurMoyen}/100`),
      ligne('Territoire', `${fiche.territoireTaille} tuiles d'activité`),
      ligne('Stocks communs', Object.entries(fiche.stocksCommuns as Record<string, number>).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ') || '—'),
      ligne('Bâtiments', bats.map((b) => `${b.type}${b.enConstruction ? ' (chantier)' : ''} @(${b.x},${b.y}) ${b.durabilite}%`).join(', ') || '—'),
      ligne('Politiques', Object.keys(fiche.politiques as Record<string, unknown>).join(', ') || '—'),
    ].join('');
    $('ficheContenu').innerHTML = html;
  }

  function lancerMonde(graine: number): void {
    seed = graine;
    if (worker) worker.terminate();
    worker = connecter();
    worker.postMessage({ type: 'init', seed: graine, options: optionsDepart(), config, empreintes });
  }

  $('btnLancer').addEventListener('click', () => {
    lancerMonde(Number(inputSeed.value) || 42);
  });

  $('btnPause').addEventListener('click', () => worker?.postMessage({ type: 'commande', commande: 'pause' }));
  for (const v of vitesses) {
    const btn = $(`btnX${v}`);
    if (!btn) continue;
    btn.addEventListener('click', () => {
      worker?.postMessage({ type: 'commande', commande: 'vitesse', valeur: v });
      for (const b of vitesses) $(`btnX${b}`)?.classList.remove('actif');
      btn.classList.add('actif');
    });
  }
  $('btnSauvegarder').addEventListener('click', () => worker?.postMessage({ type: 'sauvegarder' }));
  $('btnCharger').addEventListener('click', async () => {
    const contenu = await window.genesis.lireSauvegarde('auto');
    if (contenu) worker?.postMessage({ type: 'charger', contenu });
    else alert('Aucune sauvegarde disponible.');
  });

  $('ficheFermer').addEventListener('click', () => {
    $('fiche').style.display = 'none';
  });

  $('filtreJournal').addEventListener('change', (e) => {
    const valeur = (e.target as HTMLSelectElement).value;
    $('listeJournal').innerHTML = '';
    worker?.postMessage({ type: 'filtrerJournal', filtre: valeur ? { types: [valeur] } : {} });
  });

  const hote = $('app');
  const configPremierePasse = config;
  const tailleMonde = configPremierePasse.monde.tailleGrille;
  carte = await Carte.creer(hote, tailleMonde);

  let glisser = false;
  let dernierX = 0;
  let dernierY = 0;
  const canvas = carte.app.canvas as HTMLCanvasElement;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    carte!.zoomAutour(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    glisser = true;
    dernierX = e.clientX;
    dernierY = e.clientY;
  });
  canvas.addEventListener('click', (e) => {
    if (!carte || derniersIndividus.length === 0) return;
    const p = carte.ecranVersMonde(e.clientX, e.clientY);
    let bestId = -1;
    let bestDist = 3;
    for (let i = 0; i + 2 < derniersIndividus.length; i += 3) {
      const x = derniersIndividus[i + 1] / 10;
      const y = derniersIndividus[i + 2] / 10;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestId = derniersIndividus[i];
      }
    }
    if (bestId >= 0) {
      worker?.postMessage({ type: 'inspecterIndividu', id: bestId });
    } else {
      const p2 = p;
      for (const t of derniersTerritoires) {
        for (let i = 0; i + 1 < t.tuiles.length; i += 2) {
          if (Math.abs(t.tuiles[i] - p2.x) <= 1 && Math.abs(t.tuiles[i + 1] - p2.y) <= 1) {
            worker?.postMessage({ type: 'inspecterGroupe', id: t.id });
            return;
          }
        }
      }
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!glisser || !carte) return;
    carte.deplacer(e.clientX - dernierX, e.clientY - dernierY);
    dernierX = e.clientX;
    dernierY = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    glisser = false;
  });
}

demarrer().catch((e) => {
  const ecran = $('ecranErreur');
  ecran.style.display = 'block';
  $('erreursConfig').textContent = String(e);
});
