'use client';

import Link from 'next/link';
import { ShoppingBag, MapPin, User, CreditCard, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const SECTIONS = [
  {
    href: '/pedidos',
    label: 'Meus Pedidos',
    icon: ShoppingBag,
    description: 'Acompanhe seus pedidos',
  },
  {
    href: '/cliente/enderecos',
    label: 'Endereços',
    icon: MapPin,
    description: 'Gerencie seus endereços',
  },
  { href: '/cliente/perfil', label: 'Perfil', icon: User, description: 'Seus dados pessoais' },
  {
    href: '/cliente/pagamentos',
    label: 'Pagamentos',
    icon: CreditCard,
    description: 'Métodos de pagamento',
  },
  {
    href: '/cliente/rastreamento',
    label: 'Rastreamento',
    icon: Truck,
    description: 'Rastreie suas entregas',
  },
];

export default function ClienteDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Olá, {user?.name?.split(' ')[0] ?? 'cliente'}</h1>
        <p className="text-sm text-muted-foreground">O que você gostaria de acessar?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, label, icon: Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:bg-muted/40 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
