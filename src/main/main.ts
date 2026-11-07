import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { lireDossierConfig } from '../sim/config/lireDisque';
import { parserConfig, ErreurConfig } from '../sim/config/parse';
import { parserConfigRendu, NOM_FICHIER_RENDU, type ConfigRendu } from '../sim/config/rendu';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } },
]);

function journaliserErreur(source: string, err: unknown): void {
  const ligne = `[${new Date().toISOString()}] ${source}: ${(err as Error)?.stack ?? String(err)}\n`;
  console.error(ligne);
  try {
    const dossier = app && app.isReady() ? app.getPath('userData') : os.tmpdir();
    fs.mkdirSync(dossier, { recursive: true });
    fs.appendFileSync(path.join(dossier, 'genesis-erreur.log'), ligne);
  } catch {
    /* ignore */
  }
}

process.on('uncaughtException', (err) => journaliserErreur('uncaughtException', err));
process.on('unhandledRejection', (err) => journaliserErreur('unhandledRejection', err));

const DOSSIER_RENDERER = path.resolve(__dirname, '../renderer');

function dossierConfig(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'config');
  }
  return path.join(app.getAppPath(), 'config');
}

function dossierSauvegardes(): string {
  const d = path.join(app.getPath('userData'), 'sauvegardes');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const TYPES_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function enregistrerProtocole(): void {
  protocol.handle('app', (requete) => {
    const url = new URL(requete.url);
    let cheminRel = decodeURIComponent(url.pathname);
    if (cheminRel === '/' || cheminRel === '/index.html') cheminRel = '/index.html';
    const fichier = path.normalize(path.join(DOSSIER_RENDERER, cheminRel));
    if (!fichier.startsWith(DOSSIER_RENDERER)) {
      return new Response('Interdit', { status: 403 });
    }
    try {
      const contenu = fs.readFileSync(fichier);
      const ext = path.extname(fichier).toLowerCase();
      return new Response(contenu, { headers: { 'Content-Type': TYPES_MIME[ext] ?? 'application/octet-stream' } });
    } catch {
      return new Response('Introuvable', { status: 404 });
    }
  });
}

function enregistrerIpc(): void {
  ipcMain.handle('config:obtenir', () => {
    try {
      const textes = lireDossierConfig(dossierConfig());
      const { config, empreintes } = parserConfig(textes);
      // rendu.jsonc est validé comme les autres mais reste HORS empreintes :
      // empreintes ne contient que les 8 fichiers de domaine de NOMS_FICHIERS_CONFIG.
      const rendu: ConfigRendu = parserConfigRendu(textes[NOM_FICHIER_RENDU]);
      return { ok: true as const, config, empreintes, rendu };
    } catch (e) {
      if (e instanceof ErreurConfig) {
        return { ok: false as const, erreurs: e.erreurs };
      }
      return { ok: false as const, erreurs: [(e as Error).message] };
    }
  });

  ipcMain.handle('sauvegarde:ecrire', (_e, slot: string, contenu: string) => {
    const nom = slot.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dossierSauvegardes(), `${nom}.genesis.json`), contenu, 'utf8');
    return { ok: true };
  });

  ipcMain.handle('sauvegarde:lire', (_e, slot: string) => {
    const nom = slot.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fichier = path.join(dossierSauvegardes(), `${nom}.genesis.json`);
    if (!fs.existsSync(fichier)) return null;
    return fs.readFileSync(fichier, 'utf8');
  });

  ipcMain.handle('sauvegarde:lister', () => {
    const d = dossierSauvegardes();
    return fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.genesis.json'))
      .map((f) => {
        const stat = fs.statSync(path.join(d, f));
        return { slot: f.replace(/\.genesis\.json$/, ''), modifieLe: stat.mtime.toISOString(), taille: stat.size };
      });
  });
}

function creerFenetre(): void {
  const fenetre = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0e13',
    title: 'Genesis',
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fenetre.webContents.on('did-fail-load', (_e, code, desc, url) => {
    journaliserErreur('did-fail-load', new Error(`${code} ${desc} ${url}`));
  });
  fenetre.webContents.on('render-process-gone', (_e, details) => {
    journaliserErreur('render-process-gone', new Error(JSON.stringify(details)));
  });
  fenetre.loadURL('app://index.html').catch((err) => {
    journaliserErreur('loadURL', err);
    fenetre.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<html><body style="background:#14100a;color:#f0d9a8;font-family:sans-serif;padding:40px"><h1>Genesis n'a pas pu charger</h1><p>${String(err)}</p><p>Journal : genesis-erreur.log dans le dossier des données.</p></body></html>`,
        ),
    );
  });
}

app.whenReady().then(() => {
  enregistrerProtocole();
  enregistrerIpc();
  creerFenetre();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
