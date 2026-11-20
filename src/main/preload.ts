/**
 * Preload script (sandboxed): exposes to the display a small, safe API (window.genesis) to read and
 * write presets and to run the benchmark. The display never gets direct access to the disk or Node.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Channel } from './channels';

const invoke = (channel: Channel, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);
const BENCHMARK_LINE: Channel = 'benchmark:line';
const BEFORE_QUIT: Channel = 'app:beforeQuit';

contextBridge.exposeInMainWorld('genesis', {
  listPresets: () => invoke('presets:list'),
  readPreset: (file: string) => invoke('presets:read', file),
  savePreset: (preset: unknown) => invoke('presets:save', preset),
  deletePreset: (file: string) => invoke('presets:delete', file),
  activePreset: () => invoke('presets:getActive'),
  setActivePreset: (file: string | null) => invoke('presets:setActive', file),
  runBenchmark: (render: unknown) => invoke('benchmark:run', render),
  isAutoBenchmark: () => invoke('benchmark:auto'),
  quit: () => invoke('app:quit'),
  onBenchmarkLine: (listener: (line: string) => void) => {
    ipcRenderer.on(BENCHMARK_LINE, (_event, line: string) => listener(line));
  },
  listSaves: () => invoke('saves:list'),
  writeSave: (request: unknown) => invoke('saves:write', request),
  readSave: (file: string) => invoke('saves:read', file),
  deleteSave: (file: string) => invoke('saves:delete', file),
  shareSave: (file: string) => invoke('saves:share', file),
  onBeforeQuit: (listener: () => void) => {
    ipcRenderer.on(BEFORE_QUIT, () => listener());
  },
  quitReady: () => invoke('app:quitReady'),
});
