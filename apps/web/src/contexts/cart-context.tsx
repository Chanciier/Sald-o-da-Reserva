'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as cartApi from '@/lib/cart-api';
import { trackAddToCart } from '@/lib/analytics';
import type { Cart } from '@/types/cart';
import { useAuth } from './auth-context';

interface CartContextType {
  cart: Cart | null;
  loading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  refresh: () => Promise<void>;
  // Grava um Cart já obtido de outra chamada (ex: o retorno de
  // cartApi.addToCart feito com um token recém-emitido, fora do fluxo normal
  // addItem/token do contexto — ver GuestClubCheckoutForm em checkout/page.tsx).
  // Ao contrário de `refresh`, não depende do `token` do contexto, então
  // nunca sofre o problema de closure desatualizada logo após um login.
  setCartData: (cart: Cart) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setCart(null);
      return;
    }
    try {
      const data = await cartApi.getCart(token);
      setCart(data);
    } catch {
      setCart(null);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const wrap = useCallback(
    async (fn: () => Promise<Cart>) => {
      if (!token) return;
      setLoading(true);
      try {
        const updated = await fn();
        setCart(updated);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const addItem = useCallback(
    async (productId: string, quantity = 1) => {
      await wrap(() => cartApi.addToCart(token!, productId, quantity));
      trackAddToCart(productId, quantity);
      setOpen(true);
    },
    [token, wrap],
  );

  const updateItem = useCallback(
    (productId: string, quantity: number) =>
      wrap(() => cartApi.updateCartItem(token!, productId, quantity)),
    [token, wrap],
  );

  const removeItem = useCallback(
    (productId: string) => wrap(() => cartApi.removeCartItem(token!, productId)),
    [token, wrap],
  );

  const clearCart = useCallback(async () => {
    if (!token) return;
    await cartApi.clearCart(token);
    setCart(null);
  }, [token]);

  const applyCoupon = useCallback(
    (code: string) => wrap(() => cartApi.applyCoupon(token!, code)),
    [token, wrap],
  );

  const removeCoupon = useCallback(() => wrap(() => cartApi.removeCoupon(token!)), [token, wrap]);

  // setCart é o setter estável do useState — não depende de `token`, então
  // (ao contrário de refresh/addItem/etc.) nunca fica preso a um closure
  // desatualizado, mesmo chamado logo depois de um login.
  const setCartData = useCallback((next: Cart) => setCart(next), []);

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        open,
        setOpen,
        addItem,
        updateItem,
        removeItem,
        clearCart,
        applyCoupon,
        removeCoupon,
        refresh,
        setCartData,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
