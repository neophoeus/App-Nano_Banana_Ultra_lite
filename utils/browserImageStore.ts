export const BROWSER_SAVED_IMAGE_PATH_PREFIX = '/lite/session-images/';
export const BROWSER_SAVED_IMAGE_STORAGE_KEY_PREFIX = 'nbu_browserSavedImage:';

const BROWSER_IMAGE_DB_NAME = 'nbu-lite-browser-images';
const BROWSER_IMAGE_DB_STORE = 'saved-images';
const BROWSER_IMAGE_DB_VERSION = 1;

export type BrowserSavedImageRecord = {
    dataUrl: string;
    metadata?: Record<string, unknown>;
    savedAt: number;
};

export type BrowserSavedImageRecordMap = Record<string, BrowserSavedImageRecord>;

const browserSavedImageCache = new Map<string, BrowserSavedImageRecord>();
let browserImageDbPromise: Promise<IDBDatabase | null> | null = null;

export const getBrowserSavedImageStorageKey = (savedFilename: string): string =>
    `${BROWSER_SAVED_IMAGE_STORAGE_KEY_PREFIX}${savedFilename}`;

const getBrowserStorage = (kind: 'localStorage' | 'sessionStorage'): Storage | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const storage = window[kind];
        return typeof storage === 'undefined' ? null : storage;
    } catch {
        return null;
    }
};

const normalizeBrowserSavedImageRecord = (value: unknown): BrowserSavedImageRecord | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as {
        dataUrl?: unknown;
        metadata?: unknown;
        savedAt?: unknown;
    };

    if (typeof candidate.dataUrl !== 'string' || candidate.dataUrl.length === 0) {
        return null;
    }

    return {
        dataUrl: candidate.dataUrl,
        metadata:
            candidate.metadata && typeof candidate.metadata === 'object'
                ? (candidate.metadata as Record<string, unknown>)
                : undefined,
        savedAt: typeof candidate.savedAt === 'number' ? candidate.savedAt : Date.now(),
    };
};

const readBrowserSavedImageRecordFromStorage = (
    storage: Storage | null,
    savedFilename: string,
): BrowserSavedImageRecord | null => {
    if (!storage) {
        return null;
    }

    const storageKey = getBrowserSavedImageStorageKey(savedFilename);

    try {
        const rawRecord = storage.getItem(storageKey);
        if (!rawRecord) {
            return null;
        }

        const parsedRecord = normalizeBrowserSavedImageRecord(JSON.parse(rawRecord));
        if (!parsedRecord) {
            storage.removeItem(storageKey);
            return null;
        }

        browserSavedImageCache.set(savedFilename, parsedRecord);
        return parsedRecord;
    } catch {
        try {
            storage.removeItem(storageKey);
        } catch {
            // Ignore storage cleanup failures.
        }

        return null;
    }
};

const writeBrowserSavedImageRecordToStorage = (
    storage: Storage | null,
    savedFilename: string,
    record: BrowserSavedImageRecord,
): boolean => {
    if (!storage) {
        return false;
    }

    try {
        storage.setItem(getBrowserSavedImageStorageKey(savedFilename), JSON.stringify(record));
        return true;
    } catch {
        return false;
    }
};

const cacheBrowserSavedImageRecord = (savedFilename: string, record: BrowserSavedImageRecord): void => {
    browserSavedImageCache.set(savedFilename, record);
    writeBrowserSavedImageRecordToStorage(getBrowserStorage('localStorage'), savedFilename, record);
    writeBrowserSavedImageRecordToStorage(getBrowserStorage('sessionStorage'), savedFilename, record);
};

const openBrowserImageDb = async (): Promise<IDBDatabase | null> => {
    if (browserImageDbPromise) {
        return browserImageDbPromise;
    }

    browserImageDbPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }

        try {
            const request = indexedDB.open(BROWSER_IMAGE_DB_NAME, BROWSER_IMAGE_DB_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(BROWSER_IMAGE_DB_STORE)) {
                    database.createObjectStore(BROWSER_IMAGE_DB_STORE);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return browserImageDbPromise;
};

const persistBrowserSavedImageRecordToDb = async (
    savedFilename: string,
    record: BrowserSavedImageRecord,
): Promise<void> => {
    const database = await openBrowserImageDb();
    if (!database) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        try {
            const transaction = database.transaction(BROWSER_IMAGE_DB_STORE, 'readwrite');
            const store = transaction.objectStore(BROWSER_IMAGE_DB_STORE);
            store.put(record, savedFilename);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Failed to store browser image asset.'));
            transaction.onabort = () => reject(transaction.error || new Error('Browser image asset write aborted.'));
        } catch (error) {
            reject(error);
        }
    });
};

