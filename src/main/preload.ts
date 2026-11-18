/**
 * Preload script (sandboxed): exposes to the display a small, safe API (window.genesis) to read and
 * write presets and to run the benchmark. The display never gets direct access to the disk or Node.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Channel } from './channels';

const invoke = (channel: Channel, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);
const BENCHMARK_LINE: Channel = 'benchmark:line';

contextBridge.exposeInMainWorld('genesis', {
  listPresets: () => invoke('presets:list'),
  readPreset: (file: string) => invoke('presets:read', file),
  savePreset: (preset: unknown) => invoke('presets:save', preset),
  deletePreset: (file: string) => invoke('presets:delete', file),
  runBenchmark: () => invoke('benchmark:run'),
  onBenchmarkLine: (listener: (line: string) => void) => {
    ipcRenderer.on(BENCHMARK_LINE, (_event, line: string) => listener(line));
  },
});
