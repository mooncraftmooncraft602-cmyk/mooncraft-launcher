// Auto-update du launcher lui-même via le plugin Tauri updater.
// Vérifie les Releases GitHub (latest.json signé), télécharge et installe la
// nouvelle version puis redémarre. Échec silencieux (fail-open) : si GitHub est
// injoignable ou aucune mise à jour, le launcher démarre normalement.

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface SelfUpdateHandlers {
  onAvailable?: (version: string, notes?: string) => void;
  onProgress?: (percent: number) => void;
  onInstalling?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * Cherche une mise à jour du launcher. Retourne true si une mise à jour a été
 * installée (le process va redémarrer juste après), false sinon.
 */
export async function checkLauncherUpdate(h: SelfUpdateHandlers = {}): Promise<boolean> {
  try {
    const update = await check();
    if (!update) return false;

    h.onAvailable?.(update.version, update.body);

    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (total > 0) h.onProgress?.(Math.min(100, Math.round((downloaded / total) * 100)));
          break;
        case "Finished":
          h.onInstalling?.();
          break;
      }
    });

    // Redémarre sur la nouvelle version.
    await relaunch();
    return true;
  } catch (err) {
    // Fail-open : on n'empêche jamais le lancement à cause de l'updater.
    h.onError?.(err);
    return false;
  }
}
