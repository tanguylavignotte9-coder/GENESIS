/** Electron main process: opens the game window and serves presets and the benchmark to it. */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { runBenchmark } from './benchmark-runner';
import type { Channel } from './channels';
import { PresetStore } from './presets';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;

let window: BrowserWindow | null = null;

function createWindow(): void {
  window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'GENESIS',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  void window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  window.on('closed', () => (window = null));
}

function handle(channel: Channel, listener: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => listener(...args));
}

function registerHandlers(): void {
  // The game runs from its folder (npm start): presets/ and rapports/ sit next to package.json.
  const appDir = app.getAppPath();
  const presets = new PresetStore(path.join(appDir, 'presets'));
  handle('presets:list', () => presets.list());
  handle('presets:read', (file) => presets.read(String(file)));
  handle('presets:save', (preset) => presets.save(preset));
  handle('presets:delete', (file) => presets.remove(String(file)));
  handle('presets:getActive', () => presets.active());
  handle('presets:setActive', (file) => presets.setActive(typeof file === 'string' ? file : null));
  const line: Channel = 'benchmark:line';
  handle('benchmark:run', (render) => runBenchmark(appDir, render ?? null, (text) => window?.webContents.send(line, text)));
  // Launched by Benchmark-GENESIS.bat ("electron . --benchmark"): the display runs the whole benchmark.
  handle('benchmark:auto', () => process.argv.includes('--benchmark'));
  handle('app:quit', () => app.quit());
}

void app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
