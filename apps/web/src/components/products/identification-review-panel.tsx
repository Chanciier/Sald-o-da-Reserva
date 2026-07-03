'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CategoryItem } from '@/actions/products';
import type {
  CompetitionLevel,
  ProductSpecification,
  VirtualEmployeeReview,
} from '@/types/virtual-employee';
import {
  COMPETITION_LABELS,
  MARKETPLACE_LABELS,
  PRICING_TIER_LABELS,
} from '@/types/virtual-employee';

/** Estado editável do painel — tudo livre para o operador alterar antes de aprovar. */
export interface ReviewPanelState {
  title: string;
  description: string;
  specifications: ProductSpecification[];
  categoryId: string; // '' = nenhuma selecionada
  tags: string[];
  metaDescription: string;
  ncm: string;
  brand: string;
  price: number;
  stock: number;
  isUnique: boolean;
}

export function toReviewPanelState(review: VirtualEmployeeReview): ReviewPanelState {
  return {
    title: review.product.title,
    description: review.product.description,
    specifications: review.product.specifications,
    categoryId: review.product.categoryId ?? '',
    tags: review.product.tags,
    metaDescription: review.product.metaDescription,
    ncm: review.product.ncm ?? '',
    brand: review.product.brand ?? '',
    price: review.pricing.suggestedPrice,
    stock: 1,
    isUnique: true,
  };
}

const COMPETITION_BADGE_VARIANT: Record<CompetitionLevel, 'success' | 'warning' | 'destructive'> = {
  BAIXA: 'success',
  MEDIA: 'warning',
  ALTA: 'destructive',
};

interface IdentificationReviewPanelProps {
  review: VirtualEmployeeReview;
  categorySuggestion: string | null;
  categories: CategoryItem[];
  value: ReviewPanelState;
  onChange: (value: ReviewPanelState) => void;
  onSave: () => void;
  isSaving: boolean;
}

/**
 * Painel de revisão do Funcionário Virtual. Mostra o que o Vision identificou
 * e as sugestões do orquestrador (preço, pesquisa de mercado, NCM) — TUDO
 * editável antes de aprovar e criar o produto de verdade.
 */
