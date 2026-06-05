import type { RecentOrder } from '@/actions/analytics';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PAID: 'Pago',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SHIPPED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REFUNDED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

interface OrdersTableProps {
  orders: RecentOrder[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  if (!orders.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido encontrado</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Pedido</th>
            <th className="pb-2 pr-4 font-medium">Cliente</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Itens</th>
            <th className="pb-2 pr-4 font-medium text-right">Total</th>
            <th className="pb-2 font-medium">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2.5 pr-4">
                <a
                  href={`/pedidos/${o.id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  #{o.id.slice(-8).toUpperCase()}
                </a>
              </td>
              <td className="py-2.5 pr-4">
                <p className="font-medium leading-tight">{o.user?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{o.user?.email}</p>
              </td>
              <td className="py-2.5 pr-4">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">{o.itemCount}</td>
              <td className="py-2.5 pr-4 text-right font-medium">
                {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </td>
              <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(o.createdAt).toLocaleDateString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
