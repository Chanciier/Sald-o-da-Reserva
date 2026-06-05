'use client';

import { Users } from 'lucide-react';

export default function AdminUsuarios() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">Usuários</h1>
      <p className="text-muted-foreground max-w-sm">Em construção.</p>
    </div>
  );
}
