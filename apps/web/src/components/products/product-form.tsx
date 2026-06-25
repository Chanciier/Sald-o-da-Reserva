'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  ImageIcon,
  RefreshCw,
  Camera,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import type { Product, ProductImage, CategoryItem } from '@/actions/products';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function generateSku(name = ''): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${rand}`;
}

function slugify(str: string) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  slug: z.string().max(200).optional(),
  sku: z.string().max(100).optional(),
  internalCode: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  categoryId: z.string().optional(),
  price: z.coerce.number({ message: 'Informe o preço' }).min(0, 'Preço inválido'),
  salePrice: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0),
  minimumStock: z.coerce.number().int().min(0),
  weight: z.coerce.number().min(0).optional().nullable(),
  dimWidth: z.coerce.number().min(0).optional().nullable(),
  dimHeight: z.coerce.number().min(0).optional().nullable(),
  dimDepth: z.coerce.number().min(0).optional().nullable(),
  pickupAvailable: z.boolean().default(false),
  featuredOffer: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIVED', 'OUT_OF_STOCK']),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  ncm: z.string().max(20).optional(),
  origem: z.coerce.number().int().min(0).max(8).optional(),
  cstCsosn: z.string().max(10).optional(),
});

type FormData = z.infer<typeof schema>;

interface ProductFormProps {
  initialData?: Product;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
  basePath: string;
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

export function ProductForm({ initialData, onSubmit, isSubmitting, basePath }: ProductFormProps) {
  const router = useRouter();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [slugManual, setSlugManual] = useState(!!initialData);
  const [skuManual, setSkuManual] = useState(!!initialData);
  const [ncmQuery, setNcmQuery] = useState('');
  const [ncmResults, setNcmResults] = useState<{ codigo: string; descricao: string }[]>([]);
  const [ncmSearching, setNcmSearching] = useState(false);
  const ncmDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ncmNameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [autoPublishWhatsapp, setAutoPublishWhatsapp] = useState(
    initialData?.autoPublishWhatsapp ?? false,
  );
  const [whatsappGroupIds, setWhatsappGroupIds] = useState<string[]>(
    initialData?.whatsappGroupIds ?? [],
  );
  const [resending, setResending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: whatsappGroups = [] } = useQuery<{ id: string; name: string; active: boolean }[]>({
    queryKey: ['whatsapp-groups'],
    queryFn: async () => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/v1/whatsapp/groups`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  async function handleResend() {
    if (!initialData || !token) return;
    setResending(true);
    try {
      await fetch(`${BASE}/api/v1/whatsapp/resend/${initialData.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      setResending(false);
    }
  }

  const {
    data: categoriesData,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async (): Promise<{ data: CategoryItem[] }> => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE}/api/v1/categories?limit=100`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
  const categories = useMemo(() => categoriesData?.data ?? [], [categoriesData]);

  const dims = initialData?.dimensions as
    | { width?: number; height?: number; depth?: number }
    | null
    | undefined;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: initialData
      ? {
          name: initialData.name,
          slug: initialData.slug,
          sku: initialData.sku,
          internalCode: initialData.internalCode ?? '',
          brand: initialData.brand ?? '',
          shortDescription: initialData.shortDescription ?? '',
          description: initialData.description ?? '',
          categoryId: initialData.categoryId ?? '',
          price: initialData.price,
          salePrice: initialData.salePrice ?? undefined,
          stock: initialData.stock,
          minimumStock: initialData.minimumStock,
          weight: initialData.weight ?? undefined,
          dimWidth: dims?.width ?? undefined,
          dimHeight: dims?.height ?? undefined,
          dimDepth: dims?.depth ?? undefined,
          pickupAvailable: initialData.pickupAvailable ?? false,
          featuredOffer: initialData.featuredOffer ?? false,
          status: initialData.status as FormData['status'],
          metaTitle: initialData.metaTitle ?? '',
          metaDescription: initialData.metaDescription ?? '',
          ncm: initialData.ncm ?? '',
          origem: initialData.origem ?? 0,
          cstCsosn: initialData.cstCsosn ?? '102',
        }
      : {
          status: 'ACTIVE',
          stock: 0,
          minimumStock: 0,
          pickupAvailable: false,
          featuredOffer: false,
          sku: generateSku(),
          cstCsosn: '102',
        },
  });

  const nameValue = watch('name');
  const categoryIdValue = watch('categoryId');
  const ncmValue = watch('ncm');

  useEffect(() => {
    if (!slugManual && nameValue) {
      setValue('slug', slugify(nameValue));
    }
  }, [nameValue, slugManual, setValue]);

  useEffect(() => {
    if (!skuManual && nameValue) {
      setValue('sku', generateSku(nameValue));
    }
  }, [nameValue, skuManual, setValue]);

  useEffect(() => {
    if (initialData?.images) {
      setImages([...initialData.images].sort((a, b) => a.position - b.position));
    }
  }, [initialData]);

  useEffect(() => {
    if (!categoryIdValue || initialData?.ncm) return;
    const cat = categories.find((c) => c.id === categoryIdValue);
    if (cat) setValue('ncm', cat.ncm ?? '');
  }, [categoryIdValue, categories, setValue, initialData?.ncm]);

  // Auto-search NCM from product name when NCM is empty and manual search is idle
  useEffect(() => {
    if (ncmValue || ncmQuery || !nameValue || nameValue.length < 3) return;
    if (ncmNameDebounce.current) clearTimeout(ncmNameDebounce.current);
    ncmNameDebounce.current = setTimeout(async () => {
      setNcmSearching(true);
      try {
        const res = await fetch(
          `https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(nameValue)}`,
        );
        if (res.ok) setNcmResults((await res.json()).slice(0, 8));
      } finally {
        setNcmSearching(false);
      }
    }, 800);
    return () => {
      if (ncmNameDebounce.current) clearTimeout(ncmNameDebounce.current);
    };
  }, [nameValue, ncmValue, ncmQuery]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !token) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      const res = await fetch(`${BASE}/api/v1/uploads/products`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Falha no upload');
      const uploaded: ProductImage[] = await res.json();
      setImages((prev) => [
        ...prev,
        ...uploaded.map((u, i) => ({ ...u, position: prev.length + i })),
      ]);
    } catch {
      setUploadError('Erro ao enviar imagens. Verifique o formato e tamanho (máx 10 MB).');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteImage(img: ProductImage) {
    if (!token) return;
    const filename = img.key.split('/').pop()!;
    try {
      await fetch(`${BASE}/api/v1/uploads/products/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort: remove from UI even if server delete fails
    }
    setImages((prev) => prev.filter((i) => i.id !== img.id));
  }

  function moveImage(index: number, direction: 'up' | 'down') {
    setImages((prev) => {
      const next = [...prev];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  async function handleAnalyzeImage() {
    if (!images.length || !token) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await fetch(`${BASE}/api/v1/products/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl: images[0].url }),
      });
      if (!res.ok) throw new Error('Erro na análise');
      const data = await res.json();

      if (data.name && data.name !== 'Produto não identificado') {
        setValue('name', data.name, { shouldDirty: true });
        setSlugManual(false);
      }
      if (data.shortDescription)
        setValue('shortDescription', data.shortDescription, { shouldDirty: true });
      if (data.brand) setValue('brand', data.brand, { shouldDirty: true });
      if (data.suggestedPrice) setValue('price', data.suggestedPrice, { shouldDirty: true });

      const confPct = Math.round((data.confidence ?? 0) * 100);
      const priceText = data.priceRange
        ? ` · Preço sugerido: R$ ${data.suggestedPrice?.toFixed(2)} (ML: R$ ${data.priceRange.min}–${data.priceRange.max})`
        : '';
      setAnalyzeMsg({ type: 'ok', text: `Preenchido com ${confPct}% de confiança${priceText}` });
    } catch {
      setAnalyzeMsg({ type: 'err', text: 'Não foi possível analisar a imagem. Tente novamente.' });
    } finally {
      setAnalyzing(false);
    }
  }

  async function onFormSubmit(data: FormData) {
    const hasDims = data.dimWidth || data.dimHeight || data.dimDepth;
    const payload: Record<string, unknown> = {
      name: data.name,
      slug: data.slug || undefined,
      sku: data.sku,
      internalCode: data.internalCode || undefined,
      brand: data.brand || undefined,
      shortDescription: data.shortDescription || undefined,
      description: data.description || undefined,
      categoryId: data.categoryId || undefined,
      price: data.price,
      salePrice: data.salePrice || undefined,
      stock: data.stock,
      minimumStock: data.minimumStock,
      weight: data.weight || undefined,
      dimensions: hasDims
        ? {
            width: data.dimWidth ?? 0,
            height: data.dimHeight ?? 0,
            depth: data.dimDepth ?? 0,
            unit: 'cm',
          }
        : undefined,
      pickupAvailable: data.pickupAvailable,
      featuredOffer: data.featuredOffer,
      status: data.status,
      metaTitle: data.metaTitle || undefined,
      metaDescription: data.metaDescription || undefined,
      ncm: data.ncm || undefined,
      origem: data.origem ?? 0,
      cstCsosn: data.cstCsosn || undefined,
      imageIds: images.map((i) => i.id),
      autoPublishWhatsapp,
      whatsappGroupIds,
    };
    await onSubmit(payload);
  }

  const inputCls =
    'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const errorCls = 'mt-1 text-xs text-destructive';
  const cardCls = 'rounded-xl border bg-card p-5 shadow-sm space-y-4';

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{initialData ? 'Editar Produto' : 'Novo Produto'}</h1>
          <p className="text-sm text-muted-foreground">
            {initialData ? `SKU: ${initialData.sku}` : 'Preencha os campos abaixo'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {initialData && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              title="Reenviar para WhatsApp"
              className="flex items-center gap-1.5 rounded-lg border border-green-600/40 bg-green-600/10 px-3 py-2 text-sm text-green-700 hover:bg-green-600/20 disabled:opacity-60 transition-colors dark:text-green-400"
            >
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              WhatsApp
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push(basePath)}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-colors"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Salvando...' : 'Salvar produto'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informações básicas */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Informações básicas</h2>
            <div>
              <label className={labelCls}>Nome *</label>
              <input {...register('name')} className={inputCls} placeholder="Nome do produto" />
              {errors.name && <p className={errorCls}>{errors.name.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Slug (URL)</label>
              <input
                {...register('slug')}
                className={inputCls}
                placeholder="nome-do-produto"
                onChange={(e) => {
                  setSlugManual(true);
                  register('slug').onChange(e);
                }}
              />
              <p className="mt-0.5 text-xs text-muted-foreground">
                Gerado automaticamente a partir do nome
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>SKU</label>
                <div className="flex gap-1.5">
                  <input
                    {...register('sku')}
                    className={inputCls}
                    placeholder="Gerado automaticamente"
                    onChange={(e) => {
                      setSkuManual(true);
                      register('sku').onChange(e);
                    }}
                  />
                  <button
                    type="button"
                    title="Gerar novo SKU"
                    onClick={() => {
                      setSkuManual(false);
                      setValue('sku', generateSku(watch('name') ?? ''));
                    }}
                    className="flex items-center rounded-lg border px-2.5 hover:bg-muted"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                {errors.sku && <p className={errorCls}>{errors.sku.message}</p>}
                {!skuManual && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Gerado a partir do nome</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Código interno</label>
                <input {...register('internalCode')} className={inputCls} placeholder="COD-001" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Marca</label>
              <input {...register('brand')} className={inputCls} placeholder="Nome da marca" />
            </div>
            <div>
              <label className={labelCls}>Descrição curta</label>
              <input
                {...register('shortDescription')}
                className={inputCls}
                placeholder="Resumo breve do produto (até 500 caracteres)"
              />
            </div>
            <div>
              <label className={labelCls}>Descrição completa</label>
              <textarea
                {...register('description')}
                rows={6}
                className={`${inputCls} resize-y`}
                placeholder="Descrição detalhada do produto..."
              />
            </div>
          </div>

          {/* Imagens */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Imagens</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className="group relative rounded-lg border overflow-hidden bg-muted aspect-square"
                >
                  <Image src={img.url} alt="" fill className="object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveImage(idx, 'up')}
                      disabled={idx === 0}
                      className="rounded bg-white/20 p-1 hover:bg-white/40 disabled:opacity-30 transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp className="h-4 w-4 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img)}
                      className="rounded bg-red-500/80 p-1 hover:bg-red-600 transition-colors"
                      title="Remover imagem"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(idx, 'down')}
                      disabled={idx === images.length - 1}
                      className="rounded bg-white/20 p-1 hover:bg-white/40 disabled:opacity-30 transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="h-4 w-4 text-white" />
                    </button>
                  </div>
                  {idx === 0 && (
                    <span className="absolute top-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Principal
                    </span>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs text-center leading-tight">Galeria</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-6 w-6" />
                    <span className="text-xs text-center leading-tight">Tirar foto</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadError && <p className={errorCls}>{uploadError}</p>}
            <p className="text-xs text-muted-foreground">
              Formatos: JPEG, PNG, WebP · Máx. 10 MB por imagem · Convertidas automaticamente para
              WebP
            </p>
            {images.length > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleAnalyzeImage}
                  disabled={analyzing}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {analyzing ? 'Analisando...' : 'Analisar com IA'}
                </button>
                {analyzeMsg && (
                  <p
                    className={`text-xs ${analyzeMsg.type === 'ok' ? 'text-green-600' : 'text-destructive'}`}
                  >
                    {analyzeMsg.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Preço */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Preço</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Preço normal (R$) *</label>
                <input
                  {...register('price')}
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  placeholder="0,00"
                />
                {errors.price && <p className={errorCls}>{errors.price.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Preço promocional (R$)</label>
                <input
                  {...register('salePrice')}
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </div>

          {/* Estoque */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Estoque</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Quantidade em estoque *</label>
                <input
                  {...register('stock')}
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="0"
                />
                {errors.stock && <p className={errorCls}>{errors.stock.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Estoque mínimo</label>
                <input
                  {...register('minimumStock')}
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="0"
                />
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Alerta quando o estoque atingir esse valor
                </p>
              </div>
            </div>
          </div>

          {/* Logística */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Logística</h2>
            <div>
              <label className={labelCls}>Peso (kg)</label>
              <input
                {...register('weight')}
                type="number"
                step="0.001"
                min="0"
                className={inputCls}
                placeholder="Ex: 0.500"
              />
            </div>
            <div>
              <p className={labelCls}>Dimensões (cm)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <input
                    {...register('dimHeight')}
                    type="number"
                    step="0.1"
                    min="0"
                    className={inputCls}
                    placeholder="Altura"
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground text-center">Altura</p>
                </div>
                <div>
                  <input
                    {...register('dimWidth')}
                    type="number"
                    step="0.1"
                    min="0"
                    className={inputCls}
                    placeholder="Largura"
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground text-center">Largura</p>
                </div>
                <div>
                  <input
                    {...register('dimDepth')}
                    type="number"
                    step="0.1"
                    min="0"
                    className={inputCls}
                    placeholder="Comprimento"
                  />
                  <p className="mt-0.5 text-xs text-muted-foreground text-center">Comprimento</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column (sidebar) */}
        <div className="space-y-6">
          {/* Status */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Status</h2>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    {...register('status')}
                    type="radio"
                    value={opt.value}
                    className="accent-primary"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            {errors.status && <p className={errorCls}>{errors.status.message}</p>}
          </div>

          {/* Retirada na loja */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Retirada na Loja</h2>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                {...register('pickupAvailable')}
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium leading-tight">Disponível para retirada</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clientes poderão retirar este produto na loja sem custo de frete.
                </p>
              </div>
            </label>
          </div>

          {/* Página de Ofertas */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Página de Ofertas</h2>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                {...register('featuredOffer')}
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium leading-tight">Exibir na página de ofertas</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O percentual de desconto exibido no hero será o menor desconto entre todos os
                  produtos marcados aqui.
                </p>
              </div>
            </label>
          </div>

          {/* Categoria */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Categoria</h2>
            <select {...register('categoryId')} className={inputCls} disabled={categoriesLoading}>
              <option value="">
                {categoriesLoading
                  ? 'Carregando categorias...'
                  : categoriesError
                    ? 'Erro ao carregar categorias'
                    : 'Sem categoria'}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categoriesError && (
              <p className="mt-1 text-xs text-destructive">
                Não foi possível carregar as categorias. Verifique a conexão com a API.
              </p>
            )}
            {!categoriesLoading && !categoriesError && categories.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhuma categoria cadastrada.{' '}
                <a href="/admin/categorias" className="underline">
                  Criar categoria
                </a>
              </p>
            )}
          </div>

          {/* NCM */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">NCM</h2>
            <div>
              <label className={labelCls}>Código NCM</label>
              <input
                {...register('ncm')}
                className={inputCls}
                placeholder="Preenchido automaticamente"
                maxLength={20}
              />
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buscado pelo nome do produto ou herdado da categoria
              </p>
            </div>
            <div className="relative">
              <label className={labelCls}>Buscar NCM manualmente</label>
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={ncmQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setNcmQuery(q);
                    if (ncmDebounce.current) clearTimeout(ncmDebounce.current);
                    if (q.length < 3) {
                      setNcmResults([]);
                      return;
                    }
                    ncmDebounce.current = setTimeout(async () => {
                      setNcmSearching(true);
                      try {
                        const res = await fetch(
                          `https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(q)}`,
                        );
                        if (res.ok) setNcmResults((await res.json()).slice(0, 8));
                      } finally {
                        setNcmSearching(false);
                      }
                    }, 400);
                  }}
                  className={`${inputCls} pl-8`}
                  placeholder="Ex: escape, capacete, motor..."
                />
                {ncmSearching && (
                  <Loader2 className="absolute right-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
              {ncmResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
                  {ncmResults.map((r) => (
                    <li key={r.codigo}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                        onClick={() => {
                          setValue('ncm', r.codigo);
                          setNcmQuery('');
                          setNcmResults([]);
                        }}
                      >
                        <span className="font-mono font-medium">{r.codigo}</span>
                        <span className="ml-2 text-muted-foreground line-clamp-1">
                          {r.descricao}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Fiscal */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Dados Fiscais (NF-e)</h2>
            <div>
              <label className={labelCls}>Origem</label>
              <select {...register('origem')} className={inputCls}>
                <option value={0}>0 – Nacional</option>
                <option value={1}>1 – Estrangeira (importação direta)</option>
                <option value={2}>2 – Estrangeira (mercado interno)</option>
                <option value={3}>3 – Nacional (import. &gt; 40% e ≤ 70%)</option>
                <option value={4}>4 – Nacional (processo básico)</option>
                <option value={5}>5 – Nacional (import. ≤ 40%)</option>
                <option value={6}>6 – Estrangeira direta s/ similar nacional</option>
                <option value={7}>7 – Estrangeira interna s/ similar nacional</option>
                <option value={8}>8 – Nacional (import. &gt; 70%)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>CSOSN / CST</label>
              <select {...register('cstCsosn')} className={inputCls}>
                <optgroup label="Simples Nacional (CSOSN)">
                  <option value="102">102 – Tributada SN s/ crédito (padrão)</option>
                  <option value="103">103 – Isenção SN (faixa de receita)</option>
                  <option value="300">300 – Imune</option>
                  <option value="400">400 – Não tributada pelo SN</option>
                  <option value="500">500 – ICMS por substituição tributária</option>
                  <option value="900">900 – Outros (SN)</option>
                </optgroup>
                <optgroup label="Regime Normal (CST)">
                  <option value="00">00 – Tributada integralmente</option>
                  <option value="10">10 – Trib. + cobrança ST</option>
                  <option value="20">20 – Com redução de base</option>
                  <option value="40">40 – Isenta</option>
                  <option value="41">41 – Não tributada</option>
                  <option value="60">60 – ICMS cobrado p/ ST</option>
                </optgroup>
              </select>
              <p className="mt-0.5 text-xs text-muted-foreground">
                CFOP definido automaticamente: 5102 (mesmo estado / retirada) ou 6102 (outro estado)
              </p>
            </div>
          </div>

          {/* SEO */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">SEO</h2>
            <div>
              <label className={labelCls}>Meta Title</label>
              <input
                {...register('metaTitle')}
                className={inputCls}
                placeholder="Título para mecanismos de busca"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">Máx. 200 caracteres</p>
            </div>
            <div>
              <label className={labelCls}>Meta Description</label>
              <textarea
                {...register('metaDescription')}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Descrição para mecanismos de busca"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">Máx. 500 caracteres</p>
            </div>
          </div>

          {/* WhatsApp Marketing */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold">Marketing WhatsApp</h2>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={autoPublishWhatsapp}
                onChange={(e) => setAutoPublishWhatsapp(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium leading-tight">Publicar automaticamente</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envia para os grupos quando o produto for ativado.
                </p>
              </div>
            </label>

            {autoPublishWhatsapp && (
              <div className="mt-1 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Grupos</p>
                {whatsappGroups.filter((g) => g.active).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum grupo ativo.{' '}
                    <a href="/admin/whatsapp" className="underline hover:text-foreground">
                      Cadastrar grupo
                    </a>
                  </p>
                ) : (
                  whatsappGroups
                    .filter((g) => g.active)
                    .map((g) => (
                      <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={whatsappGroupIds.includes(g.id)}
                          onChange={(e) =>
                            setWhatsappGroupIds((prev) =>
                              e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                            )
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">{g.name}</span>
                      </label>
                    ))
                )}
              </div>
            )}
          </div>

          {/* Salvar (secondary) */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-colors"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Salvando...' : 'Salvar produto'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ProductFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-muted" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
