export type DebugTerminalEventKind = 'request' | 'response' | 'error' | 'stream' | 'retry' | 'log';

export type DebugTerminalEvent = {
    id: string;
    kind: DebugTerminalEventKind;
    label: string;
    timestamp: number;
    requestId?: string;
    sessionId?: string;
    slotIndex?: number;
    summary?: string;
    payload?: unknown;
};

export type DebugTerminalEventInput = Omit<DebugTerminalEvent, 'id' | 'timestamp' | 'payload'> & {
    id?: string;
    timestamp?: number;
    payload?: unknown;
};

export const DEBUG_TERMINAL_STORAGE_KEY = 'nbu_lite_debug_terminal_events';
export const DEBUG_TERMINAL_MAX_EVENTS = 200;

const MAX_STRING_LENGTH = 1200;
const MAX_ARRAY_ITEMS = 24;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 5;

const SENSITIVE_KEY_PATTERN = /api.?key|authorization|access.?token|bearer|secret|credential|password/i;
const IMAGE_FIELD_PATTERN = /editingInput|objectImageInputs|characterImageInputs|imageDataUrl|imageUrl|displayUrl|url/i;
const DATA_URL_PATTERN = /^data:[^;]+;base64,/i;
const BASE64ISH_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

type DebugTerminalListener = (event: DebugTerminalEvent) => void;

const listeners = new Set<DebugTerminalListener>();

const createEventId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `debug-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const summarizeString = (value: string) => ({
    redacted: true,
    type: value.startsWith('data:') ? 'data-url' : 'base64',
    length: value.length,
    preview: value.startsWith('data:') ? value.slice(0, Math.min(value.indexOf(',') + 1 || 32, 80)) : undefined,
});

const shouldRedactString = (value: string, keyHint?: string): boolean => {
    if (DATA_URL_PATTERN.test(value)) {
        return true;
    }

    if (keyHint && IMAGE_FIELD_PATTERN.test(keyHint) && value.length > 180) {
        return true;
    }

    return value.length > 320 && BASE64ISH_PATTERN.test(value);
};

const truncateString = (value: string): string | { value: string; truncated: true; originalLength: number } => {
    if (value.length <= MAX_STRING_LENGTH) {
        return value;
    }

    return {
        value: value.slice(0, MAX_STRING_LENGTH),
        truncated: true,
        originalLength: value.length,
    };
};

export const sanitizeDebugTerminalPayload = (value: unknown, keyHint?: string, depth = 0): unknown => {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
            return { redacted: true, reason: 'sensitive-key', length: value.length };
        }

        if (shouldRedactString(value, keyHint)) {
            return summarizeString(value);
        }

        return truncateString(value);
    }

    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        return String(value);
    }

    if (depth >= MAX_DEPTH) {
        return { truncated: true, reason: 'max-depth' };
    }

    if (Array.isArray(value)) {
        const shouldSummarizeImageArray = keyHint ? IMAGE_FIELD_PATTERN.test(keyHint) : false;
        if (shouldSummarizeImageArray) {
            return {
                redacted: true,
                reason: 'image-array',
                count: value.length,
            };
        }

        const items = value
            .slice(0, MAX_ARRAY_ITEMS)
            .map((item) => sanitizeDebugTerminalPayload(item, keyHint, depth + 1));

        return value.length > MAX_ARRAY_ITEMS
            ? {
                  items,
                  truncated: true,
                  originalLength: value.length,
              }
            : items;
    }

    if (value instanceof Error) {
        const errorWithStatus = value as Error & { status?: number; code?: string };
        return {
            name: value.name,
            message: value.message,
            status: errorWithStatus.status,
            code: errorWithStatus.code,
        };
    }

    const record = value as Record<string, unknown>;
    const entries = Object.entries(record);
    const sanitizedEntries = entries.slice(0, MAX_OBJECT_KEYS).map(([key, nestedValue]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            return [key, { redacted: true, reason: 'sensitive-key' }];
        }

        if (key === 'data' && typeof nestedValue === 'string' && record.mimeType) {
            return [
                key,
                {
                    redacted: true,
                    reason: 'inline-data',
                    mimeType: record.mimeType,
                    length: nestedValue.length,
                },
            ];
        }

        return [key, sanitizeDebugTerminalPayload(nestedValue, key, depth + 1)];
    });

    return {
        ...Object.fromEntries(sanitizedEntries),
        ...(entries.length > MAX_OBJECT_KEYS
            ? {
                  __truncatedKeys: entries.length - MAX_OBJECT_KEYS,
              }
            : {}),
    };
};

export const trimDebugTerminalEvents = (events: DebugTerminalEvent[]): DebugTerminalEvent[] =>
    events.slice(-DEBUG_TERMINAL_MAX_EVENTS);

export const emitDebugTerminalEvent = (input: DebugTerminalEventInput): DebugTerminalEvent => {
    const event: DebugTerminalEvent = {
        ...input,
        id: input.id || createEventId(),
        timestamp: input.timestamp || Date.now(),
        payload: sanitizeDebugTerminalPayload(input.payload),
    };

    listeners.forEach((listener) => listener(event));
    return event;
};

export const subscribeDebugTerminalEvents = (listener: DebugTerminalListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
