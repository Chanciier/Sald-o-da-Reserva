'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { fetchProduct, updateProduct } from '@/actions/products';
import { ProductForm, ProductFormSkeleton } from '@/components/products/product-form';
import { SectionGate } from '@/components/admin/section-gate';

export default function AdminEditarProdutoPage() {
  return (
    <SectionGate section="PRODUTOS_EDITAR">
      <AdminEditarProduto />
    </SectionGate>
  );
}

function AdminEditarProduto() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { data: product, isLoading } = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => fetchProduct(token!, id),
    enabled: !!token && !!id,
  });

  async function handleSubmit(payload: Record<string, unknown>) {
    if (!token) return;
    setError('');
    setIsSubmitting(true);
    try {
      await updateProduct(token, id, payload);
      router.push('/admin/produtos');
    } catch (err) {
      setError((err as Error).message ?? 'Erro ao atualizar produto');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <ProductFormSkeleton />;

  if (!product) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground">Produto não encontrado.</div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ProductForm
        initialData={product}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        basePath="/admin/produtos"
      />
    </div>
  );
}
