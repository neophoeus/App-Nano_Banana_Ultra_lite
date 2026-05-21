import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DEBUG_TERMINAL_STORAGE_KEY,
    DebugTerminalEvent,
    DebugTerminalEventKind,
    subscribeDebugTerminalEvents,
    trimDebugTerminalEvents,
    clearDebugTerminalEvents,
} from '../utils/debugTerminalEvents';

export type DebugTerminalFilter = DebugTerminalEventKind | 'all';

type UseDebugTerminalReturn = {
    events: DebugTerminalEvent[];
    filteredEvents: DebugTerminalEvent[];
    selectedEvent: DebugTerminalEvent | null;
    selectedEventId: string | null;
    setSelectedEventId: (eventId: string | null) => void;
    filter: DebugTerminalFilter;
    setFilter: (filter: DebugTerminalFilter) => void;
    autoScroll: boolean;
    setAutoScroll: (value: boolean) => void;
    clearEvents: () => void;
};

const readStoredEvents = (): DebugTerminalEvent[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const storedValue = window.localStorage.getItem(DEBUG_TERMINAL_STORAGE_KEY);
        if (!storedValue) {
            return [];
        }

        const parsedValue = JSON.parse(storedValue);
        return Array.isArray(parsedValue) ? trimDebugTerminalEvents(parsedValue as DebugTerminalEvent[]) : [];
    } catch {
        return [];
    }
};

const persistEvents = (events: DebugTerminalEvent[]): void => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(DEBUG_TERMINAL_STORAGE_KEY, JSON.stringify(events));
    } catch {
        // Debug history must never block generation or UI interactions.
    }
};

export function useDebugTerminal(): UseDebugTerminalReturn {
    const [events, setEvents] = useState<DebugTerminalEvent[]>(readStoredEvents);
    const [filter, setFilter] = useState<DebugTerminalFilter>('all');
    const [selectedEventId, setSelectedEventId] = useState<string | null>(() => events.at(-1)?.id || null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        return subscribeDebugTerminalEvents((event) => {
            setEvents((previousEvents) => {
                const nextEvents = trimDebugTerminalEvents([...previousEvents, event]);
                persistEvents(nextEvents);
                return nextEvents;
            });
            if (autoScroll) {
                setSelectedEventId(event.id);
            }
        });
    }, [autoScroll]);

    useEffect(() => {
        const handleClear = () => {
            setEvents([]);
            setSelectedEventId(null);
        };
        window.addEventListener('nbu_clear_debug_terminal', handleClear);
        return () => {
            window.removeEventListener('nbu_clear_debug_terminal', handleClear);
        };
    }, []);

    const clearEvents = useCallback(() => {
        clearDebugTerminalEvents();
    }, []);

    const filteredEvents = useMemo(
        () => (filter === 'all' ? events : events.filter((event) => event.kind === filter)),
        [events, filter],
    );
    const selectedEvent = useMemo(() => {
        if (selectedEventId) {
            return events.find((event) => event.id === selectedEventId) || filteredEvents.at(-1) || null;
        }

        return filteredEvents.at(-1) || null;
    }, [events, filteredEvents, selectedEventId]);

    return {
        events,
        filteredEvents,
        selectedEvent,
        selectedEventId,
        setSelectedEventId,
        filter,
        setFilter,
        autoScroll,
        setAutoScroll,
        clearEvents,
    };
}
