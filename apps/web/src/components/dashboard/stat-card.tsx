import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  highlight?: boolean;
}

export function StatCard({ label, value, icon, description, highlight }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        highlight ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-medium uppercase tracking-wide ${
              highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {description && (
            <p
              className={`mt-0.5 text-xs ${
                highlight ? 'text-primary-foreground/60' : 'text-muted-foreground'
              }`}
            >
              {description}
            </p>
          )}
        </div>
        <div className={`rounded-lg p-2 ${highlight ? 'bg-primary-foreground/10' : 'bg-muted'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
