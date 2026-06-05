import type { ChartPoint } from '@/actions/analytics';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

interface BarChartProps {
  data: ChartPoint[];
}

export function BarChart({ data }: BarChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Sem dados no período
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40">
        {data.map((d) => {
          const pct = Math.max((d.revenue / maxRevenue) * 100, 2);
          return (
            <div
              key={d.date}
              className="group relative flex-1 flex flex-col justify-end"
              style={{ height: '100%' }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 whitespace-nowrap rounded-md bg-popover text-popover-foreground border text-xs px-2 py-1 shadow">
                <p className="font-medium">{fmt(d.revenue)}</p>
                <p className="text-muted-foreground">
                  {d.orders} pedido{d.orders !== 1 ? 's' : ''}
                </p>
              </div>
              <div
                className="w-full rounded-t bg-primary/80 hover:bg-primary transition-colors"
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* x-axis labels — show only first, mid, last */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-0">
        <span>
          {data[0]
            ? new Date(data[0].date).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })
            : ''}
        </span>
        <span>
          {data[Math.floor(data.length / 2)]
            ? new Date(data[Math.floor(data.length / 2)].date).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })
            : ''}
        </span>
        <span>
          {data[data.length - 1]
            ? new Date(data[data.length - 1].date).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })
            : ''}
        </span>
      </div>
    </div>
  );
}
