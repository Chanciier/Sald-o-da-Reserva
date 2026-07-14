'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { AnalyticsResponse } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PERIODS = [7, 30, 90] as const;
const SOURCE_LABEL: Record<string, string> = {
  REALTIME: 'Tempo real',
  SYNC_INFERRED: 'Sync inferida',
};

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AnalyticsSection({ token }: { token: string }) {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['community-analytics', days],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/community/admin/analytics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar analytics');
      return res.json() as Promise<AnalyticsResponse>;
    },
  });

  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.accesses) ?? []));
  const maxGroup = Math.max(1, ...(data?.byGroup.map((g) => g.redirects) ?? []));
  const maxMemberDay = Math.max(1, ...(data?.byDay.map((d) => Math.max(d.joins, d.leaves)) ?? []));

  // Último snapshot de cada grupo dentro do período (crescimento).
  const growthByGroup = new Map<string, { name: string; first: number; last: number }>();
  for (const s of data?.growth ?? []) {
    const row = growthByGroup.get(s.groupId);
    if (!row) {
      growthByGroup.set(s.groupId, { name: s.name, first: s.participants, last: s.participants });
    } else {
      row.last = s.participants;
    }
  }

  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Analytics do link único</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                days === p ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold">{data.totals.accesses}</p>
              <p className="text-xs text-gray-500">Acessos ao /grupos</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold text-green-600">{data.totals.redirected}</p>
              <p className="text-xs text-gray-500">Redirecionados</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold text-amber-600">{data.totals.allFull}</p>
              <p className="text-xs text-gray-500">Caíram em &quot;lotado&quot;</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold text-emerald-600">{data.totals.joins}</p>
              <p className="text-xs text-gray-500">Entradas reais</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-2xl font-bold text-rose-600">{data.totals.leaves}</p>
              <p className="text-xs text-gray-500">Saidas</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p
                className={`text-2xl font-bold ${
                  data.totals.netMembers >= 0 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {data.totals.netMembers >= 0 ? '+' : ''}
                {data.totals.netMembers}
              </p>
              <p className="text-xs text-gray-500">Saldo no periodo</p>
            </div>
          </div>

          {data.byDay.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Acessos por dia</h3>
              <div className="space-y-1.5">
                {data.byDay.slice(-14).map((d) => (
                  <div key={d.date} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 text-gray-500">
                      {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                    </span>
                    <Bar value={d.accesses} max={maxDay} className="bg-emerald-500" />
                    <span className="w-8 shrink-0 text-right font-medium">{d.accesses}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.byDay.some((d) => d.joins > 0 || d.leaves > 0) && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Entradas e saidas por dia</h3>
              <div className="space-y-2">
                {data.byDay.slice(-14).map((d) => (
                  <div
                    key={`members-${d.date}`}
                    className="grid grid-cols-[5rem_1fr_2.5rem] gap-3 text-xs"
                  >
                    <span className="text-gray-500">
                      {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                    </span>
                    <div className="space-y-1">
                      <Bar value={d.joins} max={maxMemberDay} className="bg-emerald-500" />
                      <Bar value={d.leaves} max={maxMemberDay} className="bg-rose-500" />
                    </div>
                    <span
                      className={`text-right font-medium ${
                        d.netMembers >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {d.netMembers >= 0 ? '+' : ''}
                      {d.netMembers}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.byGroup.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                Redirecionamentos por grupo
              </h3>
              <div className="space-y-1.5">
                {data.byGroup.map((g) => (
                  <div key={g.groupId} className="flex items-center gap-3 text-xs">
                    <span className="w-40 shrink-0 truncate text-gray-600">{g.name}</span>
                    <Bar value={g.redirects} max={maxGroup} className="bg-sky-500" />
                    <span className="w-8 shrink-0 text-right font-medium">{g.redirects}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.membersByGroup.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                Entradas e saidas por grupo
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1.5 font-medium">Grupo</th>
                    <th className="py-1.5 text-right font-medium">Entradas</th>
                    <th className="py-1.5 text-right font-medium">Saidas</th>
                    <th className="py-1.5 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.membersByGroup.map((g) => (
                    <tr key={g.groupId} className="border-b last:border-0">
                      <td className="max-w-0 truncate py-1.5 pr-3">{g.name}</td>
                      <td className="py-1.5 text-right text-emerald-600">{g.joins}</td>
                      <td className="py-1.5 text-right text-rose-600">{g.leaves}</td>
                      <td
                        className={`py-1.5 text-right font-medium ${
                          g.netMembers >= 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {g.netMembers >= 0 ? '+' : ''}
                        {g.netMembers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.memberSources.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                Origem das entradas e saidas
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1.5 font-medium">Fonte</th>
                    <th className="py-1.5 text-right font-medium">Entradas</th>
                    <th className="py-1.5 text-right font-medium">Saidas</th>
                    <th className="py-1.5 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.memberSources.map((s) => (
                    <tr key={s.source} className="border-b last:border-0">
                      <td className="py-1.5">{SOURCE_LABEL[s.source] ?? s.source}</td>
                      <td className="py-1.5 text-right text-emerald-600">{s.joins}</td>
                      <td className="py-1.5 text-right text-rose-600">{s.leaves}</td>
                      <td
                        className={`py-1.5 text-right font-medium ${
                          s.netMembers >= 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {s.netMembers >= 0 ? '+' : ''}
                        {s.netMembers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.bySource.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Conversão por origem (UTM)</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1.5 font-medium">Origem</th>
                    <th className="py-1.5 text-right font-medium">Acessos</th>
                    <th className="py-1.5 text-right font-medium">Redirecionados</th>
                    <th className="py-1.5 text-right font-medium">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySource.map((s) => (
                    <tr key={s.source} className="border-b last:border-0">
                      <td className="py-1.5">{s.source}</td>
                      <td className="py-1.5 text-right">{s.accesses}</td>
                      <td className="py-1.5 text-right">{s.redirected}</td>
                      <td className="py-1.5 text-right font-medium">
                        {s.accesses > 0 ? Math.round((s.redirected / s.accesses) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {growthByGroup.size > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                Crescimento dos grupos no período
              </h3>
              <div className="space-y-1.5 text-xs">
                {Array.from(growthByGroup.entries()).map(([id, g]) => {
                  const delta = g.last - g.first;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between border-b py-1.5 last:border-0"
                    >
                      <span className="truncate text-gray-600">{g.name}</span>
                      <span className="font-medium">
                        {g.first} → {g.last}{' '}
                        <span className={delta >= 0 ? 'text-green-600' : 'text-red-500'}>
                          ({delta >= 0 ? '+' : ''}
                          {delta})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.totals.accesses === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">
              Nenhum acesso registrado no período. Divulgue o link único{' '}
              <span className="font-mono">/grupos</span> para começar a medir.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
