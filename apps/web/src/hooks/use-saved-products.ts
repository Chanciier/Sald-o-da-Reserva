'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'saldao:saved';
const CHANGE_EVENT = 'saldao-saved-change';

function readSaved(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSaved(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / serialization errors
  }
}

export function useSavedProducts() {
  const [saved, setSaved] = useState<string[]>([]);

  // SSR-safe initial read + subscribe to cross-component / cross-tab sync.
  useEffect(() => {
    setSaved(readSaved());

    const sync = () => setSaved(readSaved());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);

  const toggleSaved = useCallback((id: string) => {
    const current = readSaved();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    writeSaved(next);
    setSaved(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { saved, isSaved, toggleSaved };
}
