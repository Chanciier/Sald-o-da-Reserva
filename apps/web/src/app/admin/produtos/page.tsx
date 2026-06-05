'use client';

import { Package } from 'lucide-react';

export default function AdminProdutos() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Package className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">Gestão de Produtos</h1>
      <p className="text-muted-foreground max-w-sm">
        Em construção. Em breve você poderá gerenciar produtos, estoque e preços por aqui.
      </p>
    </div>
  );
}
