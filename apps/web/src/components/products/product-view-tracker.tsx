'use client';

import { useEffect } from 'react';
import { trackProductView } from '@/lib/analytics';

// Sem render — só existe para disparar o evento de visualização a partir da
// página de produto, que é um server component.
export function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    trackProductView(productId);
  }, [productId]);

  return null;
}
