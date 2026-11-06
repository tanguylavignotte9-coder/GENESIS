import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

import { lireDossierConfig } from '../sim/config/lireDisque';
import { parserConfig, ErreurConfig } from '../sim/config/parse';

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
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
  protocol.handle('app', (requete) => {
    const url = new URL(requete.url);
    let cheminRel = decodeURIComponent(url.pathname);
    if (cheminRel === '/' || cheminRel === '/index.html') cheminRel = '/index.html';
    const fichier = path.join(DOSSIER_RENDERER, cheminRel);
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
      return { ok: true as const, config, empreintes };
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
  fenetre.loadURL('app://index.html');
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
