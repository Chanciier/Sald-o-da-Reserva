'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface Props {
  title: string;
  text?: string | null;
}

export function ShareButton({ title, text }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: text ?? title, url });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
      title="Compartilhar produto"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-600 dark:text-green-400">Copiado!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          <span>Compartilhar</span>
        </>
      )}
    </button>
  );
}
