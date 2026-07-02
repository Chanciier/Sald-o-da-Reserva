'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createProduct } from '@/actions/products';
import { ProductForm } from '@/components/products/product-form';
import { SectionGate } from '@/components/admin/section-gate';

export default function AdminNovoProdutoPage() {
  return (
    <SectionGate section="PRODUTOS_CRIAR">
      <AdminNovoProduto />
    </SectionGate>
  );
}

function AdminNovoProduto() {
  const { token } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(payload: Record<string, unknown>) {
    if (!token) return;
    setError('');
    setIsSubmitting(true);
    try {
      await createProduct(token, payload);
      router.push('/admin/produtos');
    } catch (err) {
      setError((err as Error).message ?? 'Erro ao criar produto');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ProductForm onSubmit={handleSubmit} isSubmitting={isSubmitting} basePath="/admin/produtos" />
    </div>
  );
}
