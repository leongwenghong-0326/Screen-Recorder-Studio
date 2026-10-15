/**
 * Storage Module for Screen Recorder Studio
 * Handles local IndexedDB storage for video recordings and metadata.
 */

const DB_NAME = 'ScreenRecorderDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

class StorageService {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initializes and upgrades the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  async initDB() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not supported by your browser.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message || 'Unknown error'}`));
      };

      request.onblocked = () => {
        console.warn('Database upgrade blocked. Please close other tabs of this application.');
      };
    });

    return this.initPromise;
  }

  /**
   * Saves a new recording record to IndexedDB.
   * @param {Object} recordingData
   * @returns {Promise<string>} recording ID
   */
  async saveRecording(recordingData) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const record = {
          id: recordingData.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          title: recordingData.title || `Recording ${new Date().toLocaleString()}`,
          timestamp: recordingData.timestamp || Date.now(),
          duration: recordingData.duration || 0,
          blob: recordingData.blob,
          mimeType: recordingData.mimeType || 'video/webm',
          size: recordingData.size || recordingData.blob?.size || 0,
          width: recordingData.width || 1920,
          height: recordingData.height || 1080,
          thumbnail: recordingData.thumbnail || null
        };

        const request = store.put(record);

        request.onsuccess = () => resolve(record.id);
        request.onerror = (event) => {
          if (event.target.error?.name === 'QuotaExceededError') {
            reject(new Error('Storage quota exceeded. Please delete older recordings to free up space.'));
          } else {
            reject(new Error(`Failed to save recording: ${event.target.error?.message}`));
          }
        };

        transaction.onerror = (event) => {
          reject(new Error(`Transaction error: ${event.target.error?.message}`));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves all recordings sorted newest first.
   * @returns {Promise<Array<Object>>}
   */
  async getAllRecordings() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev'); // Descending order
        const recordings = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            recordings.push(cursor.value);
            cursor.continue();
          } else {
            resolve(recordings);
          }
        };

        request.onerror = (event) => {
          reject(new Error(`Failed to fetch recordings: ${event.target.error?.message}`));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves a single recording by its ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getRecording(id) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (event) => {
          reject(new Error(`Failed to get recording: ${event.target.error?.message}`));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Deletes a recording by its ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteRecording(id) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
          reject(new Error(`Failed to delete recording: ${event.target.error?.message}`));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Renames a recording.
   * @param {string} id
   * @param {string} newTitle
   * @returns {Promise<boolean>}
   */
  async updateRecordingTitle(id, newTitle) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          const record = getReq.result;
          if (!record) {
            reject(new Error('Recording not found.'));
            return;
          }

          record.title = newTitle.trim();
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = (e) => reject(new Error(`Failed to update title: ${e.target.error?.message}`));
        };

        getReq.onerror = (e) => reject(new Error(`Failed to retrieve record: ${e.target.error?.message}`));
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Estimates current browser storage usage and quota.
   * @returns {Promise<{usageFormatted: string, quotaFormatted: string, percent: number}>}
   */
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
        const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
        const percent = estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0;
        return {
          usageFormatted: `${usageMB} MB`,
          quotaFormatted: `${quotaMB} MB`,
          percent
        };
      } catch (e) {
        console.warn('Storage estimate failed:', e);
      }
    }
    return { usageFormatted: 'Unknown', quotaFormatted: 'Unknown', percent: 0 };
  }
}

export const storage = new StorageService();
