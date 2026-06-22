'use client';

import { useEffect } from 'react';
import { pixelViewContent } from '@/lib/pixel';

interface Props {
  productId: string;
  productName: string;
  productPrice: number;
}

export function ProductPixelEvents({ productId, productName, productPrice }: Props) {
  useEffect(() => {
    pixelViewContent({
      content_ids: [productId],
      content_name: productName,
      content_type: 'product',
      value: productPrice,
      currency: 'BRL',
    });
  }, [productId, productName, productPrice]);

  return null;
}
