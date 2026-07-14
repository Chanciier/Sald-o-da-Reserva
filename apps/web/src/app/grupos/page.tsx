import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GruposClient } from './grupos-client';

export const metadata: Metadata = {
  title: 'Grupos de Ofertas no WhatsApp | Saldão da Reversa',
  description:
    'Entre no grupo de ofertas do Saldão da Reversa no WhatsApp e receba promoções exclusivas em primeira mão.',
};

// Link único de divulgação: /grupos. O hub escolhe automaticamente o grupo
// com vaga e ocupação mais baixa — nunca divulgamos link individual de grupo.
export default function GruposPage() {
  return (
    <Suspense fallback={null}>
      <GruposClient />
    </Suspense>
  );
}
