'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface Props {
  href: string;
  watchIds: string[];
}

export function ClubStickyCta({ href, watchIds }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const targets = watchIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setVisible(onScreen.size === 0);
    });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [watchIds]);

  return (
    <a
      href={href}
      aria-hidden={!visible}
      tabIndex={visible ? undefined : -1}
      className={`fixed bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-2 rounded-2xl bg-[#e93732] px-5 py-4 text-sm font-black text-white shadow-[0_5px_0_#a92825] transition-all duration-300 sm:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      Quero entrar para o clube <ArrowRight size={17} />
    </a>
  );
}