export function IdentificationReviewPanel({
  review,
  categorySuggestion,
  categories,
  value,
  onChange,
  onSave,
  isSaving,
}: IdentificationReviewPanelProps) {
  const [newTag, setNewTag] = useState('');
  const { vision, pricing, market } = review;
  const confidencePct = Math.round(vision.confidence * 100);

  const categoryMatched = useMemo(
    () => value.categoryId !== '' && categories.some((c) => c.id === value.categoryId),
    [value.categoryId, categories],
  );

  const selectedTier = useMemo(
    () => pricing.suggestions.find((s) => s.price === value.price)?.tier ?? null,
    [pricing.suggestions, value.price],
  );

  function update<K extends keyof ReviewPanelState>(key: K, next: ReviewPanelState[K]) {
    onChange({ ...value, [key]: next });
  }

  function updateSpec(index: number, field: keyof ProductSpecification, text: string) {
    const specs = value.specifications.map((s, i) => (i === index ? { ...s, [field]: text } : s));
    update('specifications', specs);
  }

  function removeSpec(index: number) {
    update(
      'specifications',
      value.specifications.filter((_, i) => i !== index),
    );
  }

  function addSpec() {
    update('specifications', [...value.specifications, { label: '', value: '' }]);
  }

  function addTag() {
    const t = newTag.trim();
    if (!t || value.tags.some((tag) => tag.toLowerCase() === t.toLowerCase())) {
      setNewTag('');
      return;
    }
    update('tags', [...value.tags, t]);
    setNewTag('');
  }

  function removeTag(tag: string) {
    update(
      'tags',
      value.tags.filter((t) => t !== tag),
    );
  }

  return (
    <div className="space-y-6">
      {/* Referência: o que a visão computacional identificou (não editável aqui — vem de outra etapa) */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Identificado pela IA de visão ({vision.modelUsed}) · {confidencePct}% de confiança ·{' '}
          {vision.imagesAnalyzed} foto(s)
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {vision.brand && (
            <span>
              <strong>Marca:</strong> {vision.brand}
            </span>
          )}
          {vision.model && (
            <span>
              <strong>Modelo:</strong> {vision.model}
            </span>
          )}
          {vision.color && (
            <span>
              <strong>Cor:</strong> {vision.color}
            </span>
          )}
          {vision.condition && (
            <span>
              <strong>Estado:</strong> {vision.condition.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Pesquisa de mercado (Hermes) */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pesquisa de mercado
          </p>
          <Badge variant={COMPETITION_BADGE_VARIANT[market.competition]}>
            Concorrência {COMPETITION_LABELS[market.competition]}
          </Badge>
        </div>
        <p className="text-sm">{market.summary}</p>
        {market.byMarketplace.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {market.byMarketplace.map((m) => (
              <span key={m.marketplace}>
                <strong>{MARKETPLACE_LABELS[m.marketplace]}:</strong>{' '}
                {m.avgPrice != null ? `R$ ${m.avgPrice.toFixed(2)}` : 'sem dados'} ({m.listingCount}{' '}
                anúncio{m.listingCount === 1 ? '' : 's'})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Preço sugerido */}
      <div>
        <label className="mb-1 block text-sm font-medium">Preço sugerido pela IA</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {pricing.suggestions.map((s) => (
            <button
              type="button"
              key={s.tier}
              onClick={() => update('price', s.price)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors hover:border-primary/60',
                selectedTier === s.tier ? 'border-primary bg-primary/5' : 'border-input',
              )}
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {PRICING_TIER_LABELS[s.tier]}
              </p>
              <p className="text-lg font-bold">R$ {s.price.toFixed(2)}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.reasoning}</p>
            </button>
          ))}
        </div>
        <div className="mt-2 max-w-[200px]">
          <label className="mb-1 block text-xs text-muted-foreground">Preço final (editável)</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={value.price}
            onChange={(e) => update('price', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Título SEO */}
      <div>
        <label className="mb-1 block text-sm font-medium">Título SEO</label>
        <Input
          value={value.title}
          maxLength={200}
          onChange={(e) => update('title', e.target.value)}
        />
      </div>

      {/* Descrição completa */}
      <div>
        <label className="mb-1 block text-sm font-medium">Descrição completa</label>
        <textarea
          className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={value.description}
          onChange={(e) => update('description', e.target.value)}
        />
      </div>

      {/* Especificações */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium">Especificações</label>
          <Button type="button" variant="ghost" size="sm" onClick={addSpec}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
        <div className="space-y-2">
          {value.specifications.map((spec, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Atributo"
                value={spec.label}
                onChange={(e) => updateSpec(i, 'label', e.target.value)}
                className="w-1/3"
              />
              <Input
                placeholder="Valor"
                value={spec.value}
                onChange={(e) => updateSpec(i, 'value', e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeSpec(i)}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label="Remover especificação"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {value.specifications.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma especificação. Adicione manualmente se quiser.
            </p>
          )}
        </div>
      </div>

      {/* Categoria + NCM */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Categoria</label>
          <Select value={value.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
            <option value="">Selecione uma categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {categorySuggestion && !categoryMatched && (
            <p className="mt-1 text-xs text-amber-600">
              Sugestão da IA: &quot;{categorySuggestion}&quot; — não encontrada no catálogo,
              selecione manualmente.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">NCM</label>
          <Input
            value={value.ncm}
            maxLength={20}
            placeholder="Ex: 9404.90.00"
            onChange={(e) => update('ncm', e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Herdado da categoria; ajuste se preciso.
          </p>
        </div>
      </div>

      {/* Marca */}
      <div>
        <label className="mb-1 block text-sm font-medium">Marca</label>
        <Input
          value={value.brand}
          maxLength={100}
          onChange={(e) => update('brand', e.target.value)}
        />
      </div>

      {/* Estoque + Peça única */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Estoque</label>
          <Input
            type="number"
            min="0"
            value={value.stock}
            onChange={(e) => update('stock', Number(e.target.value))}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.isUnique}
              onChange={(e) => update('isUnique', e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">Peça única (sem reposição)</span>
          </label>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1 block text-sm font-medium">Tags</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {value.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remover tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            placeholder="Nova tag"
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Adicionar
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Tags ainda não têm campo próprio no cadastro de produto — servem de referência neste
          painel por enquanto.
        </p>
      </div>

      {/* Meta description */}
      <div>
        <label className="mb-1 block text-sm font-medium">Meta Description</label>
        <textarea
          className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={value.metaDescription}
          maxLength={500}
          onChange={(e) => update('metaDescription', e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {value.metaDescription.length}/160 recomendado
        </p>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? 'Salvando...' : 'Aprovar e salvar produto'}
        </Button>
      </div>
    </div>
  );
}