const readBrowserSavedImageRecordFromDb = async (savedFilename: string): Promise<BrowserSavedImageRecord | null> => {
    const database = await openBrowserImageDb();
    if (!database) {
        return null;
    }

    return await new Promise<BrowserSavedImageRecord | null>((resolve) => {
        try {
            const transaction = database.transaction(BROWSER_IMAGE_DB_STORE, 'readonly');
            const store = transaction.objectStore(BROWSER_IMAGE_DB_STORE);
            const request = store.get(savedFilename);
            request.onsuccess = () => resolve(normalizeBrowserSavedImageRecord(request.result));
            request.onerror = () => resolve(null);
            transaction.onabort = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
};

export const readBrowserSavedImageRecordSync = (savedFilename: string): BrowserSavedImageRecord | null => {
    const cachedRecord = browserSavedImageCache.get(savedFilename);
    if (cachedRecord) {
        return cachedRecord;
    }

    return (
        readBrowserSavedImageRecordFromStorage(getBrowserStorage('localStorage'), savedFilename) ||
        readBrowserSavedImageRecordFromStorage(getBrowserStorage('sessionStorage'), savedFilename)
    );
};

export const persistBrowserSavedImageRecord = async (
    savedFilename: string,
    dataUrl: string,
    metadata?: Record<string, unknown>,
): Promise<string> => {
    const record: BrowserSavedImageRecord = {
        dataUrl,
        metadata,
        savedAt: Date.now(),
    };

    cacheBrowserSavedImageRecord(savedFilename, record);

    try {
        await persistBrowserSavedImageRecordToDb(savedFilename, record);
    } catch {
        // Keep the synchronous cache even when durable browser storage is unavailable.
    }

    return `${BROWSER_SAVED_IMAGE_PATH_PREFIX}${savedFilename}`;
};

export const loadBrowserSavedImageRecord = async (savedFilename: string): Promise<BrowserSavedImageRecord | null> => {
    const syncRecord = readBrowserSavedImageRecordSync(savedFilename);
    if (syncRecord) {
        return syncRecord;
    }

    const dbRecord = await readBrowserSavedImageRecordFromDb(savedFilename);
    if (!dbRecord) {
        return null;
    }

    cacheBrowserSavedImageRecord(savedFilename, dbRecord);
    return dbRecord;
};

export const collectBrowserSavedImageRecords = async (
    savedFilenames: Iterable<string>,
): Promise<BrowserSavedImageRecordMap> => {
    const uniqueSavedFilenames = Array.from(
        new Set(
            Array.from(savedFilenames).filter(
                (savedFilename): savedFilename is string =>
                    typeof savedFilename === 'string' && savedFilename.trim().length > 0,
            ),
        ),
    );

    const resolvedEntries = await Promise.all(
        uniqueSavedFilenames.map(async (savedFilename) => [savedFilename, await loadBrowserSavedImageRecord(savedFilename)]),
    );

    return resolvedEntries.reduce<BrowserSavedImageRecordMap>((records, [savedFilename, record]) => {
        if (record) {
            records[savedFilename] = record;
        }

        return records;
    }, {});
};

export const hydrateBrowserSavedImageRecords = (records: Record<string, unknown>): void => {
    Object.entries(records).forEach(([savedFilename, value]) => {
        const normalizedRecord = normalizeBrowserSavedImageRecord(value);
        if (!normalizedRecord) {
            return;
        }

        cacheBrowserSavedImageRecord(savedFilename, normalizedRecord);
        void persistBrowserSavedImageRecordToDb(savedFilename, normalizedRecord).catch(() => {
            // Keep import hydration non-blocking when IndexedDB is unavailable.
        });
    });
};

export const buildBrowserSavedImageLoadUrl = (savedFilename: string): string =>
    readBrowserSavedImageRecordSync(savedFilename)?.dataUrl || '';

export const loadBrowserSavedImageDataUrl = async (savedFilename: string): Promise<string | null> =>
    (await loadBrowserSavedImageRecord(savedFilename))?.dataUrl || null;

export const loadBrowserSavedImageMetadata = async (
    savedFilename: string,
): Promise<Record<string, unknown> | undefined> => (await loadBrowserSavedImageRecord(savedFilename))?.metadata;
