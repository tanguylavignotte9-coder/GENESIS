import 'pixi.js/unsafe-eval';
import { CartePixel } from './cartePixel';
import type { ConfigComplete } from '../sim/config/schema';
import type { ConfigRendu } from '../sim/config/rendu';
import { vitessesDisponibles } from '../sim/temps/boucleTemps';
import type { Evenement } from '../sim/journal/journal';

interface BridgeGenesis {
  obtenirConfig: () => Promise<{ ok: boolean; config?: ConfigComplete; empreintes?: Record<string, string>; rendu?: ConfigRendu; erreurs?: string[] }>;
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
  const rendu = reponse.rendu!;

  const inputSeed = $('inputSeed') as HTMLInputElement;
  const inputBandes = $('inputBandes') as HTMLInputElement;
  const inputTaille = $('inputTailleBande') as HTMLInputElement;
  inputBandes.min = String(config.societe.bandesInitialesMin);
  inputBandes.max = String(config.societe.bandesInitialesMax);
  inputBandes.value = String(config.societe.bandesInitialesMin);
  inputTaille.min = String(config.societe.tailleBandeInitialeMin);
  inputTaille.max = String(config.societe.tailleBandeInitialeMax);
  inputTaille.value = String(Math.round((config.societe.tailleBandeInitialeMin + config.societe.tailleBandeInitialeMax) / 2));

