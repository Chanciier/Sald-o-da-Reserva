'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@/types/product';

const STORAGE_KEY = 'saldao:saved:v2';
const CHANGE_EVENT = 'saldao-saved-change';

// Strips large HTML description to keep localStorage compact.
function toStorable(p: Product): Product {
  return { ...p, description: undefined as unknown as string };
}

function readSaved(): Product[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(products: Product[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch {
    // ignore quota errors
  }
}

export function useSavedProducts() {
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);

  useEffect(() => {
    setSavedProducts(readSaved());

    const sync = () => setSavedProducts(readSaved());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isSaved = useCallback(
    (id: string) => savedProducts.some((p) => p.id === id),
    [savedProducts],
  );

  const toggleSaved = useCallback((product: Product) => {
    const current = readSaved();
    const exists = current.some((p) => p.id === product.id);
    const next = exists
      ? current.filter((p) => p.id !== product.id)
      : [...current, toStorable(product)];
    writeSaved(next);
    setSavedProducts(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { savedProducts, isSaved, toggleSaved };
}
