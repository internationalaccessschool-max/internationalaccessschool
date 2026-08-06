"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// useLayoutEffect warns during SSR — fall back to useEffect on the server
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function read(key: string): number | null {
    try {
        const value = sessionStorage.getItem(key);
        return value === null ? null : Number(value);
    } catch {
        return null;
    }
}

function write(key: string, value: number) {
    try {
        sessionStorage.setItem(key, String(value));
    } catch {
        /* storage unavailable (private mode) — scroll memory is optional */
    }
}

/**
 * Remembers the scroll position of a sidebar's nav list so navigating between
 * pages doesn't throw the user back to the top of a long menu.
 * Falls back to centering the active link when there is nothing saved yet.
 */
export function useNavScrollMemory(storageKey: string) {
    const ref = useRef<HTMLDivElement>(null);
    const frame = useRef<number | null>(null);

    // Restore before paint so there is no visible jump
    useIsomorphicLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const saved = read(storageKey);
        if (saved !== null && !Number.isNaN(saved)) {
            el.scrollTop = saved;
            return;
        }

        // First visit: bring the active link into view without scrolling the page
        const active = el.querySelector<HTMLElement>("[data-active='true']");
        if (active) {
            const containerTop = el.getBoundingClientRect().top;
            const activeRect = active.getBoundingClientRect();
            el.scrollTop += activeRect.top - containerTop - (el.clientHeight - activeRect.height) / 2;
        }
    }, [storageKey]);

    useEffect(() => {
        return () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
        };
    }, []);

    const onScroll = useCallback(() => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (ref.current) write(storageKey, ref.current.scrollTop);
        });
    }, [storageKey]);

    return { ref, onScroll };
}
