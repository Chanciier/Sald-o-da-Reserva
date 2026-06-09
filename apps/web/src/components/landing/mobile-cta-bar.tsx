'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function MobileCtaBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-3 backdrop-blur transition-transform duration-300 lg:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="leading-tight">
          <p className="text-xs text-muted-foreground">Ofertas com até</p>
          <p className="font-heading text-lg font-extrabold text-foreground">80% OFF</p>
        </div>
        <a
          href="#produtos"
          className={buttonVariants({ className: 'h-12 flex-1 text-sm font-extrabold' })}
        >
          Comprar agora
          <ArrowRight className="size-4" />
        </a>
      </div>
    </div>
  );
}
