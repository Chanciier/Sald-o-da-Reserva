import type { Metadata } from 'next';
import { GruposLanding } from './grupos-landing';

export const metadata: Metadata = {
  title: 'Grupos de Ofertas no WhatsApp | Saldão da Reversa',
  description:
    'Entre no grupo de ofertas do Saldão da Reversa no WhatsApp e receba promoções exclusivas em primeira mão.',
};

// Link único de divulgação dos grupos gerais. Outras categorias (ex.: sex
// shop) têm o próprio link em /grupos/<categoria>.
export default function GruposPage() {
  return <GruposLanding />;
}
