import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdaterController {
  /** True once a newer signed release is available on GitHub. */
  isUpdateAvailable: boolean;
  /** Download and install the pending update, then relaunch the app. */
  install: () => Promise<void>;
}

/**
 * Checks GitHub Releases for a newer signed build once on startup. No-ops
 * outside Tauri (browser dev, preview gallery) and never throws into the UI —
 * a failed check just leaves `isUpdateAvailable` false.
 */
export function useUpdater(): UpdaterController {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let isCancelled = false;
    void (async () => {
      try {
        const update = await check();
        if (isCancelled || !update) return;
        updateRef.current = update;
        setIsUpdateAvailable(true);
      } catch (err) {
        console.error('Update check failed', err);
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    try {
      await update.downloadAndInstall();
      // On Windows the app exits during install; elsewhere we relaunch.
      await relaunch();
    } catch (err) {
      console.error('Update install failed', err);
    }
  }, []);

  return { isUpdateAvailable, install };
}
