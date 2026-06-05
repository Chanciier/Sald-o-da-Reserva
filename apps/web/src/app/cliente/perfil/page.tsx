'use client';

import { User } from 'lucide-react';

export default function ClientePerfil() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <User className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">Meu Perfil</h1>
      <p className="text-muted-foreground max-w-sm">Em construção.</p>
    </div>
  );
}
