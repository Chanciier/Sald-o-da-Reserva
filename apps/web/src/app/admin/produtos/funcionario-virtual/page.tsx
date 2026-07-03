'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import {
  IdentificationReviewPanel,
  toReviewPanelState,
  type ReviewPanelState,
} from '@/components/products/identification-review-panel';
import { uploadImages } from '@/lib/upload';
import { fetchCategories, type CategoryItem } from '@/actions/products';
import { analyzeVirtualEmployee, approveVirtualEmployee } from '@/actions/virtual-employee';
import type { VirtualEmployeeReview } from '@/types/virtual-employee';
import type { ImageData } from '@/types/image';

const MAX_IMAGES = 5;

/** Junta a descrição editada com a ficha técnica — o schema de Product não tem coluna própria pra specs. */
function composeDescription(
  description: string,
  specs: ReviewPanelState['specifications'],
): string {
  const valid = specs.filter((s) => s.label.trim() && s.value.trim());
  if (valid.length === 0) return description;
  const specText = valid.map((s) => `- ${s.label.trim()}: ${s.value.trim()}`).join('\n');
  return `${description}\n\nEspecificações:\n${specText}`;
}

export default function FuncionarioVirtualPage() {
  const { token } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImageData[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const [review, setReview] = useState<VirtualEmployeeReview | null>(null);
  const [panelState, setPanelState] = useState<ReviewPanelState | null>(null);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || !token) return;
    const files = Array.from(fileList).slice(0, MAX_IMAGES - images.length);
    if (files.length === 0) return;

    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadImages(files, 'products', token);
      setImages((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGES));
    } catch (err) {
      setError((err as Error).message ?? 'Falha ao enviar fotos');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function handleAnalyze() {
    if (!token || images.length === 0) return;
    setError('');
    setAnalyzing(true);
    setReview(null);
    setPanelState(null);
    try {
      const result = await analyzeVirtualEmployee(
        token,
        images.map((i) => i.url),
      );
      setReview(result);
      setPanelState(toReviewPanelState(result));
    } catch (err) {
      setError((err as Error).message ?? 'Não foi possível analisar as fotos. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!token || !review || !panelState) return;
    setError('');
    setIsSaving(true);
    try {
      const product = await approveVirtualEmployee(token, {
        reviewId: review.reviewId,
        name: panelState.title,
        description: composeDescription(panelState.description, panelState.specifications),
        metaDescription: panelState.metaDescription,
        categoryId: panelState.categoryId || null,
        ncm: panelState.ncm || null,
        brand: panelState.brand || null,
        price: panelState.price,
        stock: panelState.stock,
        isUnique: panelState.isUnique,
        imageIds: images.map((i) => i.id),
      });
      router.push(`/admin/produtos/${product.id}`);
    } catch (err) {
      setError((err as Error).message ?? 'Erro ao salvar produto');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Funcionário Virtual</h1>
        <p className="text-sm text-muted-foreground">
          Fotografe o produto — o resto é gerado automaticamente. Revise e edite tudo antes de
          salvar.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Etapa 1: fotos */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">
          1. Fotos do produto ({images.length}/{MAX_IMAGES})
        </h2>
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-lg border">
              <Image src={img.url} alt="" fill className="object-cover" />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remover foto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              <span className="text-[11px]">Enviar foto</span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {/* Etapa 2: analisar */}
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">2. Análise por IA</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Identifica o produto, pesquisa preços no Mercado Livre e Shopee e sugere 3 estratégias de
          preço — tudo em uma etapa.
        </p>
        <Button type="button" onClick={handleAnalyze} disabled={images.length === 0 || analyzing}>
          {analyzing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {analyzing ? 'Analisando...' : 'Analisar com IA'}
        </Button>
      </div>

      {/* Etapa 3: revisão */}
      {review && panelState && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold">3. Revisão (edite o que precisar)</h2>
          <IdentificationReviewPanel
            review={review}
            categorySuggestion={review.product.category}
            categories={categories}
            value={panelState}
            onChange={setPanelState}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>
      )}
    </div>
  );
}
