import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GruposLanding } from '../grupos-landing';

// Mesmo formato aceito pela API (letras minúsculas, números e hífens).
const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface Props {
  params: { categoria: string };
}

/** "sex-shop" → "Sex Shop" */
function categoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function generateMetadata({ params }: Props): Metadata {
  const label = categoryLabel(params.categoria);
  return {
    title: `Grupos ${label} no WhatsApp`,
    description: `Entre no grupo ${label} do Saldão da Reversa no WhatsApp e receba ofertas exclusivas em primeira mão.`,
  };
}

// Link de divulgação de uma categoria de grupos (ex.: /grupos/sex-shop): só
// distribui entre os grupos cadastrados com essa categoria no Hub de Grupos.
export default function GruposCategoriaPage({ params }: Props) {
  if (params.categoria === 'geral' || !CATEGORY_PATTERN.test(params.categoria)) notFound();
  return <GruposLanding category={params.categoria} />;
}
