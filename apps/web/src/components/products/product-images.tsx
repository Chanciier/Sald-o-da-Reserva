'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ProductImage } from '@/types/product';

interface Props {
  images: ProductImage[];
  name: string;
}

export function ProductImages({ images, name }: Props) {
  const [selected, setSelected] = useState(0);

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
        Sem imagem
      </div>
    );
  }

  const main = images[selected];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <div className="relative aspect-square w-full">
          <Image
            src={main.url}
            alt={name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
            style={{ maxHeight: '480px' }}
          />
        </div>
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelected(idx)}
              className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                idx === selected
                  ? 'border-primary'
                  : 'border-border opacity-60 hover:opacity-100 hover:border-muted-foreground'
              }`}
              style={{ width: 72, height: 72 }}
            >
              <Image src={img.url} alt="" fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