  let carte: CartePixel | null = null;
  let worker: Worker | null = null;
  let derniersIndividus: number[] = [];
  let derniersTerritoires: Array<{ id: number; couleur: number; tuiles: number[] }> = [];
  let favoris = new Set<number>();
  let ficheCouranteId = -1;
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
          carte.appliquerDigest(msg);
          derniersIndividus = (msg.individus as number[]) ?? [];
          derniersTerritoires = (msg.territoires as Array<{ id: number; couleur: number; tuiles: number[] }>) ?? [];
        }
        const stats = msg.stats as { individus: number; animaux: number; evenements: number } | undefined;
        $('date').textContent = `An ${msg.an}, mois ${msg.mois} — ×${msg.vitesse} — ${stats ? `${stats.individus} humains · ${stats.animaux} animaux · ${stats.evenements} événements` : ''}`;
      } else if (msg.type === 'journal') {
        ajouterEvenements(msg.evenements as Evenement[]);
      } else if (msg.type === 'sauvegarde') {
        const slot = (msg.slot as string) ?? 'auto';
        void window.genesis.ecrireSauvegarde(slot, msg.contenu as string).then(() => {
          if (slot !== 'auto') $('date').textContent += ` — 💾 slot ${slot} sauvegardé`;
        });
      } else if (msg.type === 'extinction') {
        afficherFin(msg.chronique as Record<string, unknown>);
      } else if (msg.type === 'charge') {
        const av = msg.avertissements as string[];
        if (av.length > 0) alert(av.join('\n'));
      } else if (msg.type === 'fiche') {
        afficherFiche(msg);
      } else if (msg.type === 'ficheGroupe') {
        afficherFicheGroupe(msg);
      } else if (msg.type === 'saga') {
        const s = msg.saga as { sujet: string; description: string; date: { an: number; mois: number } };
        const banniere = $('saga');
        banniere.style.display = 'block';
        banniere.innerHTML = `<span class="titre">✦ Saga du moment (an ${s.date.an}, mois ${s.date.mois})</span>${s.sujet} — ${s.description}`;
      } else if (msg.type === 'chronique') {
        afficherChronique(msg);
      } else if (msg.type === 'ecranEconomie') {
        afficherEcran('📊 Économie', afficherDonneesEconomie(msg.donnees as Record<string, unknown>));
      } else if (msg.type === 'ecranReligions') {
        afficherEcran('⛪ Religions', (msg.donnees as Array<Record<string, unknown>>).map((r) =>
          ligne(r.nom as string, `${r.croyants} croyants — prophète ${r.propheteNom} — dieux: ${(r.dieux as string[]).join(', ')} — tabous: ${(r.tabous as string[]).join(', ')}${r.parentNom ? ` — schisme de ${r.parentNom}` : ''}`)).join('') || '<div>Aucune religion.</div>');
      } else if (msg.type === 'ecranLangues') {
        afficherEcran('🗣 Langues', (msg.donnees as Array<Record<string, unknown>>).map((l) =>
          ligne(l.nom as string, `${l.individus} locuteurs, ${l.groupes} groupe(s), divergence ${l.divergence}${l.parentNom ? ` — née de ${l.parentNom}` : ''}`)).join('') || '<div>Une seule langue.</div>');
      } else if (msg.type === 'genealogie') {
        afficherEcran('🌳 Arborescence', arbreHtml(msg.arbre));
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
      div.className = 'evenement' + (ev.individusImpliques.some((id) => favoris.has(id)) ? ' favori' : '');
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
    ficheCouranteId = Number(msg.id);
    carte?.definirSelection(ficheCouranteId);
    $('ficheTitre').textContent = String(fiche.nom);
    $('btnFavori').textContent = favoris.has(ficheCouranteId) ? '⭐ Retirer des favoris' : '⭐ Favori';
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
      ligne('Ère', fiche.ere ?? '—'),
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
  document.querySelectorAll<HTMLButtonElement>('.btnSlot').forEach((b) => {
    b.addEventListener('click', () => worker?.postMessage({ type: 'sauvegarder', slot: b.dataset.slot }));
  });
  $('btnCharger').addEventListener('click', async () => {
    const slot = ($('slotCharger') as HTMLSelectElement).value;
    const contenu = await window.genesis.lireSauvegarde(slot);
    if (contenu) worker?.postMessage({ type: 'charger', contenu });
    else alert('Aucune sauvegarde dans ce slot.');
  });

  $('btnNouveauMonde').addEventListener('click', () => window.location.reload());

  function afficherFin(c: Record<string, unknown>): void {
    const fin = $('fin');
    fin.style.display = 'block';
    const figures = (c.figures as Array<{ nom: string; evenements: number; mort: string | null }>) ?? [];
    const derniers = (c.derniersEvenements as Evenement[]) ?? [];
    $('finContenu').innerHTML = [
      '<div class="ligne"><span class="cle">Durée de l\'espèce</span><span>an ' + c.anFin + ', mois ' + c.moisFin + '</span></div>',
      '<div class="ligne"><span class="cle">Naissances</span><span>' + c.naissances + '</span></div>',
      '<div class="ligne"><span class="cle">Morts</span><span>' + c.morts + '</span></div>',
      '<div class="ligne"><span class="cle">Groupes fondés</span><span>' + c.groupesFondes + '</span></div>',
      '<div class="ligne"><span class="cle">Découvertes</span><span>' + c.decouvertes + '</span></div>',
      '<div class="ligne"><span class="cle">Religions</span><span>' + c.religions + '</span></div>',
      '<div class="ligne"><span class="cle">Langues</span><span>' + c.langues + '</span></div>',
      '<h3>Figures marquantes</h3>',
      ...figures.map((f) => `<div class="ligne"><span class="cle">${f.nom}</span><span>${f.evenements} événements${f.mort ? ` — mort de ${f.mort}` : ''}</span></div>`),
      '<h3>Derniers événements</h3>',
      ...derniers.slice(-12).map((e) => `<div class="ligne"><span class="cle">An ${e.date.an}, M${e.date.mois} — ${e.type}</span><span>${e.sujet}</span></div>`),
    ].join('');
  }

  setInterval(() => {
    if (!carte || !worker) return;
    const z = carte.tuilesVisibles();
    worker.postMessage({ type: 'zoneActive', zone: z });
  }, 500);

  $('ficheFermer').addEventListener('click', () => {
    $('fiche').style.display = 'none';
    carte?.definirSelection(null);
  });

  $('filtreJournal').addEventListener('change', (e) => {
    const valeur = (e.target as HTMLSelectElement).value;
    $('listeJournal').innerHTML = '';
    worker?.postMessage({ type: 'filtrerJournal', filtre: valeur ? { types: [valeur] } : {} });
  });

  $('btnFavori').addEventListener('click', () => {
    if (ficheCouranteId < 0) return;
    if (favoris.has(ficheCouranteId)) favoris.delete(ficheCouranteId);
    else favoris.add(ficheCouranteId);
    $('btnFavori').textContent = favoris.has(ficheCouranteId) ? '⭐ Retirer des favoris' : '⭐ Favori';
    carte?.definirFavoris(favoris);
  });

  $('btnChronique').addEventListener('click', () => {
    if (ficheCouranteId >= 0) worker?.postMessage({ type: 'chronique', id: ficheCouranteId });
  });

  $('btnEco').addEventListener('click', () => worker?.postMessage({ type: 'ecranEconomie' }));
  $('btnReligions').addEventListener('click', () => worker?.postMessage({ type: 'ecranReligions' }));
  $('btnLangues').addEventListener('click', () => worker?.postMessage({ type: 'ecranLangues' }));
  $('btnGenealogie').addEventListener('click', () => {
    if (ficheCouranteId >= 0) worker?.postMessage({ type: 'genealogie', id: ficheCouranteId });
  });

  function afficherEcran(titre: string, html: string): void {
    $('fiche').style.display = 'flex';
    $('ficheTitre').textContent = titre;
    ficheCouranteId = -1;
    $('btnFavori').textContent = '⭐ Favori';
    $('ficheContenu').innerHTML = html;
  }

  function afficherDonneesEconomie(d: Record<string, unknown>): string {
    const parType = Object.entries(d.objetsParType as Record<string, number>).map(([k, v]) => `${k} ×${v}`).join(', ');
    const stocks = (d.stocks as Array<{ nom: string; stocks: Record<string, number> }>).map((g) => {
      const s = Object.entries(g.stocks).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
      return `<div style="margin:4px 0;"><b>${g.nom}</b><br/><span style="color:#9fb0d0;">${s || '—'}</span></div>`;
    }).join('');
    return [
      ligne('Objets fabriqués', `${d.nbObjets} (${parType || '—'})`),
      ligne('Monnaie totale (pièces)', `${Math.round((d.monnaieTotale as number) * 10) / 10}`),
      '<h3 style="margin:8px 0 4px 0;font-size:12px;color:#9fb0d0;">Stocks par groupe</h3>',
      stocks || '<div>—</div>',
    ].join('');
  }

  function arbreHtml(noeud: unknown, profondeur = 0): string {
    if (!noeud) return '';
    const n = noeud as { id: number; nom: string; age: number; sexe: string; vivant: boolean; causeMort: string | null; pere: unknown; mere: unknown; enfants: unknown[] };
    const indent = '&nbsp;'.repeat(profondeur * 4);
    const etat = n.vivant ? `${n.age} ans` : `mort (${n.causeMort})`;
    let html = `<div style="margin:2px 0;">${indent}${n.sexe} <b>${n.nom}</b> <span style="color:#9fb0d0;">${etat}</span></div>`;
    html += arbreHtml(n.pere, profondeur + 1);
    html += arbreHtml(n.mere, profondeur + 1);
    for (const e of n.enfants) html += arbreHtml(e, profondeur + 1);
    return html;
  }

  function afficherChronique(msg: Record<string, unknown>): void {
    const evenements = (msg.evenements as Evenement[]) ?? [];
    $('ficheContenu').innerHTML = evenements.length === 0
      ? '<div>Aucun événement connu.</div>'
      : evenements
          .slice(-30)
          .map((e) => `<div class="ligne"><span class="cle">An ${e.date.an}, M${e.date.mois} — ${e.type}</span><span>${e.sujet}</span></div>`)
          .join('');
  }

  const hote = $('app');
  carte = await CartePixel.creer(hote, config, rendu);

  let glisser = false;
  let dernierX = 0;
  let dernierY = 0;
  const canvas = carte.app.canvas as HTMLCanvasElement;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    carte!.zoomPalier(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1);
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
    for (let i = 0; i + 5 < derniersIndividus.length; i += 6) {
      const x = derniersIndividus[i + 1] / 10;
      const y = derniersIndividus[i + 2] / 10;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestId = derniersIndividus[i];
      }
    }
    if (bestId >= 0) {
      carte.definirSelection(bestId);
      worker?.postMessage({ type: 'inspecterIndividu', id: bestId });
    } else {
      carte.definirSelection(null);
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
    if (!carte) return;
    carte.definirSurvol(e.clientX, e.clientY);
    if (!glisser) return;
    carte.deplacer(e.clientX - dernierX, e.clientY - dernierY);
    dernierX = e.clientX;
    dernierY = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    glisser = false;
  });
  carte.canvasMinicarte.addEventListener('click', (e) => {
    const p = carte!.minicarteVersMonde(e.clientX, e.clientY);
    carte!.centrerSurTuile(p.x, p.y);
  });
}

demarrer().catch((e) => {
  const ecran = $('ecranErreur');
  ecran.style.display = 'block';
  $('erreursConfig').textContent = String(e);
});
