import { pushSyncData, pullSyncData } from "./api";
import type { BookmarkItem } from "./types";

const LOCAL_STORAGE_BOOKMARKS = "tafsil_offline_bookmarks";
const LOCAL_STORAGE_HISTORY = "tafsil_offline_history";
const LOCAL_STORAGE_LAST_SYNC = "tafsil_last_synced_at";

export class OfflineSyncManager {
  private static isSyncing = false;

  static getOfflineBookmarks(): BookmarkItem[] {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static addBookmark(sureId: number, ayetNo: number, etiket: string = "Genel", notlar?: string): BookmarkItem {
    const list = this.getOfflineBookmarks();
    const existingIndex = list.findIndex(b => b.sure_id === sureId && b.ayet_no === ayetNo);
    const item: BookmarkItem = {
      sure_id: sureId,
      ayet_no: ayetNo,
      etiket,
      notlar,
      updated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.push(item);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_BOOKMARKS, JSON.stringify(list));
      this.syncToServer();
    }
    return item;
  }

  static removeBookmark(sureId: number, ayetNo: number) {
    let list = this.getOfflineBookmarks();
    list = list.filter(b => !(b.sure_id === sureId && b.ayet_no === ayetNo));
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_BOOKMARKS, JSON.stringify(list));
    }
  }

  static isBookmarked(sureId: number, ayetNo: number): boolean {
    const list = this.getOfflineBookmarks();
    return list.some(b => b.sure_id === sureId && b.ayet_no === ayetNo);
  }

  static recordReadingProgress(sureId: number, ayetNo: number, durationSeconds: number = 30) {
    if (typeof window === "undefined") return;
    try {
      const existing = localStorage.getItem(LOCAL_STORAGE_HISTORY);
      const history: any[] = existing ? JSON.parse(existing) : [];
      const now = new Date();

      const lastItem = history.length > 0 ? history[history.length - 1] : null;
      const isDuplicateRecent = Boolean(
        lastItem &&
        lastItem.sure_id === sureId &&
        lastItem.ayet_no === ayetNo &&
        lastItem.okundu_tarihi &&
        now.getTime() - new Date(lastItem.okundu_tarihi).getTime() < 30000
      );

      if (isDuplicateRecent && lastItem) {
        lastItem.okunma_suresi_sn = Math.max(lastItem.okunma_suresi_sn || 0, durationSeconds);
      } else {
        const id = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

        history.push({
          id,
          sure_id: sureId,
          ayet_no: ayetNo,
          okunma_suresi_sn: durationSeconds,
          okundu_tarihi: now.toISOString()
        });
      }

      // Keep last 50
      localStorage.setItem(LOCAL_STORAGE_HISTORY, JSON.stringify(history.slice(-50)));
      this.syncToServer();
    } catch {
      // ignore
    }
  }

  static async syncToServer(): Promise<boolean> {
    if (this.isSyncing || typeof window === "undefined" || !navigator.onLine) {
      return false;
    }

    this.isSyncing = true;
    try {
      const bookmarks = this.getOfflineBookmarks();
      const historyRaw = localStorage.getItem(LOCAL_STORAGE_HISTORY);
      const history = historyRaw ? JSON.parse(historyRaw) : [];

      if (bookmarks.length > 0 || history.length > 0) {
        await pushSyncData({
          bookmarks,
          reading_history: history
        });
      }

      const lastSync = localStorage.getItem(LOCAL_STORAGE_LAST_SYNC);
      const pulled = await pullSyncData(lastSync || undefined);
      if (pulled?.data?.bookmarks) {
        // Merge pulled bookmarks
        const local = this.getOfflineBookmarks();
        const map = new Map<string, BookmarkItem>();
        local.forEach(b => map.set(`${b.sure_id}:${b.ayet_no}`, b));
        pulled.data.bookmarks.forEach((b: BookmarkItem) => map.set(`${b.sure_id}:${b.ayet_no}`, b));
        localStorage.setItem(LOCAL_STORAGE_BOOKMARKS, JSON.stringify(Array.from(map.values())));
      }

      localStorage.setItem(LOCAL_STORAGE_LAST_SYNC, new Date().toISOString());
      return true;
    } catch {
      return false;
    } finally {
      this.isSyncing = false;
    }
  }
}

// Auto sync when browser goes online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    OfflineSyncManager.syncToServer();
  });
}
