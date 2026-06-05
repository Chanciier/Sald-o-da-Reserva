'use client';

import { Ticket } from 'lucide-react';

export default function AdminCupons() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Ticket className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">Cupons</h1>
      <p className="text-muted-foreground max-w-sm">Em construção.</p>
    </div>
  );
}
