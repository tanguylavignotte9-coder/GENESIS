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

  let carte: Carte | null = null;
  let worker: Worker | null = null;
  let seed = Number(($('inputSeed') as HTMLInputElement).value) || 42;

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
        if (carte) carte.appliquerDigest(new Uint32Array(msg.couleurs as ArrayBuffer));
        const stats = msg.stats as { individus: number; evenements: number } | undefined;
        $('date').textContent = `An ${msg.an}, mois ${msg.mois} — ×${msg.vitesse} — ${stats ? `${stats.individus} individus · ${stats.evenements} événements` : ''}`;
      } else if (msg.type === 'journal') {
        ajouterEvenements(msg.evenements as Evenement[]);
      } else if (msg.type === 'sauvegarde') {
        void window.genesis.ecrireSauvegarde('auto', msg.contenu as string).then(() => {
          $('date').textContent += ' — 💾 sauvegardé';
        });
      } else if (msg.type === 'charge') {
        const av = msg.avertissements as string[];
        if (av.length > 0) alert(av.join('\n'));
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

  function lancerMonde(graine: number): void {
    seed = graine;
    if (worker) worker.terminate();
    worker = connecter();
    worker.postMessage({ type: 'init', seed: graine, config, empreintes });
  }

  $('btnLancer').addEventListener('click', () => {
    lancerMonde(Number(($('inputSeed') as HTMLInputElement).value) || 42);
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
