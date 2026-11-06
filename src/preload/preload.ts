import { contextBridge, ipcRenderer } from 'electron';

export interface ReponseConfig {
  ok: boolean;
  config?: unknown;
  empreintes?: Record<string, string>;
  erreurs?: string[];
}

contextBridge.exposeInMainWorld('genesis', {
  obtenirConfig: (): Promise<ReponseConfig> => ipcRenderer.invoke('config:obtenir'),
  ecrireSauvegarde: (slot: string, contenu: string) => ipcRenderer.invoke('sauvegarde:ecrire', slot, contenu),
  lireSauvegarde: (slot: string): Promise<string | null> => ipcRenderer.invoke('sauvegarde:lire', slot),
  listerSauvegardes: (): Promise<Array<{ slot: string; modifieLe: string; taille: number }>> =>
    ipcRenderer.invoke('sauvegarde:lister'),
});
