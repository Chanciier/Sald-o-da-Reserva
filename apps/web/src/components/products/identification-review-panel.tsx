'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { CategoryItem } from '@/actions/products';
import type {
  IdentificationResult,
  ProductSpecification,
  VisionResult,
} from '@/types/virtual-employee';

/** Estado editável do painel — mesmos campos do IdentificationResult, todos livres para o operador alterar. */
export interface ReviewPanelState {
  seoTitle: string;
  description: string;
  specifications: ProductSpecification[];
  categoryId: string; // '' = nenhuma selecionada
  tags: string[];
  slug: string;
  metaDescription: string;
}

export function toReviewPanelState(result: IdentificationResult): ReviewPanelState {
  return {
    seoTitle: result.seoTitle,
    description: result.description,
    specifications: result.specifications,
    categoryId: result.categoryId ?? '',
    tags: result.tags,
    slug: result.slug,
    metaDescription: result.metaDescription,
  };
}

interface IdentificationReviewPanelProps {
  vision: VisionResult;
  categorySuggestion: string | null;
  categories: CategoryItem[];
  value: ReviewPanelState;
  onChange: (value: ReviewPanelState) => void;
  onSave: () => void;
  isSaving: boolean;
}

/**
 * Painel de revisão do Funcionário Virtual. Mostra o que o Vision identificou
 * (referência, só leitura) e o conteúdo gerado pelo Identification — TUDO
 * editável antes de salvar como produto de verdade.
 */
export function IdentificationReviewPanel({
  vision,
  categorySuggestion,
  categories,
  value,
  onChange,
  onSave,
  isSaving,
}: IdentificationReviewPanelProps) {
  const [newTag, setNewTag] = useState('');
  const confidencePct = Math.round(vision.confidence * 100);

  const categoryMatched = useMemo(
    () => value.categoryId !== '' && categories.some((c) => c.id === value.categoryId),
    [value.categoryId, categories],
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

      {/* Título SEO */}
      <div>
        <label className="mb-1 block text-sm font-medium">Título SEO</label>
        <Input
          value={value.seoTitle}
          maxLength={200}
          onChange={(e) => update('seoTitle', e.target.value)}
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

      {/* Categoria */}
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
            Sugestão da IA: &quot;{categorySuggestion}&quot; — não encontrada no catálogo, selecione
            manualmente.
          </p>
        )}
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

      {/* Slug */}
      <div>
        <label className="mb-1 block text-sm font-medium">Slug (URL)</label>
        <Input
          value={value.slug}
          maxLength={200}
          onChange={(e) => update('slug', e.target.value)}
        />
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
          {isSaving ? 'Salvando...' : 'Salvar produto'}
        </Button>
      </div>
    </div>
  );
}
