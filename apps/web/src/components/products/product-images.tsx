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
  // Aspect ratio of the currently displayed image — keeps the box height
  // exactly equal to the rendered photo height (no empty/letterbox space).
  const [ratio, setRatio] = useState<number | null>(null);

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
        Sem imagem
      </div>
    );
  }

  const main = images[selected];

  return (
    <div className="space-y-3">
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted"
        style={{ aspectRatio: ratio ?? 1 }}
      >
        <Image
          src={main.url}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setRatio(img.naturalWidth / img.naturalHeight);
            }
          }}
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setRatio(null);
                setSelected(idx);
              }}
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
