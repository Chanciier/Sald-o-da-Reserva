'use client';

import { useRouter } from 'next/navigation';
import { Dices } from 'lucide-react';

export function RandomButton({
  slugs,
  variant = 'default',
}: {
  slugs: string[];
  variant?: 'default' | 'hero';
}) {
  const router = useRouter();

  const goRandom = () => {
    if (!slugs.length) return;
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    router.push(`/produtos/${slug}`);
  };

  if (variant === 'hero') {
    return (
      <button
        type="button"
        onClick={goRandom}
        disabled={!slugs.length}
        className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-transform hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Dices className="size-5" aria-hidden="true" />
        Me mostre algo aleatório
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goRandom}
      disabled={!slugs.length}
      aria-label="Mostrar produto aleatório"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-bold text-accent-foreground shadow-lg shadow-accent/30 transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Dices className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">Surpreenda-me</span>
    </button>
  );
}
